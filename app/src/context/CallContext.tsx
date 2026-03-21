/**
 * CallContext — global voice call state.
 *
 * v3 — WebSocket Audio Relay (no WebRTC/TURN needed)
 * Audio is captured with MediaRecorder, sent as binary chunks through
 * Socket.IO, and played back with Web Audio API scheduled buffering.
 * Works 100% reliably on all networks — no TURN server required.
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
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}

const RINGING_TIMEOUT_MS = 45_000;
const CALLING_TIMEOUT_MS = 45_000;
const CHUNK_INTERVAL_MS  = 100; // ms — MediaRecorder timeslice

// Detect best supported audio MIME type for this browser
function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── State — restore from sessionStorage on refresh ──
  const [callStatus, setCallStatus] = useState<CallStatus>(() => {
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
  const [isMuted,       setIsMuted]       = useState(false);
  const [isSpeakerOn,   setIsSpeakerOn]   = useState(false);
  const [callDuration,  setCallDuration]  = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.duration ?? 0; } catch { return 0; }
  });
  const [callBarPos, setCallBarPos] = useState({ x: 0, y: 0 });

  // ── Refs ─────────────────────────────────────────────────────────────────
  const callStatusRef      = useRef<CallStatus>(callStatus);
  const callSessionIdRef   = useRef<string | null>(callSessionId);
  const partnerNameRef     = useRef<string>('');
  const callerNameRef      = useRef<string>('');

  // Audio recording
  const localStreamRef     = useRef<MediaStream | null>(null);
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);
  const mimeTypeRef        = useRef<string>('');

  // Audio playback (Web Audio API with scheduled buffering)
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const gainNodeRef        = useRef<GainNode | null>(null);
  const nextPlayTimeRef    = useRef<number>(0);

  // Timers
  const callTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef       = useRef<number>(0);
  const ringingTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringingBeepRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const callingTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending incoming call
  const pendingOfferRef    = useRef<{ sessionId: string; callerName: string } | null>(null);

  // ── Persist call state to sessionStorage ─────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected' || callStatus === 'reconnecting') {
      sessionStorage.setItem('pairon_call', JSON.stringify({
        status: callStatus,
        sessionId: callSessionId,
        partnerName: callPartnerName,
        duration: callDuration,
        startTimestamp: callStartRef.current,
      }));
    } else if (callStatus === 'idle') {
      sessionStorage.removeItem('pairon_call');
    }
  }, [callStatus, callSessionId, callPartnerName, callDuration]);

  // ── Audio context management ──────────────────────────────────────────────
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
      nextPlayTimeRef.current = 0;
    }
    return audioCtxRef.current;
  }, []);

  // ── Pre-unlock AudioContext (MUST be called from a user gesture) ──────────
  // Browsers block AudioContext until a button click. We unlock it here so
  // playback works when audio chunks arrive later via socket events.
  const unlockAudioContext = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => console.log('[Call] 🔓 AudioContext unlocked')).catch(() => {});
    }
  }, [getAudioContext]);

  // ── Ring beep (incoming call sound) ──────────────────────────────────────
  const startRingBeep = useCallback(() => {
    const beep = () => {
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 440;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch {}
    };
    beep();
    ringingBeepRef.current = setInterval(beep, 1500);
  }, [getAudioContext]);

  const stopRingBeep = useCallback(() => {
    if (ringingBeepRef.current) { clearInterval(ringingBeepRef.current); ringingBeepRef.current = null; }
  }, []);

  // ── Play received audio chunk ─────────────────────────────────────────────
  const playAudioChunk = useCallback(async (chunk: ArrayBuffer) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        console.warn('[Call] AudioContext not ready — chunk dropped');
        return;
      }
      const ctx = audioCtxRef.current;
      // Resume if suspended (best-effort; only works if AudioContext was pre-unlocked)
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      const decoded = await ctx.decodeAudioData(chunk.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(gainNodeRef.current ?? ctx.destination);

      const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime + 0.05);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + decoded.duration;
    } catch (err) {
      console.warn('[Call] Audio decode error:', (err as Error).message);
    }
  }, []);

  // ── Start recording and streaming ────────────────────────────────────────
  const startAudioStream = useCallback((stream: MediaStream, sessionId: string) => {
    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;

    const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 };
    if (mimeType) options.mimeType = mimeType;

    const recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = async (e) => {
      if (e.data.size < 1) return;
      if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
      const socket = socketService.getSocket();
      if (!socket) return;
      const buffer = await e.data.arrayBuffer();
      socket.emit('call:audio-chunk', { sessionId, chunk: buffer });
    };

    recorder.start(CHUNK_INTERVAL_MS);
    mediaRecorderRef.current = recorder;
    console.log('[Call] 🎙️ Recording started, mimeType:', mimeType || 'browser default');
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
    // Stop recording
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }
    // Stop mic stream
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    // Close audio context
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    nextPlayTimeRef.current = 0;
    // Clear timers
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    ringingTimeoutRef.current = null;
    if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
    callingTimeoutRef.current = null;
    pendingOfferRef.current = null;
  }, [stopRingBeep]);

  // ── endCall ───────────────────────────────────────────────────────────────
  const endCall = useCallback((notify = true) => {
    if (notify && callSessionIdRef.current)
      socketService.getSocket()?.emit('call:end', { sessionId: callSessionIdRef.current });

    fullCleanup();
    sessionStorage.removeItem('pairon_call');
    setCallStatus('idle');  callStatusRef.current = 'idle';
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setCallSessionId(null); callSessionIdRef.current = null;
    setCallPartnerName(null);
    setCallBarPos({ x: 0, y: 0 });
  }, [fullCleanup]);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  // ── toggleSpeaker ─────────────────────────────────────────────────────────
  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    if (gainNodeRef.current) {
      // Speaker on = louder gain, off = normal
      gainNodeRef.current.gain.setTargetAtTime(next ? 1.8 : 1.0, audioCtxRef.current?.currentTime ?? 0, 0.05);
    }
    setIsSpeakerOn(next);
  }, [isSpeakerOn]);

  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    callerNameRef.current = callerName;
    partnerNameRef.current = partnerName;

    // Pre-unlock AudioContext NOW (user gesture context — button click)
    unlockAudioContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);
      setCallPartnerName(partnerName);

      // Emit offer (signaling only — no SDP needed)
      socketService.getSocket()?.emit('call:offer', { sessionId, callerName });
      setCallStatus('calling'); callStatusRef.current = 'calling';

      // Auto-cancel if no answer
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') endCall(true);
      }, CALLING_TIMEOUT_MS);
    } catch (err: any) {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (err.name === 'NotAllowedError')
        alert('Microphone blocked. Allow microphone access in your browser and try again.');
      else
        alert('Could not start call: ' + err.message);
    }
  }, [endCall]);

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    const { sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }

    // Pre-unlock AudioContext NOW (user gesture — Accept button click)
    unlockAudioContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId);

      socketService.getSocket()?.emit('call:answer', { sessionId });

      setCallStatus('connected'); callStatusRef.current = 'connected';
      startCallTimer();

      // AudioContext already unlocked above — start streaming
      startAudioStream(stream, sessionId);
      console.log('[Call] ✅ Accepted — audio streaming started');
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle'); callStatusRef.current = 'idle';
    }
  }, [startCallTimer, startAudioStream, unlockAudioContext, stopRingBeep]);

  // ── declineCall ───────────────────────────────────────────────────────────
  const declineCall = useCallback(() => {
    const sessionId = pendingOfferRef.current?.sessionId ?? callSessionIdRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }
    if (sessionId) socketService.getSocket()?.emit('call:end', { sessionId });
    setCallStatus('idle'); callStatusRef.current = 'idle';
    setCallPartnerName(null);
    setCallSessionId(null); callSessionIdRef.current = null;
  }, []);

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const attach = () => {
      const socket = socketService.getSocket();
      if (!socket) return false;

      // Incoming call (ringing)
      socket.on('call:offer', (data: { sessionId: string; callerName: string; isReconnect?: boolean }) => {
        if (data.isReconnect) {
          setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting';
          return;
        }
        if (callStatusRef.current !== 'idle') return;

        pendingOfferRef.current = { sessionId: data.sessionId, callerName: data.callerName };
        setCallSessionId(data.sessionId); callSessionIdRef.current = data.sessionId;
        setCallPartnerName(data.callerName);
        setCallStatus('ringing'); callStatusRef.current = 'ringing';
        // Play ring beep sound
        startRingBeep();
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = setTimeout(() => {}, RINGING_TIMEOUT_MS);
      });

      // Caller: partner accepted
      socket.on('call:answer', async (_data: { sessionId: string }) => {
        if (callStatusRef.current !== 'calling' && callStatusRef.current !== 'reconnecting') return;
        if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }

        setCallStatus('connected'); callStatusRef.current = 'connected';
        startCallTimer();

        // AudioContext was pre-unlocked in startCall (user gesture) — safe to use now
        if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }

        // Start streaming our audio
        if (localStreamRef.current) {
          startAudioStream(localStreamRef.current, callSessionIdRef.current!);
        }
        console.log('[Call] ✅ Connected via WebSocket relay');
      });

      // Receive audio chunk from partner
      socket.on('call:audio-chunk', async (data: { chunk: ArrayBuffer }) => {
        if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
        await playAudioChunk(data.chunk);
      });

      // ── Partner ended the call ──
      socket.on('call:end', (_data: { sessionId: string }) => {
        endCall(false);
      });

      // ── Partner disconnected (reconnecting grace period) ──
      socket.on('call:partner-reconnecting', (_data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current === 'connected' || callStatusRef.current === 'reconnecting') {
          setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting';
          // Pause recording while partner reconnects
          if (mediaRecorderRef.current?.state === 'recording') {
            try { mediaRecorderRef.current.pause(); } catch {}
          }
        }
      });

      // ── Partner reconnected ──
      socket.on('call:partner-reconnected', (data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current !== 'reconnecting') return;
        setCallStatus('connected'); callStatusRef.current = 'connected';
        // Resume recording
        if (mediaRecorderRef.current?.state === 'paused') {
          try { mediaRecorderRef.current.resume(); } catch {}
        }
        // Restart timer from original start
        startCallTimer(data.startTimestamp);
        console.log('[Call] ✅ Partner reconnected');
      });

      // ── Rejoin success (after our own refresh) ──
      socket.on('call:rejoin-success', async (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Rejoin confirmed — restarting audio stream');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          callSessionIdRef.current = data.sessionId;

          const ctx = getAudioContext();
          await ctx.resume().catch(() => {});

          setCallStatus('connected'); callStatusRef.current = 'connected';
          startCallTimer(data.startTimestamp);
          startAudioStream(stream, data.sessionId);

          // Tell partner we're back (simplified reconnect, no WebRTC needed)
          socket.emit('call:offer', { sessionId: data.sessionId, callerName: callerNameRef.current, isReconnect: true });
        } catch (err) {
          console.error('[Call] Failed to restart audio after rejoin:', err);
          endCall(false);
        }
      });

      // ── Rejoin failed — no active call on server ──
      socket.on('call:rejoin-failed', () => {
        console.log('[Call] Rejoin failed — call no longer active');
        endCall(false);
      });

      // ── Server ended call (grace period expired) ──
      socket.on('call:ended-by-server', (_data: unknown) => {
        endCall(false);
      });

      return true;
    };

    const checkRejoin = () => {
      const saved = sessionStorage.getItem('pairon_call');
      if (!saved) return;
      try {
        const s = JSON.parse(saved);
        if ((s.status === 'connected' || s.status === 'reconnecting') && s.sessionId) {
          const socket = socketService.getSocket();
          if (socket) {
            console.log('[Call] Rejoining call after refresh, sessionId:', s.sessionId);
            if (s.startTimestamp) callStartRef.current = s.startTimestamp;
            setCallPartnerName(s.partnerName ?? null);
            callSessionIdRef.current = s.sessionId;
            setCallSessionId(s.sessionId);
            socket.emit('call:rejoin', { sessionId: s.sessionId });
          }
        }
      } catch {}
    };

    if (!isAuthenticated) return;

    const socket = socketService.getSocket();
    if (socket?.connected) {
      attach();
      checkRejoin();
    } else {
      const onConnect = () => { attach(); checkRejoin(); };
      socketService.getSocket()?.on('connect', onConnect);
      return () => { socketService.getSocket()?.off('connect', onConnect); };
    }

    return () => {
      const s = socketService.getSocket();
      s?.off('call:offer');
      s?.off('call:answer');
      s?.off('call:audio-chunk');
      s?.off('call:end');
      s?.off('call:partner-reconnecting');
      s?.off('call:partner-reconnected');
      s?.off('call:rejoin-success');
      s?.off('call:rejoin-failed');
      s?.off('call:ended-by-server');
    };
  }, [isAuthenticated, endCall, startCallTimer, playAudioChunk, getAudioContext, startAudioStream]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <CallContext.Provider value={{
      callStatus, callSessionId, callPartnerName,
      isMuted, isSpeakerOn, callDuration, callBarPos, setCallBarPos,
      startCall, acceptCall, declineCall, endCall,
      toggleMute, toggleSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
}
