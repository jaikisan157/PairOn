/**
 * CallContext — global voice call state.
 *
 * Lives at the App level so calls persist across page navigation.
 * WebRTC peer connection + audio stream survive route changes.
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
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
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

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pcRef               = useRef<RTCPeerConnection | null>(null);
  const localStreamRef      = useRef<MediaStream | null>(null);
  const callTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef        = useRef<number>(0);
  const pendingOfferRef     = useRef<{ offer: RTCSessionDescriptionInit; sessionId: string } | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStatusRef       = useRef<CallStatus>('idle');
  const callSessionIdRef    = useRef<string | null>(null);
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
      el.setAttribute('autoplay', '');
      el.setAttribute('playsinline', '');
      document.body.appendChild(el);
    }
    return el;
  };

  // Unlock audio playback on mobile
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

  // Speaker toggle
  const toggleSpeaker = useCallback(async () => {
    const audio = document.getElementById('pairon-call-audio') as any;
    if (!audio) return;
    if (typeof audio.setSinkId !== 'function') {
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
    callStatusRef.current = 'idle';
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setCallSessionId(null);
    setCallPartnerName(null);
    setCallBarPos({ x: 0, y: 0 });
  }, []);

  // ── createPC ─────────────────────────────────────────────────────────────
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
      if (e.streams && e.streams[0]) {
        audio.srcObject = e.streams[0];
      } else {
        audio.srcObject = new MediaStream([e.track]);
      }
      audio.play().catch(() => {
        let attempts = 0;
        const retryTimer = setInterval(() => {
          attempts++;
          audio.play()
            .then(() => clearInterval(retryTimer))
            .catch(() => { if (attempts > 20) clearInterval(retryTimer); });
        }, 500);
        const resume = () => { audio.play().catch(() => {}); clearInterval(retryTimer); };
        document.addEventListener('click',      resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
        endCall(false);
    };

    pcRef.current = pc;
    return pc;
  }, [endCall]);

  // ── startCall ────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    unlockAudio();

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

  // ── acceptCall ───────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    unlockAudio();
    const { offer, sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

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
      callStartRef.current = Date.now();
      callTimerRef.current = setInterval(
        () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle');
      callStatusRef.current = 'idle';
    }
  }, [createPC]);

  // ── declineCall ──────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    const sessionId = pendingOfferRef.current?.sessionId ?? callSessionIdRef.current;
    pendingOfferRef.current = null;
    iceCandidateQueueRef.current = [];
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
      socket.on('call:offer', (data: { sessionId: string; offer: RTCSessionDescriptionInit; callerName: string }) => {
        if (callStatusRef.current !== 'idle') {
          socket.emit('call:end', { sessionId: data.sessionId });
          return;
        }
        pendingOfferRef.current = { offer: data.offer, sessionId: data.sessionId };
        callSessionIdRef.current = data.sessionId;
        setCallSessionId(data.sessionId);
        setCallPartnerName(data.callerName);
        setCallStatus('ringing');
        callStatusRef.current = 'ringing';
      });

      // Caller gets the answer
      socket.on('call:answer', async (data: { answer: RTCSessionDescriptionInit }) => {
        try {
          if (pcRef.current && callStatusRef.current === 'calling') {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            for (const c of iceCandidateQueueRef.current) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
            }
            iceCandidateQueueRef.current = [];
            setCallStatus('connected');
            callStatusRef.current = 'connected';
            callStartRef.current = Date.now();
            callTimerRef.current = setInterval(
              () => setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
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
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        pcRef.current?.close();
        pcRef.current = null;
        const audio = document.getElementById('pairon-call-audio') as HTMLAudioElement | null;
        if (audio) { audio.srcObject = null; audio.remove(); }
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        callTimerRef.current = null;
        iceCandidateQueueRef.current = [];
        pendingOfferRef.current = null;
        setCallStatus('idle');
        callStatusRef.current = 'idle';
        setCallDuration(0);
        setIsMuted(false);
        setIsSpeakerOn(false);
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

  // ── Ring / dial tones — distinctive "abc abc" style ──────────────────────
  useEffect(() => {
    const stopRing = () => {
      if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    };

    // Play a melodic multi-note tone
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

    // Ringing (incoming) — cheerful ascending "doo-doo-doo  doo-doo-doo" pattern
    const ringTone = () => playTone([
      { freq: 587, start: 0,    dur: 0.12 },  // D5
      { freq: 659, start: 0.14, dur: 0.12 },  // E5
      { freq: 784, start: 0.28, dur: 0.18 },  // G5
      { freq: 587, start: 0.55, dur: 0.12 },  // D5
      { freq: 659, start: 0.69, dur: 0.12 },  // E5
      { freq: 784, start: 0.83, dur: 0.18 },  // G5
    ], 0.12);

    // Calling (outgoing) — gentle pulsing dial tone
    const dialTone = () => playTone([
      { freq: 440, start: 0,    dur: 0.35 },  // A4
      { freq: 523, start: 0.4,  dur: 0.35 },  // C5
    ], 0.06);

    // Connected — short bright confirmation chime
    const connectedTone = () => playTone([
      { freq: 523, start: 0,    dur: 0.1 },   // C5
      { freq: 659, start: 0.08, dur: 0.1 },   // E5
      { freq: 784, start: 0.16, dur: 0.15 },  // G5
      { freq: 1047,start: 0.26, dur: 0.2 },   // C6
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
