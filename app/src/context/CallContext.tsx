/**
 * CallContext — Global WebRTC voice call (P2P, $0/month).
 *
 * KEY FIXES from previous versions:
 * 1. Audio element ATTACHED to DOM (detached elements don't play in many browsers)
 * 2. Audio element "pre-warmed" during user gesture to bypass autoplay policy
 * 3. SDP explicitly serialized as { type, sdp } plain objects
 * 4. Comprehensive logging at every step for debugging
 * 5. Proper socket listener cleanup
 */
import {
  createContext, useContext, useRef, useState, useEffect, useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { socketService } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'reconnecting';

interface CallContextType {
  callStatus: CallStatus;
  callSessionId: string | null;
  callPartnerName: string | null;
  isMuted: boolean;
  volume: number;          // 0–100
  setVolume: (v: number) => void;
  callDuration: number;
  callBarPos: { x: number; y: number };
  setCallBarPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  startCall: (sessionId: string, partnerName: string, callerName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: (notify?: boolean) => void;
  toggleMute: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

// ─── Free ICE Servers ────────────────────────────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL as string,
    username: (import.meta.env.VITE_TURN_USERNAME || '') as string,
    credential: (import.meta.env.VITE_TURN_CREDENTIAL || '') as string,
  }] : []),
];

const RINGING_TIMEOUT_MS = 45_000;
const CALLING_TIMEOUT_MS = 45_000;

