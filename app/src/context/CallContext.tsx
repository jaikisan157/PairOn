/**
 * CallContext — Global WebRTC voice call.
 *
 * Audio flows DIRECTLY between browsers (P2P via WebRTC).
 * Your server only relays tiny signaling messages (~2KB per call setup).
 * Cost: $0/month forever.
 *
 * Flow:
 *   Caller:  getUserMedia → RTCPeerConnection → createOffer → send via Socket.IO
 *   Callee:  receive offer → RTCPeerConnection → createAnswer → send via Socket.IO
 *   Both:    ontrack → play remote audio via <audio> element
 *   Refresh: sessionStorage persists state → auto-rejoin → new offer/answer exchange
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
  isSpeakerOn: boolean;
  callDuration: number;
  callBarPos: { x: number; y: number };
  setCallBarPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  startCall: (sessionId: string, partnerName: string, callerName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: (notify?: boolean) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

// ─── Free ICE Servers (no API keys, no cost) ─────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN — free forever, handles ~85% of connections
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // Optional TURN for NAT traversal fallback (~15% of connections)
  // Set VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL in .env
  // Free TURN: https://www.metered.ca/tools/openrelay/ (500GB/month free)
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL as string,
    username: (import.meta.env.VITE_TURN_USERNAME || '') as string,
    credential: (import.meta.env.VITE_TURN_CREDENTIAL || '') as string,
  }] : []),
];

const RINGING_TIMEOUT_MS = 45_000;
const CALLING_TIMEOUT_MS = 45_000;

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
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
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

  // Speaker boost (GainNode for volume > 1.0)
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const gainNodeRef      = useRef<GainNode | null>(null);
  const sourceNodeRef    = useRef<MediaStreamAudioSourceNode | null>(null);

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
    sessionId: string; callerName: string; offer: RTCSessionDescriptionInit;
  } | null>(null);

  // Keep refs in sync
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { callSessionIdRef.current = callSessionId; }, [callSessionId]);

  // ── Persist call state to sessionStorage ───────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'reconnecting') {
      sessionStorage.setItem('pairon_call', JSON.stringify({
        status: callStatus, sessionId: callSessionId,
        partnerName: callPartnerName, duration: callDuration,
        startTimestamp: callStartRef.current,
      }));
    } else if (callStatus === 'idle') {
      sessionStorage.removeItem('pairon_call');
    }
  }, [callStatus, callSessionId, callPartnerName, callDuration]);

  // ── Create remote <audio> element (once) ───────────────────────────────────
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      remoteAudioRef.current = audio;
    }
    return () => {
      remoteAudioRef.current?.pause();
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

  // ── Create RTCPeerConnection ──────────────────────────────────────────────
  const createPeerConnection = useCallback((sessionId: string) => {
    // Clean up old connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    });

    // ── ICE candidate events ──
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.getSocket()?.emit('call:ice-candidate', {
          sessionId, candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onicecandidateerror = (event) => {
      // STUN/TURN errors are usually non-fatal — other candidates may still work
      console.warn('[Call] ICE candidate error:', (event as RTCPeerConnectionIceErrorEvent).errorText);
    };

    // ── Remote audio track ──
    pc.ontrack = (event) => {
      console.log('[Call] 🔊 Remote track received');
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(() => {
          // Autoplay blocked — will resolve on user interaction
          console.warn('[Call] Autoplay blocked, waiting for user gesture');
        });
      }
    };

    // ── Connection state tracking ──
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log('[Call] ICE state:', state);

      if (state === 'connected' || state === 'completed') {
        if (callStatusRef.current === 'reconnecting' || callStatusRef.current === 'calling') {
          setCallStatus('connected');
          callStatusRef.current = 'connected';
        }
      } else if (state === 'disconnected') {
        // Temporary loss — WebRTC will try to recover automatically
        console.log('[Call] ICE disconnected — waiting for recovery...');
      } else if (state === 'failed') {
        // Try ICE restart before giving up
        console.log('[Call] ICE failed — attempting ICE restart');
        try {
          pc.restartIce();
          // Create a new offer with iceRestart
          pc.createOffer({ iceRestart: true }).then((offer) => {
            pc.setLocalDescription(offer);
            socketService.getSocket()?.emit('call:offer', {
              sessionId, offer, callerName: callerNameRef.current, isRestart: true,
            });
          }).catch(() => {});
        } catch {
          console.error('[Call] ICE restart failed');
        }
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  // ── Add queued ICE candidates ─────────────────────────────────────────────
  const flushIceCandidates = useCallback(() => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = iceCandidateQueue.current.splice(0);
    for (const candidate of queued) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
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
    // WebRTC
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.pause();
    }
    iceCandidateQueue.current = [];
    // Speaker boost cleanup
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} sourceNodeRef.current = null; }
    if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} gainNodeRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    // Timers
    if (callTimerRef.current) clearInterval(callTimerRef.current); callTimerRef.current = null;
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null;
    if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null;
    pendingOfferRef.current = null;
  }, [stopRingBeep]);

  // ── endCall ───────────────────────────────────────────────────────────────
  const endCall = useCallback((notify = true) => {
    if (notify && callSessionIdRef.current)
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });
    fullCleanup();
    sessionStorage.removeItem('pairon_call');
    setCallStatus('idle'); callStatusRef.current = 'idle';
    setCallDuration(0); setIsMuted(false); setIsSpeakerOn(false);
    setCallSessionId(null); callSessionIdRef.current = null;
    setCallPartnerName(null); setCallBarPos({ x: 0, y: 0 });
  }, [fullCleanup]);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  // ── toggleSpeaker (volume boost via GainNode) ─────────────────────────────
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(prev => {
      const next = !prev;
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(
          next ? 2.0 : 1.0, audioCtxRef.current.currentTime, 0.05);
      }
      return next;
    });
  }, []);

  // ── Setup speaker boost audio chain ───────────────────────────────────────
  const setupSpeakerChain = useCallback((remoteStream: MediaStream) => {
    try {
      // Clean up previous chain
      if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch {} }
      if (gainNodeRef.current) { try { gainNodeRef.current.disconnect(); } catch {} }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch {}
      }

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(remoteStream);
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
      gainNodeRef.current = gain;
    } catch (err) {
      console.warn('[Call] Speaker chain setup failed:', err);
    }
  }, []);

  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    callerNameRef.current = callerName;

    try {
      // 1. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 2. Create peer connection
      const pc = createPeerConnection(sessionId);

      // 3. Add local audio track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 4. Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 5. Send offer via signaling
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);
      socketService.getSocket()?.emit('call:offer', {
        sessionId, offer, callerName,
      });

      // 6. Set status
      setCallStatus('calling'); callStatusRef.current = 'calling';

      // Timeout: auto-end if not answered
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') endCall(true);
      }, CALLING_TIMEOUT_MS);

    } catch (err: any) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (err.name === 'NotAllowedError') alert('Microphone access blocked. Please allow it in browser settings.');
      else alert('Could not start call: ' + err.message);
    }
  }, [createPeerConnection, endCall]);

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    const { sessionId, offer } = pendingOfferRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }

    try {
      // 1. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 2. Create peer connection
      const pc = createPeerConnection(sessionId);

      // 3. Set remote description (the offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // 4. Add local audio track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 5. Flush queued ICE candidates
      flushIceCandidates();

      // 6. Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 7. Send answer
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      socketService.getSocket()?.emit('call:answer', { sessionId, answer });

      // 8. Connected!
      setCallStatus('connected'); callStatusRef.current = 'connected';
      startCallTimer();
      console.log('[Call] ✅ Accepted — WebRTC P2P audio active');

    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle'); callStatusRef.current = 'idle';
    }
  }, [createPeerConnection, flushIceCandidates, stopRingBeep, startCallTimer]);

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

  // ── Unlock remote audio on user gesture (needed after refresh) ────────────
  useEffect(() => {
    const unlock = () => {
      if (remoteAudioRef.current && remoteAudioRef.current.paused && remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.play().catch(() => {});
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

    const attach = () => {
      const socket = socketService.getSocket();
      if (!socket) return;

      // ── Incoming call offer ──
      socket.on('call:offer', async (data: {
        sessionId: string; callerName: string; offer: RTCSessionDescriptionInit;
        isRestart?: boolean; isReconnect?: boolean;
      }) => {
        // ICE restart from active call — handle transparently
        if (data.isRestart && callStatusRef.current === 'connected' && pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            flushIceCandidates();
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            socket.emit('call:answer', { sessionId: data.sessionId, answer });
          } catch (err) { console.error('[Call] ICE restart answer failed:', err); }
          return;
        }

        // Reconnect offer (after page refresh) — auto-accept
        if (data.isReconnect) {
          if (callStatusRef.current !== 'reconnecting' && callStatusRef.current !== 'connected') return;
          try {
            const stream = localStreamRef.current
              ?? await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            const pc = createPeerConnection(data.sessionId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            flushIceCandidates();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('call:answer', { sessionId: data.sessionId, answer });
            setCallStatus('connected'); callStatusRef.current = 'connected';
            console.log('[Call] ✅ Reconnect answer sent');
          } catch (err) { console.error('[Call] Reconnect failed:', err); }
          return;
        }

        // Normal incoming call — show ringing UI
        if (callStatusRef.current !== 'idle') return;
        pendingOfferRef.current = {
          sessionId: data.sessionId, callerName: data.callerName, offer: data.offer,
        };
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
      socket.on('call:answer', async (data: { sessionId: string; answer: RTCSessionDescriptionInit }) => {
        const pc = pcRef.current;
        if (!pc) return;
        if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          flushIceCandidates();
          setCallStatus('connected'); callStatusRef.current = 'connected';
          startCallTimer();
          console.log('[Call] ✅ Connected — WebRTC P2P audio active');
        } catch (err) {
          console.error('[Call] Failed to set remote answer:', err);
        }
      });

      // ── ICE candidates ──
      socket.on('call:ice-candidate', (data: { candidate: RTCIceCandidateInit }) => {
        const pc = pcRef.current;
        if (!pc) return;
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
        } else {
          // Queue until remote description is set
          iceCandidateQueue.current.push(data.candidate);
        }
      });

      // ── Partner reconnecting (their page refreshed) ──
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
        // The reconnecting partner will send a new offer — we'll answer in call:offer handler
      });

      // ── Call ended by partner or server ──
      socket.on('call:end', () => endCall(false));
      socket.on('call:ended-by-server', () => endCall(false));
      socket.on('call:rejoin-failed', () => endCall(false));

      // ── Rejoin success (after OUR page refresh) ──
      socket.on('call:rejoin-success', async (data: {
        sessionId: string; startTimestamp: number; partnerUserId: string;
      }) => {
        console.log('[Call] Rejoin confirmed — creating new WebRTC offer');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          const pc = createPeerConnection(data.sessionId);
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('call:offer', {
            sessionId: data.sessionId,
            offer,
            callerName: callerNameRef.current,
            isReconnect: true,
          });

          callSessionIdRef.current = data.sessionId;
          setCallSessionId(data.sessionId);
          startCallTimer(data.startTimestamp);
          // Status stays 'reconnecting' until ICE connects → switches to 'connected'
          console.log('[Call] 🔄 Reconnect offer sent, waiting for answer...');
        } catch (err) {
          console.error('[Call] Rejoin failed:', err);
          endCall(false);
        }
      });
    };

    // Check if we need to rejoin an active call (after page refresh)
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
            socket.emit('call:rejoin', { sessionId: s.sessionId });
            console.log('[Call] 🔄 Attempting rejoin for session:', s.sessionId);
          }
        }
      } catch {}
    };

    const socket = socketService.getSocket();
    if (socket?.connected) { attach(); checkRejoin(); }
    else {
      const onConnect = () => { attach(); checkRejoin(); };
      socket?.on('connect', onConnect);
      return () => { socket?.off('connect', onConnect); };
    }

    return () => {
      const s = socketService.getSocket();
      s?.off('call:offer'); s?.off('call:answer'); s?.off('call:ice-candidate');
      s?.off('call:end'); s?.off('call:partner-reconnecting'); s?.off('call:partner-reconnected');
      s?.off('call:rejoin-success'); s?.off('call:rejoin-failed'); s?.off('call:ended-by-server');
    };
  }, [isAuthenticated, endCall, startCallTimer, createPeerConnection,
    flushIceCandidates, startRingBeep, stopRingBeep, setupSpeakerChain]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CallContext.Provider value={{
      callStatus, callSessionId, callPartnerName,
      isMuted, isSpeakerOn, callDuration, callBarPos, setCallBarPos,
      startCall, acceptCall, declineCall, endCall, toggleMute, toggleSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
}
