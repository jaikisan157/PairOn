/**
 * CallContext — global voice call state.
 *
 * Lives at the App level so calls persist across page navigation.
 * WebRTC peer connection + audio stream survive route changes.
 *
 * v2 — Robust reconnection, ICE restart, connection quality monitoring,
 *       mobile speaker fallback, longer ringing timeout.
 */
import {
  createContext, useContext, useRef, useState, useEffect, useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { socketService } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'reconnecting';

interface CallContextType {
  callStatus: CallStatus;
  callSessionId: string | null;
  callPartnerName: string | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  callDuration: number;
  callBarPos: { x: number; y: number };
  setCallBarPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  startCall: (sessionId: string, partnerName: string, callerName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: (notify?: boolean) => void;
  toggleMute: () => void;
  toggleSpeaker: () => Promise<void>;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

// ── ICE servers — multiple STUN + TURN for NAT traversal ──────────────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Free relay TURN servers (metered.ca open relay project)
  { urls: 'turn:standard.relay.metered.ca:80',               username: 'e19c76b62dfa42c8c0adb455', credential: '2yl3txCfWQW+MCUD' },
  { urls: 'turn:standard.relay.metered.ca:80?transport=tcp',  username: 'e19c76b62dfa42c8c0adb455', credential: '2yl3txCfWQW+MCUD' },
  { urls: 'turn:standard.relay.metered.ca:443',              username: 'e19c76b62dfa42c8c0adb455', credential: '2yl3txCfWQW+MCUD' },
  { urls: 'turn:standard.relay.metered.ca:443?transport=tcp', username: 'e19c76b62dfa42c8c0adb455', credential: '2yl3txCfWQW+MCUD' },
  { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'e19c76b62dfa42c8c0adb455', credential: '2yl3txCfWQW+MCUD' },
];

const MAX_RECONNECT_ATTEMPTS = 5;
const RINGING_TIMEOUT_MS = 45_000; // 45 seconds before auto-decline
const CALLING_TIMEOUT_MS = 45_000; // 45 seconds before auto-cancel outgoing

// ─────────────────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── State — restore from sessionStorage if page was refreshed during a call ──
  const [callStatus,      setCallStatus]      = useState<CallStatus>(() => {
    const saved = sessionStorage.getItem('pairon_call');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.status === 'connected' || s.status === 'reconnecting') return 'reconnecting';
      } catch {}
    }
    return 'idle';
  });
  const [callSessionId,   setCallSessionId]   = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.sessionId ?? null; } catch { return null; }
  });
  const [callPartnerName, setCallPartnerName] = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.partnerName ?? null; } catch { return null; }
  });
  const [isMuted,         setIsMuted]         = useState(false);
  const [isSpeakerOn,     setIsSpeakerOn]     = useState(false);
  const [callDuration,    setCallDuration]    = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.duration ?? 0; } catch { return 0; }
  });
  const [callBarPos,      setCallBarPos]      = useState({ x: 0, y: 0 });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pcRef               = useRef<RTCPeerConnection | null>(null);
  const localStreamRef      = useRef<MediaStream | null>(null);
  const callTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef        = useRef<number>(0);
  const pendingOfferRef     = useRef<{ offer: RTCSessionDescriptionInit; sessionId: string } | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStatusRef       = useRef<CallStatus>(callStatus); // sync with initial restored state
  const callSessionIdRef    = useRef<string | null>(callSessionId);
  const audioCtxRef         = useRef<AudioContext | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringingTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callingTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callerNameRef       = useRef<string>('');
  const partnerNameRef      = useRef<string>('');
  const attemptReconnectRef = useRef<(pc: RTCPeerConnection) => void>(() => {});

  // Keep ref mirrors in sync
  useEffect(() => { callStatusRef.current    = callStatus;    }, [callStatus]);
  useEffect(() => { callSessionIdRef.current = callSessionId; }, [callSessionId]);

  // Persist call state to sessionStorage so UI survives refresh
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'reconnecting') {
      sessionStorage.setItem('pairon_call', JSON.stringify({
        status: callStatus, sessionId: callSessionId, partnerName: callPartnerName,
        duration: callDuration, startTimestamp: callStartRef.current || Date.now(),
      }));
    } else if (callStatus === 'idle') {
      sessionStorage.removeItem('pairon_call');
    }
  }, [callStatus, callSessionId, callPartnerName, callDuration]);

  // ── Audio element management ──────────────────────────────────────────────
  const getRemoteAudio = (): HTMLAudioElement => {
    let el = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'pairon-call-audio';
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.volume = 1.0;
      el.muted = false;
      document.body.appendChild(el);
    }
    return el;
  };

  const unlockAudio = () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      audioCtxRef.current.resume().catch(() => {});
    } catch (_) {}
    const audio = getRemoteAudio();
    audio.load();
  };

  // ── Speaker toggle ────────────────────────────────────────────────────────
  const toggleSpeaker = useCallback(async () => {
    const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (!audio) return;

    const next = !isSpeakerOn;

    // setSinkId is supported on Chrome/Edge desktop
    if (typeof (audio as any).setSinkId === 'function') {
      try {
        if (next) {
          // Speaker ON: route to default communications output (speakerphone)
          // '' = browser default output = system speaker on most platforms
          await (audio as any).setSinkId('');
          audio.volume = 1.0;
        } else {
          // Speaker OFF: try to find a non-speaker output (earpiece / headset)
          const devices = await navigator.mediaDevices.enumerateDevices();
          const earpiece = devices.find(
            d => d.kind === 'audiooutput' &&
            (d.label.toLowerCase().includes('ear') ||
             d.label.toLowerCase().includes('handset') ||
             d.label.toLowerCase().includes('built-in'))
          );
          await (audio as any).setSinkId(earpiece?.deviceId ?? 'default');
          audio.volume = 0.9;
        }
        setIsSpeakerOn(next);
      } catch (err) {
        console.warn('[Call] setSinkId failed:', err);
        setIsSpeakerOn(next);
      }
    } else {
      // Mobile (iOS/Android): setSinkId not supported
      // The user must use OS volume buttons. Just toggle the UI state.
      audio.volume = next ? 1.0 : 0.8;
      setIsSpeakerOn(next);
    }
  }, [isSpeakerOn]);

  // ── Mobile volume-based speaker simulation ─────────────────────────────────
  // On mobile, setSinkId doesn't work so we simulate earpiece/speaker via volume.
  useEffect(() => {
    const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (audio) {
      audio.volume = isSpeakerOn ? 1.0 : 0.3;
    }
  }, [isSpeakerOn]);

  // ── Cleanup all call resources ────────────────────────────────────────────
  const fullCleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    // Detach event handlers before closing to prevent 'closed' from re-triggering cleanup
    if (pcRef.current) {
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (audio) { audio.srcObject = null; audio.remove(); }

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
    callingTimeoutRef.current = null;

    iceCandidateQueueRef.current = [];
    pendingOfferRef.current = null;
    reconnectAttemptsRef.current = 0;
  }, []);

  const endCall = useCallback((notify = true) => {
    if (notify && callSessionIdRef.current)
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });

    fullCleanup();
    sessionStorage.removeItem('pairon_call');

    setCallStatus('idle');
    callStatusRef.current = 'idle';
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setCallSessionId(null);
    setCallPartnerName(null);
    setCallBarPos({ x: 0, y: 0 });
  }, [fullCleanup]);

  // ── setupRemoteAudioPlayback — reliably play remote stream ────────────────
  const setupRemoteAudioPlayback = useCallback((stream: MediaStream) => {
    const tracks = stream.getAudioTracks();
    console.log('[Call] Setting up remote audio. Tracks:', tracks.length,
      tracks.map(t => `${t.id.slice(0,8)} enabled:${t.enabled} muted:${t.muted}`).join(', '));

    const audio = getRemoteAudio();
    audio.srcObject = stream;
    audio.volume = 1.0;
    audio.muted = false;

    const tryPlay = () => {
      audio.play()
        .then(() => console.log('[Call] ✅ Remote audio playing'))
        .catch((err) => {
          console.warn('[Call] ⚠️ Audio play failed:', err.message);
          let attempts = 0;
          const retryTimer = setInterval(() => {
            attempts++;
            audio.play()
              .then(() => { console.log('[Call] ✅ Audio playing after retry', attempts); clearInterval(retryTimer); })
              .catch(() => { if (attempts > 30) clearInterval(retryTimer); });
          }, 500);
          const resume = () => { audio.play().catch(() => {}); clearInterval(retryTimer); };
          document.addEventListener('click',      resume, { once: true });
          document.addEventListener('touchstart', resume, { once: true });
        });
    };

    // Listen for any track becoming active and retry play
    tracks.forEach(track => {
      if (track.muted) {
        track.addEventListener('unmute', () => {
          console.log('[Call] Track unmuted, retrying play');
          tryPlay();
        }, { once: true });
      }
    });

    tryPlay();
  }, []);

  // ── startCallTimer ────────────────────────────────────────────────────────
  const startCallTimer = useCallback(() => {
    callStartRef.current = Date.now();
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(
      () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
  }, []);

  // ── createPC — create RTCPeerConnection with robust event handling ────────
  const createPC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10, // Pre-gather candidates for faster connection
    });

    pc.onicecandidate = (e) => {
      if (e.candidate && callSessionIdRef.current) {
        console.log('[Call] Sending ICE candidate:', e.candidate.type, e.candidate.protocol);
        socketService.getSocket()?.emit('call:ice-candidate', {
          sessionId: callSessionIdRef.current,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      console.log('[Call] 🎵 ontrack fired! kind:', e.track.kind, 'muted:', e.track.muted, 'streams:', e.streams?.length);
      const stream = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);

      if (!e.track.muted) {
        // Track already live — play immediately
        setupRemoteAudioPlayback(stream);
      } else {
        // Track muted at this point (normal) — wait for unmute before playing
        console.log('[Call] Track is muted, waiting for unmute...');
        e.track.addEventListener('unmute', () => {
          console.log('[Call] 🔊 Track unmuted — starting audio playback');
          setupRemoteAudioPlayback(stream);
        }, { once: true });
        // Also set it up now so the srcObject is ready; play will succeed once data flows
        setupRemoteAudioPlayback(stream);
      }
    };

    // ── ICE connection state — handles reconnection ──────────────────────
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] ICE connection state:', state);

      if (state === 'connected' || state === 'completed') {
        // Successfully connected/reconnected
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
        if (callStatusRef.current === 'reconnecting') {
          setCallStatus('connected');
          callStatusRef.current = 'connected';
          // Resume timer from where we left off
          if (!callTimerRef.current) startCallTimer();
        }
      }

      if (state === 'disconnected') {
        // Temporary disconnection — attempt ICE restart after short delay
        // (ICE can often recover on its own within a few seconds)
        console.log('[Call] ICE disconnected — will attempt restart in 3s if not recovered');
        if (callStatusRef.current === 'connected') {
          setCallStatus('reconnecting');
          callStatusRef.current = 'reconnecting';
        }
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' && callStatusRef.current === 'reconnecting') {
            attemptReconnectRef.current(pc);
          }
        }, 3000);
      }

      if (state === 'failed') {
        // ICE negotiation failed — immediate reconnection attempt
        console.log('[Call] ICE failed — attempting reconnect');
        if (callStatusRef.current === 'connected' || callStatusRef.current === 'reconnecting') {
          setCallStatus('reconnecting');
          callStatusRef.current = 'reconnecting';
          attemptReconnectRef.current(pc);
        } else {
          // Failed during initial connection — end call
          endCall(true);
        }
      }

      if (state === 'closed') {
        // Only end if we're not already cleaning up
        if (callStatusRef.current !== 'idle') {
          endCall(false);
        }
      }
    };

    pcRef.current = pc;
    return pc;
  }, [endCall, setupRemoteAudioPlayback, startCallTimer]);

  // ── attemptReconnect — ICE restart with exponential backoff ────────────────
  const attemptReconnect = useCallback(async (pc: RTCPeerConnection) => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Call] Max reconnection attempts reached — ending call');
      endCall(true);
      return;
    }

    reconnectAttemptsRef.current++;
    const attempt = reconnectAttemptsRef.current;
    console.log(`[Call] Reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);

    try {
      // ICE restart — create new offer with iceRestart flag
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      socketService.getSocket()?.emit('call:offer', {
        sessionId: callSessionIdRef.current,
        offer,
        callerName: callerNameRef.current,
        isReconnect: true,
      });

      // Wait for answer with timeout
      const backoffMs = Math.min(5000 * Math.pow(1.5, attempt - 1), 15000);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (callStatusRef.current === 'reconnecting' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
          // Still not reconnected — try again
          attemptReconnect(pc);
        }
      }, backoffMs);
    } catch (err) {
      console.error('[Call] Reconnection attempt failed:', err);
      // Try again after backoff
      const backoffMs = Math.min(3000 * Math.pow(1.5, attempt - 1), 12000);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (callStatusRef.current === 'reconnecting') attemptReconnect(pc);
      }, backoffMs);
    }
  }, [endCall]);

  // Keep ref updated
  useEffect(() => { attemptReconnectRef.current = attemptReconnect; }, [attemptReconnect]);

  // ── startCall ────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    unlockAudio();
    callerNameRef.current = callerName;
    partnerNameRef.current = partnerName;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketService.getSocket()?.emit('call:offer', { sessionId, offer, callerName });
      setCallStatus('calling');
      callStatusRef.current = 'calling';

      // Auto-cancel outgoing call after timeout
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') {
          console.log('[Call] Outgoing call timed out');
          endCall(true);
        }
      }, CALLING_TIMEOUT_MS);
    } catch (err: any) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close(); pcRef.current = null;
      callSessionIdRef.current = null;
      setCallSessionId(null);
      if (err.name === 'NotAllowedError')
        alert('Microphone blocked. Allow microphone access in your browser and try again.');
      else
        alert('Could not start call: ' + err.message);
    }
  }, [createPC, endCall]);

  // ── acceptCall ───────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    unlockAudio();
    const { offer, sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;

    // Clear ringing timeout
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process queued ICE candidates
      for (const c of iceCandidateQueueRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
      }
      iceCandidateQueueRef.current = [];

      const answer = await pc.createAnswer();

      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);

      await pc.setLocalDescription(answer);

      socketService.getSocket()?.emit('call:answer', { sessionId, answer });

      setCallStatus('connected');
      callStatusRef.current = 'connected';
      startCallTimer();
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle');
      callStatusRef.current = 'idle';
    }
  }, [createPC, startCallTimer]);

  // ── declineCall ──────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    const sessionId = pendingOfferRef.current?.sessionId ?? callSessionIdRef.current;
    pendingOfferRef.current = null;
    iceCandidateQueueRef.current = [];
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }
    if (sessionId)
      socketService.getSocket()?.emit('call:end', { sessionId });
    setCallStatus('idle');
    callStatusRef.current = 'idle';
    setCallPartnerName(null);
    setCallSessionId(null);
    callSessionIdRef.current = null;
  }, []);

  // ── toggleMute ───────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  // ── Socket listeners — attached once when authenticated ──────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    getRemoteAudio();

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function attach() {
      const socket = socketService.getSocket();
      if (!socket) return false;

      // Incoming call offer
      socket.on('call:offer', (data: { sessionId: string; offer: RTCSessionDescriptionInit; callerName: string; isReconnect?: boolean }) => {
        // ── Reconnect offer — handle silently (no ringing UI for partner) ──
        if (data.isReconnect) {
          (async () => {
            try {
              // Set reconnecting state
              setCallStatus('reconnecting');
              callStatusRef.current = 'reconnecting';
              setCallSessionId(data.sessionId);
              callSessionIdRef.current = data.sessionId;
              setCallPartnerName(data.callerName);
              partnerNameRef.current = data.callerName;

              // Unlock audio for mobile browsers
              unlockAudio();

              // Clean up old PC safely (detach handlers to prevent 'closed' from calling endCall)
              if (pcRef.current) {
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.onicecandidate = null;
                pcRef.current.ontrack = null;
                pcRef.current.close();
                pcRef.current = null;
              }

              // Get fresh audio stream
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              localStreamRef.current = stream;

              // Create new peer connection and add tracks
              const pc = createPC();
              stream.getTracks().forEach(t => pc.addTrack(t, stream));

              // Set the remote offer and create answer
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('call:answer', { sessionId: data.sessionId, answer });

              // Drain any queued ICE candidates
              for (const c of iceCandidateQueueRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              iceCandidateQueueRef.current = [];
            } catch (err) {
              console.error('[Call] Error handling reconnect offer:', err);
              endCall(false);
            }
          })();
          return;
        }

        if (callStatusRef.current !== 'idle') {
          // If we're already ringing or in a call for THIS session, just ignore the duplicate
          if (callSessionIdRef.current === data.sessionId) return;
          // For a DIFFERENT session, silently ignore (don't emit call:end which kills the original call)
          return;
        }
        pendingOfferRef.current = { offer: data.offer, sessionId: data.sessionId };
        callSessionIdRef.current = data.sessionId;
        setCallSessionId(data.sessionId);
        setCallPartnerName(data.callerName);
        setCallStatus('ringing');
        callStatusRef.current = 'ringing';

        // Auto-decline after ringing timeout (so notification doesn't just "poof" away instantly)
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = setTimeout(() => {
          if (callStatusRef.current === 'ringing') {
            console.log('[Call] Ringing timed out — auto-declining');
            // Don't auto-decline — just let it ring until user interacts or caller cancels
            // The caller has their own timeout that will emit call:end
          }
        }, RINGING_TIMEOUT_MS);
      });

      // Caller gets the answer
      socket.on('call:answer', async (data: { answer: RTCSessionDescriptionInit }) => {
        try {
          if (pcRef.current && (callStatusRef.current === 'calling' || callStatusRef.current === 'reconnecting')) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            for (const c of iceCandidateQueueRef.current) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
            }
            iceCandidateQueueRef.current = [];

            // Clear calling timeout
            if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }

            if (callStatusRef.current === 'calling') {
              setCallStatus('connected');
              callStatusRef.current = 'connected';
              startCallTimer();
            } else if (callStatusRef.current === 'reconnecting') {
              // Reconnect answer received
              reconnectAttemptsRef.current = 0;
              setCallStatus('connected');
              callStatusRef.current = 'connected';
              // Resume the timer if it's not running
              if (!callTimerRef.current && callStartRef.current) {
                callTimerRef.current = setInterval(
                  () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
              }
            }
          }
        } catch (err) { console.error('[Call] Error handling answer:', err); }
      });

      // ICE candidates
      socket.on('call:ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
        try {
          if (pcRef.current?.remoteDescription)
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          else
            iceCandidateQueueRef.current.push(data.candidate);
        } catch (_) {}
      });

      // Partner ended call
      socket.on('call:end', () => {
        fullCleanup();
        sessionStorage.removeItem('pairon_call');
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        setCallDuration(0);
        setIsMuted(false);
        setIsSpeakerOn(false);
        setCallSessionId(null);
        setCallPartnerName(null);
      });

      // ── Server-managed call reconnection events ──
      // Partner disconnected (refreshed) — server tells us to show reconnecting
      socket.on('call:partner-reconnecting', (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Partner is reconnecting (server-managed)...');
        if (callSessionIdRef.current === data.sessionId || callStatusRef.current === 'connected') {
          setCallStatus('reconnecting');
          callStatusRef.current = 'reconnecting';
          // Keep the call bar visible, keep the timer running from the original start
          callStartRef.current = data.startTimestamp;
        }
      });

      // Partner reconnected — server tells us they're back, create fresh WebRTC
      socket.on('call:partner-reconnected', async (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Partner reconnected — waiting for their offer...');
        // The rejoining user will send a fresh call:offer with isReconnect=true
        // We'll handle it in the call:offer handler
        callStartRef.current = data.startTimestamp;
        setCallStatus('reconnecting');
        callStatusRef.current = 'reconnecting';
      });

      // Grace period expired — partner didn't come back in 30s
      socket.on('call:ended-by-server', (_data: { sessionId: string }) => {
        console.log('[Call] Server ended call — partner did not reconnect in time');
        fullCleanup();
        sessionStorage.removeItem('pairon_call');
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        setCallDuration(0);
        setIsMuted(false);
        setIsSpeakerOn(false);
        setCallSessionId(null);
        setCallPartnerName(null);
      });

      // Server confirmed our rejoin — we're the initiator, create WebRTC offer
      socket.on('call:rejoin-success', async (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Rejoin confirmed by server — creating WebRTC offer...');
        try {
          callStartRef.current = data.startTimestamp;
          // Restart the timer from the saved start
          if (callTimerRef.current) clearInterval(callTimerRef.current);
          callTimerRef.current = setInterval(() => {
            setCallDuration(Math.floor((Date.now() - data.startTimestamp) / 1000));
          }, 1000);

          // Unlock audio for mobile browsers
          unlockAudio();

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;

          // Clean up old PC safely (detach handlers to prevent 'closed' from calling endCall)
          if (pcRef.current) {
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.close();
            pcRef.current = null;
          }
          const pc = createPC();
          stream.getTracks().forEach(t => pc.addTrack(t, stream));

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', {
            sessionId: data.sessionId,
            offer,
            callerName: callPartnerName || 'Partner',
            isReconnect: true,
          });
        } catch (err) {
          console.error('[Call] Error creating reconnect offer:', err);
          endCall(false);
        }
      });

      // Rejoin failed — no active call on server
      socket.on('call:rejoin-failed', () => {
        console.log('[Call] Rejoin failed — no active call on server');
        fullCleanup();
        sessionStorage.removeItem('pairon_call');
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        setCallDuration(0);
        setCallSessionId(null);
        setCallPartnerName(null);
      });

      return true;
    }

    // After attaching listeners, check if we need to rejoin a call (page was refreshed)
    function checkRejoin() {
      if (callStatusRef.current !== 'reconnecting' || !callSessionIdRef.current) return;
      const savedStr = sessionStorage.getItem('pairon_call');
      const saved = savedStr ? JSON.parse(savedStr) : null;
      if (!saved) { setCallStatus('idle'); return; }

      // Show the frozen duration (don't start timer yet — it resumes on rejoin-success)
      if (saved.startTimestamp) {
        callStartRef.current = saved.startTimestamp;
        setCallDuration(Math.floor((Date.now() - saved.startTimestamp) / 1000));
      }

      const socket = socketService.getSocket();
      if (socket) {
        console.log('[Call] Emitting call:rejoin to server for session:', saved.sessionId);
        socket.emit('call:rejoin', { sessionId: saved.sessionId });
      }
    }

    if (!attach()) {
      pollTimer = setInterval(() => {
        if (attach()) {
          clearInterval(pollTimer!); pollTimer = null;
          checkRejoin(); // listeners are now attached, safe to rejoin
        }
      }, 300);
    } else {
      checkRejoin(); // listeners attached immediately, rejoin now
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      const s = socketService.getSocket();
      if (s) {
        s.removeAllListeners('call:offer');
        s.removeAllListeners('call:answer');
        s.removeAllListeners('call:ice-candidate');
        s.removeAllListeners('call:end');
        s.removeAllListeners('call:partner-reconnecting');
        s.removeAllListeners('call:partner-reconnected');
        s.removeAllListeners('call:ended-by-server');
        s.removeAllListeners('call:rejoin-success');
        s.removeAllListeners('call:rejoin-failed');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // NOTE: The old separate reconnect useEffect has been removed.
  // call:rejoin is now emitted inside attach() above, AFTER all listeners are attached.
  // This eliminates the race condition that caused rejoin to fail.

  // ── Ring / dial tones — distinctive "abc abc" style ──────────────────────
  useEffect(() => {
    const stopRing = () => {
      if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    };

    const playTone = (notes: { freq: number; start: number; dur: number }[], vol = 0.1) => {
      try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.setValueAtTime(vol, ctx.currentTime);
        master.connect(ctx.destination);

        const totalDur = Math.max(...notes.map(n => n.start + n.dur));

        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          env.gain.setValueAtTime(0, ctx.currentTime + start);
          env.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.03);
          env.gain.setValueAtTime(1, ctx.currentTime + start + dur - 0.05);
          env.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
          osc.connect(env);
          env.connect(master);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + dur);
        });

        setTimeout(() => ctx.close(), (totalDur + 0.2) * 1000);
      } catch (_) {}
    };

    // Ringing (incoming)
    const ringTone = () => playTone([
      { freq: 587, start: 0,    dur: 0.12 },
      { freq: 659, start: 0.14, dur: 0.12 },
      { freq: 784, start: 0.28, dur: 0.18 },
      { freq: 587, start: 0.55, dur: 0.12 },
      { freq: 659, start: 0.69, dur: 0.12 },
      { freq: 784, start: 0.83, dur: 0.18 },
    ], 0.12);

    // Calling (outgoing)
    const dialTone = () => playTone([
      { freq: 440, start: 0,    dur: 0.35 },
      { freq: 523, start: 0.4,  dur: 0.35 },
    ], 0.06);

    // Connected
    const connectedTone = () => playTone([
      { freq: 523, start: 0,    dur: 0.1 },
      { freq: 659, start: 0.08, dur: 0.1 },
      { freq: 784, start: 0.16, dur: 0.15 },
      { freq: 1047,start: 0.26, dur: 0.2 },
    ], 0.08);

    if (callStatus === 'ringing') {
      ringTone();
      ringIntervalRef.current = setInterval(ringTone, 2400);
    } else if (callStatus === 'calling') {
      dialTone();
      ringIntervalRef.current = setInterval(dialTone, 2400);
    } else if (callStatus === 'connected') {
      connectedTone();
      stopRing();
    } else {
      stopRing();
    }

    return stopRing;
  }, [callStatus]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => { endCall(false); }, [endCall]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CallContext.Provider value={{
      callStatus, callSessionId, callPartnerName, isMuted, isSpeakerOn, callDuration,
      callBarPos, setCallBarPos,
      startCall, acceptCall, declineCall, endCall, toggleMute, toggleSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
}
