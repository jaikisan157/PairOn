import {
  createContext, useContext, useRef, useState, useEffect, useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { socketService } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

// ──────────────────────────────────────────────────────────────────────────────
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

interface CallContextType {
  callStatus: CallStatus;
  callSessionId: string | null;
  callPartnerName: string | null;
  isMuted: boolean;
  callDuration: number;
  callBarPos: { x: number; y: number };
  setCallBarPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  /** Only callable from a collaboration session */
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

// ── ICE servers (Google STUN + Open Relay free TURN) ─────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

// ──────────────────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── Reactive state ──────────────────────────────────────────────────────────
  const [callStatus,      setCallStatus]      = useState<CallStatus>('idle');
  const [callSessionId,   setCallSessionId]   = useState<string | null>(null);
  const [callPartnerName, setCallPartnerName] = useState<string | null>(null);
  const [isMuted,         setIsMuted]         = useState(false);
  const [callDuration,    setCallDuration]    = useState(0);
  const [callBarPos,      setCallBarPos]      = useState({ x: 0, y: 0 });

  // ── Mutable refs (safe in closures) ────────────────────────────────────────
  const pcRef               = useRef<RTCPeerConnection | null>(null);
  const localStreamRef      = useRef<MediaStream | null>(null);
  const remoteAudioRef      = useRef<HTMLAudioElement | null>(null);
  const callTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef        = useRef<number>(0);
  const pendingOfferRef     = useRef<{ offer: RTCSessionDescriptionInit; sessionId: string } | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref-mirrors of state — safe to read inside socket closures
  // NOTE: We update these SYNCHRONOUSLY alongside their state setters
  // (NOT via useEffect) so closures always see the latest value immediately.
  const callStatusRef    = useRef<CallStatus>('idle');
  const callSessionIdRef = useRef<string | null>(null);

  // Helper to update both state + ref atomically
  const setCallStatusSync = useCallback((s: CallStatus) => {
    callStatusRef.current = s;
    setCallStatus(s);
  }, []);

  // ── Cleanup helper ──────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; remoteAudioRef.current = null; }
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    iceCandidateQueueRef.current = [];
    pendingOfferRef.current = null;
    // Reset refs synchronously before state updates so any in-flight
    // socket events see the idle state immediately
    callStatusRef.current    = 'idle';
    callSessionIdRef.current = null;
    setCallStatus('idle');
    setCallDuration(0);
    setIsMuted(false);
    setCallSessionId(null);
    setCallPartnerName(null);
    setCallBarPos({ x: 0, y: 0 });
  }, []);

  // ── endCall (exported, works from any page) ─────────────────────────────────
  const endCall = useCallback((notify = true) => {
    if (notify && callSessionIdRef.current) {
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });
    }
    cleanupCall();
  }, [cleanupCall]);

  // ── createPC ────────────────────────────────────────────────────────────────
  const createPC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate && callSessionIdRef.current)
        socketService.getSocket()?.emit('call:ice-candidate', {
          sessionId: callSessionIdRef.current,
          candidate: e.candidate,
        });
    };

    pc.ontrack = (e) => {
      // Use a dynamic Audio element — no JSX <audio> needed
      if (!remoteAudioRef.current) remoteAudioRef.current = new Audio();
      remoteAudioRef.current.srcObject = e.streams[0];
      remoteAudioRef.current.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
        endCall(false);
    };

    pcRef.current = pc;
    return pc;
  }, [endCall]);

  // ── startCall ───────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    // EDGE CASE: prevent starting if already in any call
    if (callStatusRef.current !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // ⚡ Set ref BEFORE setLocalDescription — ICE gathering starts there
      // and onicecandidate reads callSessionIdRef.current synchronously
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer); // ← ICE gathering starts, ref already set ✅

      socketService.getSocket()?.emit('call:offer', { sessionId, offer, callerName });
      setCallStatusSync('calling');
    } catch (err: any) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      pcRef.current?.close(); pcRef.current = null;
      callSessionIdRef.current = null;
      setCallSessionId(null);
      if (err.name === 'NotAllowedError')
        alert('Microphone access denied. Please allow microphone in browser settings and try again.');
      else
        alert('Could not start call: ' + err.message);
    }
  }, [createPC, setCallStatusSync]);

  // ── acceptCall ──────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current) return;
    const { offer, sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Drain any ICE candidates queued before we had a remote description
      for (const c of iceCandidateQueueRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
      }
      iceCandidateQueueRef.current = [];

      const answer = await pc.createAnswer();

      // ⚡ Set ref BEFORE setLocalDescription — ICE gathering starts there
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);

      await pc.setLocalDescription(answer); // ← ICE gathering continues, ref already set ✅
      socketService.getSocket()?.emit('call:answer', { sessionId, answer });

      setCallStatusSync('connected');
      callStartRef.current = Date.now();
      callTimerRef.current = setInterval(
        () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      cleanupCall();
    }
  }, [createPC, cleanupCall, setCallStatusSync]);

  // ── declineCall ─────────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    if (pendingOfferRef.current) {
      socketService.getSocket()?.emit('call:end', { sessionId: pendingOfferRef.current.sessionId });
      pendingOfferRef.current = null;
    }
    setCallStatus('idle');
    setCallPartnerName(null);
  }, []);

  // ── toggleMute ──────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(v => !v); }
  }, []);

  // ── Socket listeners (global — persists across page navigation) ─────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function attach() {
      const socket = socketService.getSocket();
      if (!socket) return false;

      // Incoming call offer
      socket.on('call:offer', (data: { sessionId: string; offer: RTCSessionDescriptionInit; callerName: string }) => {
        // EDGE CASE: already on a call → auto-decline the new one
        if (callStatusRef.current !== 'idle') {
          socket.emit('call:end', { sessionId: data.sessionId });
          return;
        }
        pendingOfferRef.current = { offer: data.offer, sessionId: data.sessionId };
        setCallPartnerName(data.callerName);
        setCallStatusSync('ringing');
      });

      // Caller receives the answer → set remote description and mark connected
      socket.on('call:answer', async (data: { sessionId: string; answer: RTCSessionDescriptionInit }) => {
        if (!pcRef.current) return; // No active call, ignore
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          // Drain queued ICE candidates that arrived before the answer
          for (const c of iceCandidateQueueRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
          }
          iceCandidateQueueRef.current = [];
          setCallStatusSync('connected');
          callStartRef.current = Date.now();
          callTimerRef.current = setInterval(
            () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
        } catch (_) {}
      });

      // ICE candidate — backend already routes to correct session room, no extra check needed
      socket.on('call:ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
        try {
          if (pcRef.current?.remoteDescription)
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          else
            iceCandidateQueueRef.current.push(data.candidate);
        } catch (_) {}
      });

      // Partner ended call
      socket.on('call:end', () => { cleanupCall(); });

      return true;
    }

    if (!attach()) {
      pollTimer = setInterval(() => {
        if (attach() && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      }, 300);
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      const s = socketService.getSocket();
      if (s) {
        s.removeAllListeners('call:offer');
        s.removeAllListeners('call:answer');
        s.removeAllListeners('call:ice-candidate');
        s.removeAllListeners('call:end');
      }
      endCall(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Ring / dial tones via Web Audio API (no files, no server) ──────────────
  useEffect(() => {
    const stopRing = () => {
      if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    };
    const beep = (freqs: number[], dur: number, vol = 0.08) => {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        gain.connect(ctx.destination);
        freqs.forEach(f => {
          const osc = ctx.createOscillator(); osc.frequency.value = f;
          osc.connect(gain); osc.start(); osc.stop(ctx.currentTime + dur);
        });
        setTimeout(() => ctx.close(), (dur + 0.1) * 1000);
      } catch (_) {}
    };

    if      (callStatus === 'ringing')   { beep([480, 440], 0.4); ringIntervalRef.current = setInterval(() => beep([480, 440], 0.4), 3000); }
    else if (callStatus === 'calling')   { beep([350, 440], 0.6, 0.05); ringIntervalRef.current = setInterval(() => beep([350, 440], 0.6, 0.05), 3000); }
    else if (callStatus === 'connected') { beep([880], 0.15, 0.06); stopRing(); }
    else                                 { stopRing(); }

    return stopRing;
  }, [callStatus]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => { endCall(false); }, [endCall]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <CallContext.Provider value={{
      callStatus, callSessionId, callPartnerName, isMuted, callDuration,
      callBarPos, setCallBarPos,
      startCall, acceptCall, declineCall, endCall, toggleMute,
    }}>
      {children}
    </CallContext.Provider>
  );
}