/** Serialize SDP to a plain { type, sdp } object for Socket.IO */
function serializeSDP(desc: RTCSessionDescription | RTCSessionDescriptionInit): { type: string; sdp: string } {
  return { type: desc.type as string, sdp: desc.sdp as string };
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [callStatus, setCallStatus] = useState<CallStatus>(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('pairon_call') || 'null');
      if (s?.status === 'connected' || s?.status === 'reconnecting') return 'reconnecting';
    } catch {}
    return 'idle';
  });
  const [callSessionId, setCallSessionId] = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.sessionId ?? null; } catch { return null; }
  });
  const [callPartnerName, setCallPartnerName] = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.partnerName ?? null; } catch { return null; }
  });
  const [isMuted, setIsMuted] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.isMuted ?? false; } catch { return false; }
  });
  const muteRef = useRef<boolean>(false); // ref so audio callback always has latest value
  const [volume, setVolumeState] = useState(100);
  const [callDuration, setCallDuration] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.duration ?? 0; } catch { return 0; }
  });
  const [callBarPos, setCallBarPos] = useState({ x: 0, y: 0 });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const callStatusRef    = useRef<CallStatus>(callStatus);
  const callSessionIdRef = useRef<string | null>(callSessionId);
  const callerNameRef    = useRef<string>('');

  // WebRTC
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const remoteAudioRef   = useRef<HTMLAudioElement | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  // Ring beep
  const ringCtxRef       = useRef<AudioContext | null>(null);
  const ringingBeepRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timers
  const callTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef     = useRef<number>(0);
  const ringingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending incoming call
  const pendingOfferRef = useRef<{
    sessionId: string; callerName: string; offer: { type: string; sdp: string };
  } | null>(null);

  // Socket listeners registered flag
  const listenersAttachedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { callSessionIdRef.current = callSessionId; }, [callSessionId]);

  // ── Persist call state to sessionStorage (including mute) ─────────────────
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'reconnecting') {
      sessionStorage.setItem('pairon_call', JSON.stringify({
        status: callStatus, sessionId: callSessionId,
        partnerName: callPartnerName, duration: callDuration,
        startTimestamp: callStartRef.current,
        callerName: callerNameRef.current,
        isMuted: muteRef.current,
      }));
    } else if (callStatus === 'idle') {
      sessionStorage.removeItem('pairon_call');
    }
  }, [callStatus, callSessionId, callPartnerName, callDuration, isMuted]);

  // ── Create remote <audio> element IN THE DOM ──────────────────────────────
  // CRITICAL: Must be in the DOM for browsers to actually play audio.
  // A detached `new Audio()` often fails silently.
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.id = 'pairon-remote-audio';
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.style.position = 'fixed';
    audio.style.top = '-9999px';
    audio.style.left = '-9999px';
    audio.style.pointerEvents = 'none';
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;
    console.log('[Call] 🔈 Remote audio element created and attached to DOM');
    return () => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      remoteAudioRef.current = null;
    };
  }, []);

  // ── Ring beep ─────────────────────────────────────────────────────────────
  const startRingBeep = useCallback(() => {
    const beep = () => {
      try {
        if (!ringCtxRef.current || ringCtxRef.current.state === 'closed')
          ringCtxRef.current = new AudioContext();
        const ctx = ringCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 440; osc.type = 'sine';
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch {}
    };
    beep();
    ringingBeepRef.current = setInterval(beep, 1500);
  }, []);

  const stopRingBeep = useCallback(() => {
    if (ringingBeepRef.current) { clearInterval(ringingBeepRef.current); ringingBeepRef.current = null; }
    try { ringCtxRef.current?.close(); } catch {} ringCtxRef.current = null;
  }, []);

  // ── "Pre-warm" audio element (call during user gesture to bypass autoplay) ─
  const prewarmAudio = useCallback(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    // Just call play() with no src — this registers the user gesture with the browser.
    // We do NOT set audio.src or srcObject here because that would overwrite the real stream later.
    audio.play().catch(() => {
      // Will fail (no source yet) — that's fine. The gesture is registered.
      console.log('[Call] 🔓 Audio gesture registered');
    });
  }, []);

  // ── Create RTCPeerConnection ──────────────────────────────────────────────
  const createPeerConnection = useCallback((sessionId: string) => {
    // Clean up old connection
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];

    console.log('[Call] Creating RTCPeerConnection with', ICE_SERVERS.length, 'ICE servers');
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    });

    // ── ICE candidate events ──
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        console.log('[Call] 📤 Sending ICE candidate:', candidate.candidate?.substring(0, 50));
        socketService.getSocket()?.emit('call:ice-candidate', {
          sessionId, candidate,
        });
      } else {
        console.log('[Call] ICE gathering complete');
      }
    };

    pc.onicecandidateerror = (event) => {
      console.warn('[Call] ICE error:', (event as RTCPeerConnectionIceErrorEvent).errorText);
    };

    // ── Remote audio track ──
    pc.ontrack = (event) => {
      console.log('[Call] 🔊 Remote track received! streams:', event.streams.length,
        'tracks:', event.streams[0]?.getTracks().map(t => `${t.kind}:${t.readyState}`));

      const audio = remoteAudioRef.current;
      if (audio && event.streams[0]) {
        audio.srcObject = event.streams[0];
        console.log('[Call] Set srcObject on audio element');

        // Try to play — should succeed because we pre-warmed in user gesture
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.then(() => {
            console.log('[Call] ✅ Audio playing successfully!');
          }).catch((err) => {
            console.error('[Call] ❌ Audio play failed:', err.message);
            // Last resort: try again on any user click
            const retryPlay = () => {
              audio.play().then(() => {
                console.log('[Call] ✅ Audio playing after user gesture retry');
                document.removeEventListener('click', retryPlay);
              }).catch(() => {});
            };
            document.addEventListener('click', retryPlay, { once: true });
          });
        }
      } else {
        console.error('[Call] ❌ Cannot play: audio element =', !!audio, ', streams =', event.streams.length);
      }
    };

    // ── Connection state tracking ──
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] ICE connection state:', state);

      if (state === 'connected' || state === 'completed') {
        if (callStatusRef.current === 'reconnecting' || callStatusRef.current === 'calling') {
          setCallStatus('connected');
          callStatusRef.current = 'connected';
          console.log('[Call] ✅ ICE connected — P2P audio active!');
        }
      } else if (state === 'disconnected') {
        console.log('[Call] ICE disconnected — waiting for recovery...');
      } else if (state === 'failed') {
        console.log('[Call] ICE failed — attempting ICE restart');
        try {
          pc.restartIce();
          pc.createOffer({ iceRestart: true }).then((offer) => {
            pc.setLocalDescription(offer);
            socketService.getSocket()?.emit('call:offer', {
              sessionId, offer: serializeSDP(offer),
              callerName: callerNameRef.current, isRestart: true,
            });
          }).catch((err) => console.error('[Call] ICE restart offer failed:', err));
        } catch (err) {
          console.error('[Call] ICE restart failed:', err);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState);
    };

    pc.onsignalingstatechange = () => {
      console.log('[Call] Signaling state:', pc.signalingState);
    };

    pcRef.current = pc;
    return pc;
  }, []);

  // ── Add queued ICE candidates ─────────────────────────────────────────────
  const flushIceCandidates = useCallback(() => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = iceCandidateQueue.current.splice(0);
    if (queued.length > 0) console.log('[Call] Flushing', queued.length, 'queued ICE candidates');
    for (const candidate of queued) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.warn('[Call] Failed to add ICE candidate:', err.message);
      });
    }
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startCallTimer = useCallback((fromTimestamp?: number) => {
    callStartRef.current = fromTimestamp ?? Date.now();
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(
      () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
  }, []);

  // ── Full cleanup ──────────────────────────────────────────────────────────
  const fullCleanup = useCallback(() => {
    stopRingBeep();
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    iceCandidateQueue.current = [];
    if (callTimerRef.current) clearInterval(callTimerRef.current); callTimerRef.current = null;
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null;
    if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null;
    pendingOfferRef.current = null;
  }, [stopRingBeep]);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      muteRef.current = !track.enabled;
      setIsMuted(!track.enabled);
      console.log('[Call] Mute:', !track.enabled);
    }
  }, []);

  // ── setVolume (0–100, applied to remote audio element) ────────────────────
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, v));
    setVolumeState(clamped);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = clamped / 100;
    }
  }, []);

  // ── endCall ───────────────────────────────────────────────────────────────
  const endCall = useCallback((notify = true) => {
    console.log('[Call] Ending call, notify:', notify);
    if (notify && callSessionIdRef.current)
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });
    fullCleanup();
    sessionStorage.removeItem('pairon_call');
    setCallStatus('idle'); callStatusRef.current = 'idle';
    setCallDuration(0); setIsMuted(false); muteRef.current = false;
    setVolumeState(100);
    setCallSessionId(null); callSessionIdRef.current = null;
    setCallPartnerName(null); setCallBarPos({ x: 0, y: 0 });
  }, [fullCleanup]);




  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    callerNameRef.current = callerName;
    console.log('[Call] Starting call to', partnerName, 'in session', sessionId);

    // Pre-warm audio element DURING this user gesture (button click)
    prewarmAudio();

    try {
      // 1. Get microphone
      console.log('[Call] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      console.log('[Call] Microphone acquired:', stream.getAudioTracks().map(t => `${t.label} (${t.readyState})`));

      // 2. Create peer connection
      const pc = createPeerConnection(sessionId);

      // 3. Add local audio track to peer connection
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      console.log('[Call] Local tracks added to peer connection');

      // 4. Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const serializedOffer = serializeSDP(offer);
      console.log('[Call] SDP offer created, type:', serializedOffer.type, 'sdp length:', serializedOffer.sdp.length);

      // 5. Send offer via signaling
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);
      socketService.getSocket()?.emit('call:offer', {
        sessionId, offer: serializedOffer, callerName,
      });
      console.log('[Call] 📤 Offer sent via socket');

      // 6. Set status
      setCallStatus('calling'); callStatusRef.current = 'calling';

      // Timeout
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') {
          console.log('[Call] Calling timeout — no answer');
          endCall(true);
        }
      }, CALLING_TIMEOUT_MS);

      // Restore mute if it was active before refresh
      if (muteRef.current) {
        stream.getAudioTracks().forEach(t => { t.enabled = false; });
        console.log('[Call] 🔇 Mute restored after start');
      }

    } catch (err: any) {
      console.error('[Call] startCall error:', err);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (err.name === 'NotAllowedError') alert('Microphone access blocked. Allow it in browser settings.');
      else alert('Could not start call: ' + err.message);
    }
  }, [createPeerConnection, endCall, prewarmAudio]);

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    const { sessionId, offer } = pendingOfferRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }
    console.log('[Call] Accepting call for session', sessionId);

    // Pre-warm audio element DURING this user gesture (Accept button click)
    prewarmAudio();

    try {
      // 1. Get microphone
      console.log('[Call] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      console.log('[Call] Microphone acquired');

      // 2. Create peer connection
      const pc = createPeerConnection(sessionId);

      // 3. Add local audio tracks BEFORE setRemoteDescription
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      console.log('[Call] Local tracks added');

      // 4. Set remote description (the offer)
      console.log('[Call] Setting remote description (offer), sdp length:', offer.sdp?.length);
      await pc.setRemoteDescription(new RTCSessionDescription(offer as RTCSessionDescriptionInit));
      console.log('[Call] Remote description set');

      // 5. Flush queued ICE candidates
      flushIceCandidates();

      // 6. Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const serializedAnswer = serializeSDP(answer);
      console.log('[Call] SDP answer created, sdp length:', serializedAnswer.sdp.length);

      // 7. Send answer
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      socketService.getSocket()?.emit('call:answer', { sessionId, answer: serializedAnswer });
      console.log('[Call] 📤 Answer sent via socket');

      // 8. Connected — restore mute state if it was active
      setCallStatus('connected'); callStatusRef.current = 'connected';
      startCallTimer();
      if (muteRef.current) {
        stream.getAudioTracks().forEach(t => { t.enabled = false; });
        console.log('[Call] 🔇 Mute restored after accept');
      }
      console.log('[Call] ✅ Accepted — waiting for ICE to connect and audio to flow');

    } catch (err: any) {
      console.error('[Call] acceptCall error:', err);
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle'); callStatusRef.current = 'idle';
    }
  }, [createPeerConnection, flushIceCandidates, stopRingBeep, startCallTimer, prewarmAudio]);

  // ── declineCall ───────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    const sessionId = pendingOfferRef.current?.sessionId ?? callSessionIdRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }
    if (sessionId) socketService.getSocket()?.emit('call:end', { sessionId });
    setCallStatus('idle'); callStatusRef.current = 'idle';
    setCallPartnerName(null); setCallSessionId(null); callSessionIdRef.current = null;
  }, [stopRingBeep]);

  // ── Unlock remote audio on any user gesture (fallback for autoplay) ───────
  useEffect(() => {
    const unlock = () => {
      const audio = remoteAudioRef.current;
      if (audio && audio.paused && audio.srcObject) {
        console.log('[Call] Attempting audio unlock via user gesture...');
        audio.play().then(() => console.log('[Call] ✅ Audio unlocked')).catch(() => {});
      }
    };
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const removeAllCallListeners = () => {
      const s = socketService.getSocket();
      if (!s) return;
      s.off('call:offer');
      s.off('call:answer');
      s.off('call:ice-candidate');
      s.off('call:end');
      s.off('call:ended-by-server');
      s.off('call:partner-reconnecting');
      s.off('call:partner-reconnected');
      s.off('call:rejoin-success');
      s.off('call:rejoin-failed');
      listenersAttachedRef.current = false;
    };

    const attach = () => {
      const socket = socketService.getSocket();
      if (!socket || listenersAttachedRef.current) return;

      console.log('[Call] Attaching socket listeners');
      listenersAttachedRef.current = true;

      // ── Incoming call offer ──
      socket.on('call:offer', async (data: {
        sessionId: string; callerName: string; offer: { type: string; sdp: string };
        isRestart?: boolean; isReconnect?: boolean;
      }) => {
        console.log('[Call] 📥 Received call:offer', {
          sessionId: data.sessionId, isRestart: data.isRestart, isReconnect: data.isReconnect,
          callerName: data.callerName, hasOffer: !!data.offer, sdpLength: data.offer?.sdp?.length,
        });

        // ICE restart — transparent renegotiation
        if (data.isRestart && callStatusRef.current === 'connected' && pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
            flushIceCandidates();
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            socket.emit('call:answer', { sessionId: data.sessionId, answer: serializeSDP(answer) });
            console.log('[Call] ICE restart answer sent');
          } catch (err) { console.error('[Call] ICE restart failed:', err); }
          return;
        }

        // Reconnect (after page refresh) — auto-accept
        if (data.isReconnect) {
          if (callStatusRef.current !== 'reconnecting' && callStatusRef.current !== 'connected') return;
          console.log('[Call] Auto-accepting reconnect offer');
          try {
            const stream = localStreamRef.current
              ?? await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            // Restore mute after reconnect
            if (muteRef.current) {
              stream.getAudioTracks().forEach(t => { t.enabled = false; });
              console.log('[Call] 🔇 Mute restored after reconnect');
            }
            const pc = createPeerConnection(data.sessionId);
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
            flushIceCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('call:answer', { sessionId: data.sessionId, answer: serializeSDP(answer) });
            setCallStatus('connected'); callStatusRef.current = 'connected';
            console.log('[Call] ✅ Reconnect answer sent');
          } catch (err) { console.error('[Call] Reconnect accept failed:', err); }
          return;
        }

        // Normal incoming call
        if (callStatusRef.current !== 'idle') {
          console.log('[Call] Ignoring offer — not idle, current status:', callStatusRef.current);
          return;
        }
        pendingOfferRef.current = { sessionId: data.sessionId, callerName: data.callerName, offer: data.offer };
        setCallSessionId(data.sessionId); callSessionIdRef.current = data.sessionId;
        setCallPartnerName(data.callerName);
        setCallStatus('ringing'); callStatusRef.current = 'ringing';
        startRingBeep();
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = setTimeout(() => {
          if (callStatusRef.current === 'ringing') {
            stopRingBeep();
            setCallStatus('idle'); callStatusRef.current = 'idle';
            setCallPartnerName(null);
          }
        }, RINGING_TIMEOUT_MS);
      });

      // ── Answer received (caller gets this) ──
      socket.on('call:answer', async (data: { sessionId: string; answer: { type: string; sdp: string } }) => {
        console.log('[Call] 📥 Received call:answer, sdp length:', data.answer?.sdp?.length);
        const pc = pcRef.current;
        if (!pc) { console.error('[Call] No peer connection to set answer on!'); return; }
        if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit));
          flushIceCandidates();
          setCallStatus('connected'); callStatusRef.current = 'connected';
          startCallTimer();
          console.log('[Call] ✅ Connected — remote description set, waiting for audio');
        } catch (err) {
          console.error('[Call] Failed to set remote answer:', err);
        }
      });

      // ── ICE candidates ──
      socket.on('call:ice-candidate', (data: { candidate: RTCIceCandidateInit }) => {
        const pc = pcRef.current;
        if (!pc) return;
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch((err) => {
            console.warn('[Call] Failed to add ICE candidate:', err.message);
          });
        } else {
          iceCandidateQueue.current.push(data.candidate);
          console.log('[Call] 📥 ICE candidate queued (no remote desc yet), queue size:', iceCandidateQueue.current.length);
        }
      });

      // ── Partner reconnecting ──
      socket.on('call:partner-reconnecting', () => {
        if (callStatusRef.current === 'connected' || callStatusRef.current === 'reconnecting') {
          setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting';
          console.log('[Call] 🔄 Partner is reconnecting...');
        }
      });

      // ── Partner reconnected ──
      socket.on('call:partner-reconnected', (data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current !== 'reconnecting') return;
        startCallTimer(data.startTimestamp);
        console.log('[Call] ✅ Partner reconnected');
      });

      // ── Call ended ──
      socket.on('call:end', () => { console.log('[Call] Partner ended call'); endCall(false); });
      socket.on('call:ended-by-server', () => { console.log('[Call] Server ended call'); endCall(false); });
      socket.on('call:rejoin-failed', () => { console.log('[Call] Rejoin failed'); endCall(false); });

      // ── Rejoin success ──
      socket.on('call:rejoin-success', async (data: {
        sessionId: string; startTimestamp: number; partnerUserId: string;
      }) => {
        console.log('[Call] Rejoin confirmed — creating new WebRTC offer');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          // Restore mute after rejoin
          if (muteRef.current) {
            stream.getAudioTracks().forEach(t => { t.enabled = false; });
            console.log('[Call] 🔇 Mute restored after rejoin');
          }
          const pc = createPeerConnection(data.sessionId);
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', {
            sessionId: data.sessionId, offer: serializeSDP(offer),
            callerName: callerNameRef.current, isReconnect: true,
          });
          callSessionIdRef.current = data.sessionId;
          setCallSessionId(data.sessionId);
          startCallTimer(data.startTimestamp);
          console.log('[Call] 🔄 Reconnect offer sent');
        } catch (err) {
          console.error('[Call] Rejoin failed:', err);
          endCall(false);
        }
      });
    };

    // Check if we need to rejoin
    const checkRejoin = () => {
      try {
        const s = JSON.parse(sessionStorage.getItem('pairon_call') || 'null');
        if ((s?.status === 'connected' || s?.status === 'reconnecting') && s?.sessionId) {
          const socket = socketService.getSocket();
          if (socket) {
            if (s.startTimestamp) callStartRef.current = s.startTimestamp;
            setCallPartnerName(s.partnerName ?? null);
            callSessionIdRef.current = s.sessionId; setCallSessionId(s.sessionId);
            callerNameRef.current = s.callerName ?? '';
            // Restore mute state from session storage
            muteRef.current = s.isMuted ?? false;
            setIsMuted(muteRef.current);
            socket.emit('call:rejoin', { sessionId: s.sessionId });
            console.log('[Call] 🔄 Attempting rejoin for session:', s.sessionId);
          }
        }
      } catch {}
    };

    // Attach and check rejoin
    const socket = socketService.getSocket();
    if (socket?.connected) {
      attach();
      checkRejoin();
    } else {
      const onConnect = () => { attach(); checkRejoin(); };
      socket?.on('connect', onConnect);
    }

    return () => {
      removeAllCallListeners();
      const s = socketService.getSocket();
      s?.off('connect');
    };
  }, [isAuthenticated, endCall, startCallTimer, createPeerConnection,
    flushIceCandidates, startRingBeep, stopRingBeep, prewarmAudio]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CallContext.Provider value={{
      callStatus, callSessionId, callPartnerName,
      isMuted, volume, setVolume, callDuration, callBarPos, setCallBarPos,
      startCall, acceptCall, declineCall, endCall, toggleMute,
    }}>
      {children}
    </CallContext.Provider>
  );
}
