/**
 * CallContext — global voice call state.
 *
 * This is a direct port of the original working call code from CollaborationPage.
 * No extra sessionId checks. Keep it simple — it worked before.
 */
import {
  createContext, useContext, useRef, useState, useEffect, useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { socketService } from '@/lib/socket';
import { useAuth } from '@/context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

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

// ── ICE servers ───────────────────────────────────────────────────────────────
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

// ─────────────────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [callStatus,      setCallStatus]      = useState<CallStatus>('idle');
  const [callSessionId,   setCallSessionId]   = useState<string | null>(null);
  const [callPartnerName, setCallPartnerName] = useState<string | null>(null);
  const [isMuted,         setIsMuted]         = useState(false);
  const [isSpeakerOn,     setIsSpeakerOn]     = useState(false);
  const [callDuration,    setCallDuration]    = useState(0);
  const [callBarPos,      setCallBarPos]      = useState({ x: 0, y: 0 });

  // ── Refs (same as original CollaborationPage) ─────────────────────────────
  const pcRef               = useRef<RTCPeerConnection | null>(null);
  const localStreamRef      = useRef<MediaStream | null>(null);
  const callTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef        = useRef<number>(0);
  const pendingOfferRef     = useRef<{ offer: RTCSessionDescriptionInit; sessionId: string } | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStatusRef       = useRef<CallStatus>('idle');
  const callSessionIdRef    = useRef<string | null>(null);
  // AudioContext — resumed during user gesture to unlock audio on iOS/mobile
  const audioCtxRef         = useRef<AudioContext | null>(null);

  // Keep ref mirrors in sync
  useEffect(() => { callStatusRef.current    = callStatus;    }, [callStatus]);
  useEffect(() => { callSessionIdRef.current = callSessionId; }, [callSessionId]);

  // Ensure a persistent DOM audio element exists for the remote stream
  const getRemoteAudio = (): HTMLAudioElement => {
    let el = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'pairon-call-audio';
      el.autoplay = true;
      (el as any).playsInline = true; // Required on iOS
      document.body.appendChild(el);
    }
    return el;
  };

  // Unlock audio playback on mobile — MUST be called synchronously inside a user gesture
  const unlockAudio = () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      audioCtxRef.current.resume().catch(() => {});
    } catch (_) {}
    // Also touch the audio element to unlock it on iOS
    const audio = getRemoteAudio();
    // play() on empty element will fail but touch unlocks autoplay permission
    audio.load();
  };

  // Speaker toggle — uses setSinkId on desktop, informs user on iOS
  const toggleSpeaker = useCallback(async () => {
    const audio = document.getElementById('pairon-call-audio') as any;
    if (!audio) return;
    if (typeof audio.setSinkId !== 'function') {
      // iOS Safari does not support setSinkId
      alert('Speaker switching is not supported on this browser. Use your device volume controls.');
      return;
    }
    try {
      if (isSpeakerOn) {
        await audio.setSinkId('default');
        setIsSpeakerOn(false);
      } else {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const speaker = devices.find(
          d => d.kind === 'audiooutput' &&
          (d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('external'))
        );
        await audio.setSinkId(speaker?.deviceId ?? 'default');
        setIsSpeakerOn(true);
      }
    } catch (_) {
      alert('Could not switch speaker output.');
    }
  }, [isSpeakerOn]);

  const endCall = useCallback((notify = true) => {
    if (notify && callSessionIdRef.current)
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;

    const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
    if (audio) { audio.srcObject = null; audio.remove(); }

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    iceCandidateQueueRef.current = [];
    pendingOfferRef.current = null;

    setCallStatus('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setCallSessionId(null);
    setCallPartnerName(null);
    setCallBarPos({ x: 0, y: 0 });
  }, []);

  // ── createPC — exact copy from original ──────────────────────────────────
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
      const audio = getRemoteAudio();
      // Handle both bundled streams and individual tracks
      const stream = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);
      audio.srcObject = stream;
      audio.play().catch(() => {
        // Retry on next user interaction (mobile browsers may still block)
        const resume = () => audio.play().catch(() => {});
        document.addEventListener('click',      resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });

      // Also route through AudioContext if available (more reliable on some mobile browsers)
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        try {
          const src = audioCtxRef.current.createMediaStreamSource(stream);
          src.connect(audioCtxRef.current.destination);
        } catch (_) {}
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
        endCall(false);
    };

    pcRef.current = pc;
    return pc;
  }, [endCall]);

  // ── startCall — exact copy from original ─────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    unlockAudio(); // Unlock audio context within user gesture — required on iOS/mobile

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // ⚡ Set ref synchronously BEFORE setLocalDescription
      // ICE gathering starts inside setLocalDescription and onicecandidate
      // reads callSessionIdRef.current — if it's null the candidate is dropped
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer); // ← ICE gathering starts, ref already set ✅

      socketService.getSocket()?.emit('call:offer', { sessionId, offer, callerName });
      setCallStatus('calling');
      callStatusRef.current = 'calling';
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
  }, [createPC]);

  // ── acceptCall — exact copy from original ────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current) return;
    unlockAudio(); // Unlock audio context within user gesture — required on iOS/mobile
    const { offer, sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Drain queued ICE candidates
      for (const c of iceCandidateQueueRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
      }
      iceCandidateQueueRef.current = [];

      const answer = await pc.createAnswer();

      // ⚡ Set ref synchronously BEFORE setLocalDescription so outgoing
      // ICE candidates (onicecandidate) have a valid sessionId
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);

      await pc.setLocalDescription(answer); // ← ICE gathering, ref already set ✅

      socketService.getSocket()?.emit('call:answer', { sessionId, answer });

      setCallStatus('connected');
      callStatusRef.current = 'connected';
      callStartRef.current = Date.now();
      callTimerRef.current = setInterval(
        () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle');
      callStatusRef.current = 'idle';
    }
  }, [createPC]);

  // ── declineCall ───────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    const sessionId = pendingOfferRef.current?.sessionId ?? callSessionIdRef.current;
    pendingOfferRef.current = null;
    if (sessionId)
      socketService.getSocket()?.emit('call:end', { sessionId });
    setCallStatus('idle');
    callStatusRef.current = 'idle';
    setCallPartnerName(null);
    setCallSessionId(null);
    callSessionIdRef.current = null;
  }, []);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  // ── Socket listeners — attached once when authenticated ──────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function attach() {
      const socket = socketService.getSocket();
      if (!socket) return false;

      // Incoming call offer
      socket.on('call:offer', (data: { sessionId: string; offer: RTCSessionDescriptionInit; callerName: string }) => {
        // Already on a call — auto-decline
        if (callStatusRef.current !== 'idle') {
          socket.emit('call:end', { sessionId: data.sessionId });
          return;
        }
        // ⚡ Store {offer, sessionId} together so acceptCall can use sessionId directly
        pendingOfferRef.current = { offer: data.offer, sessionId: data.sessionId };
        // Also set callSessionIdRef synchronously for immediate availability
        callSessionIdRef.current = data.sessionId;
        setCallSessionId(data.sessionId);
        setCallPartnerName(data.callerName);
        setCallStatus('ringing');
        callStatusRef.current = 'ringing';
      });

      // Caller gets the answer — exact copy from original
      socket.on('call:answer', async (data: { answer: RTCSessionDescriptionInit }) => {
        try {
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            // Drain queued ICE candidates
            for (const c of iceCandidateQueueRef.current) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
            }
            iceCandidateQueueRef.current = [];
            setCallStatus('connected');
            callStartRef.current = Date.now();
            callTimerRef.current = setInterval(
              () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
          }
        } catch (_) {}
      });

      // ICE candidates — exact copy from original
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
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        pcRef.current?.close();
        pcRef.current = null;
        const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
        if (audio) { audio.srcObject = null; audio.remove(); }
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        callTimerRef.current = null;
        setCallStatus('idle');
        setCallDuration(0);
        setIsMuted(false);
        setCallSessionId(null);
        setCallPartnerName(null);
      });

      return true;
    }

    if (!attach()) {
      pollTimer = setInterval(() => {
        if (attach()) { clearInterval(pollTimer!); pollTimer = null; }
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
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Ring / dial tones ─────────────────────────────────────────────────────
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
          const osc = ctx.createOscillator();
          osc.frequency.value = f;
          osc.connect(gain);
          osc.start();
          osc.stop(ctx.currentTime + dur);
        });
        setTimeout(() => ctx.close(), (dur + 0.1) * 1000);
      } catch (_) {}
    };

    if (callStatus === 'ringing')        { beep([480, 440], 0.4); ringIntervalRef.current = setInterval(() => beep([480, 440], 0.4), 3000); }
    else if (callStatus === 'calling')   { beep([350, 440], 0.6, 0.05); ringIntervalRef.current = setInterval(() => beep([350, 440], 0.6, 0.05), 3000); }
    else if (callStatus === 'connected') { beep([880], 0.15, 0.06); stopRing(); }
    else                                 { stopRing(); }

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
