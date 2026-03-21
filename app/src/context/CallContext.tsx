/**
 * CallContext — global voice call state.
 *
 * v5 — Raw PCM streaming via AudioContext / ScriptProcessorNode.
 * No MediaRecorder, no MSE, no blob URLs, no codec containers.
 * Works in Edge, Firefox, sandboxed iframes, all networks.
 *
 * Flow:
 *   Sender :  MediaStream → AudioContext(16kHz) → ScriptProcessorNode
 *             → Float32→Int16 conversion → socket.emit('call:audio-chunk')
 *   Receiver: socket.on('call:audio-chunk') → Int16→Float32 conversion
 *             → AudioContext.createBuffer → BufferSourceNode (scheduled)
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
const PCM_SAMPLE_RATE    = 16000;  // 16kHz — good for voice, ~32KB/s
const PCM_BUFFER_SIZE    = 2048;   // ~128ms chunks at 16kHz

// ─────────────────────────────────────────────────────────────────────────────
export function CallProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [callStatus, setCallStatus] = useState<CallStatus>(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('pairon_call') || 'null');
      if (s?.status === 'connected' || s?.status === 'reconnecting') return 'reconnecting';
    } catch {}
    return 'idle';
  });
  const [callSessionId,   setCallSessionId]   = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.sessionId ?? null; } catch { return null; }
  });
  const [callPartnerName, setCallPartnerName] = useState<string | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.partnerName ?? null; } catch { return null; }
  });
  const [isMuted,      setIsMuted]      = useState(false);
  const [isSpeakerOn,  setIsSpeakerOn]  = useState(false);
  const [callDuration, setCallDuration] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('pairon_call') || 'null')?.duration ?? 0; } catch { return 0; }
  });
  const [callBarPos, setCallBarPos] = useState({ x: 0, y: 0 });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const callStatusRef    = useRef<CallStatus>(callStatus);
  const callSessionIdRef = useRef<string | null>(callSessionId);
  const callerNameRef    = useRef<string>('');

  // Sender — ScriptProcessor captures PCM from mic
  const localStreamRef   = useRef<MediaStream | null>(null);
  const senderCtxRef     = useRef<AudioContext | null>(null);
  const scriptNodeRef    = useRef<ScriptProcessorNode | null>(null);
  const muteRef          = useRef<boolean>(false);  // checked in onaudioprocess

  // Receiver — AudioContext scheduled playback of raw PCM
  const receiverCtxRef   = useRef<AudioContext | null>(null);
  const receiverGainRef  = useRef<GainNode | null>(null);
  const nextPlayTimeRef  = useRef<number>(0);
  const pendingChunksRef = useRef<Int16Array[]>([]);  // queued before ctx unlocks

  // Ring beep (separate AudioContext)
  const ringCtxRef       = useRef<AudioContext | null>(null);
  const ringingBeepRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timers
  const callTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartRef      = useRef<number>(0);
  const ringingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending incoming call
  const pendingOfferRef = useRef<{ sessionId: string; callerName: string } | null>(null);

  // ── Persist call state ────────────────────────────────────────────────────
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

  // ── Ring beep ─────────────────────────────────────────────────────────────
  const startRingBeep = useCallback(() => {
    const beep = () => {
      try {
        if (!ringCtxRef.current || ringCtxRef.current.state === 'closed')
          ringCtxRef.current = new AudioContext();
        const ctx = ringCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
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

  // ── Receiver AudioContext ─────────────────────────────────────────────────
  /** Create/get receiver AudioContext — call from user gesture to pre-unlock */
  const getReceiverCtx = useCallback(() => {
    if (!receiverCtxRef.current || receiverCtxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gain.connect(ctx.destination);
      receiverCtxRef.current = ctx;
      receiverGainRef.current = gain;
      nextPlayTimeRef.current = 0;
    }
    return receiverCtxRef.current;
  }, []);

  const unlockReceiverCtx = useCallback(() => {
    const ctx = getReceiverCtx();
    if (ctx.state === 'suspended') {
      ctx.resume()
        .then(() => {
          console.log('[Call] 🔓 Receiver AudioContext unlocked');
          // Flush any chunks that arrived while suspended
          const chunks = pendingChunksRef.current.splice(0);
          for (const int16 of chunks) scheduleChunk(int16, ctx);
        })
        .catch(() => {});
    }
  }, [getReceiverCtx]); // eslint-disable-line

  /** Schedule a decoded Int16Array chunk for playback */
  const scheduleChunk = (int16: Int16Array, ctx: AudioContext) => {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    const buf = ctx.createBuffer(1, float32.length, PCM_SAMPLE_RATE);
    buf.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(receiverGainRef.current ?? ctx.destination);
    const t = Math.max(nextPlayTimeRef.current, ctx.currentTime + 0.05);
    src.start(t);
    nextPlayTimeRef.current = t + buf.duration;
  };

  /** Play a received PCM chunk (called from socket event) */
  const playAudioChunk = useCallback((raw: unknown) => {
    // Binary conversion (Socket.IO may deliver as Uint8Array)
    let ab: ArrayBuffer;
    if (raw instanceof ArrayBuffer) { ab = raw; }
    else if (ArrayBuffer.isView(raw)) {
      const v = raw as Uint8Array;
      ab = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
    } else { console.warn('[Call] Unknown chunk type:', typeof raw); return; }

    const int16 = new Int16Array(ab);
    const ctx = receiverCtxRef.current;

    if (!ctx || ctx.state === 'closed') {
      pendingChunksRef.current.push(int16);
      return;
    }
    if (ctx.state === 'suspended') {
      // Queue and try to resume
      pendingChunksRef.current.push(int16);
      ctx.resume().then(() => {
        const chunks = pendingChunksRef.current.splice(0);
        for (const c of chunks) scheduleChunk(c, ctx);
      }).catch(() => {});
      return;
    }
    scheduleChunk(int16, ctx);
  }, []); // eslint-disable-line

  // ── Start PCM streaming (sender) ──────────────────────────────────────────
  const startAudioStream = useCallback((stream: MediaStream, sessionId: string) => {
    // Tear down any previous sender
    if (scriptNodeRef.current) { try { scriptNodeRef.current.disconnect(); } catch {} scriptNodeRef.current = null; }
    if (senderCtxRef.current) { try { senderCtxRef.current.close(); } catch {} senderCtxRef.current = null; }

    const ctx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(PCM_BUFFER_SIZE, 1, 1);

    // Silent output node (processor must connect to something to fire)
    const silent = ctx.createGain();
    silent.gain.value = 0;
    silent.connect(ctx.destination);

    processor.onaudioprocess = (e) => {
      if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
      if (muteRef.current) return;
      const socket = socketService.getSocket();
      if (!socket?.connected) return;

      const samples = e.inputBuffer.getChannelData(0);
      // Float32 → Int16 (halves bandwidth to ~32KB/s)
      const int16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++)
        int16[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));

      socket.emit('call:audio-chunk', { sessionId, chunk: int16.buffer });
    };

    source.connect(processor);
    processor.connect(silent);

    senderCtxRef.current = ctx;
    scriptNodeRef.current = processor;
    console.log('[Call] 🎙️ PCM streaming started at', PCM_SAMPLE_RATE, 'Hz');
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
    // Sender
    if (scriptNodeRef.current) { try { scriptNodeRef.current.disconnect(); } catch {} scriptNodeRef.current = null; }
    if (senderCtxRef.current) { try { senderCtxRef.current.close(); } catch {} senderCtxRef.current = null; }
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
    // Receiver
    if (receiverCtxRef.current) { try { receiverCtxRef.current.close(); } catch {} receiverCtxRef.current = null; }
    receiverGainRef.current = null; nextPlayTimeRef.current = 0;
    pendingChunksRef.current = [];
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
    setCallStatus('idle');  callStatusRef.current = 'idle';
    setCallDuration(0); setIsMuted(false); setIsSpeakerOn(false);
    setCallSessionId(null); callSessionIdRef.current = null;
    setCallPartnerName(null); setCallBarPos({ x: 0, y: 0 });
  }, [fullCleanup]);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    muteRef.current = !muteRef.current;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) track.enabled = !muteRef.current;
    setIsMuted(muteRef.current);
  }, []);

  // ── toggleSpeaker ─────────────────────────────────────────────────────────
  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    if (receiverGainRef.current)
      receiverGainRef.current.gain.setTargetAtTime(next ? 1.8 : 1.0,
        receiverCtxRef.current?.currentTime ?? 0, 0.05);
    setIsSpeakerOn(next);
  }, [isSpeakerOn]);

  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    callerNameRef.current = callerName;

    // Pre-create & unlock receiver AudioContext from this user gesture
    unlockReceiverCtx();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      callSessionIdRef.current = sessionId;
      setCallSessionId(sessionId); setCallPartnerName(partnerName);
      socketService.getSocket()?.emit('call:offer', { sessionId, callerName });
      setCallStatus('calling'); callStatusRef.current = 'calling';
      if (callingTimeoutRef.current) clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = setTimeout(() => {
        if (callStatusRef.current === 'calling') endCall(true);
      }, CALLING_TIMEOUT_MS);
    } catch (err: any) {
      localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
      if (err.name === 'NotAllowedError') alert('Microphone access blocked. Please allow it in browser settings.');
      else alert('Could not start call: ' + err.message);
    }
  }, [endCall, unlockReceiverCtx]);

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    const { sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }

    // Pre-unlock receiver AudioContext from this user gesture (Accept button click)
    unlockReceiverCtx();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      callSessionIdRef.current = sessionId; setCallSessionId(sessionId);
      socketService.getSocket()?.emit('call:answer', { sessionId });
      setCallStatus('connected'); callStatusRef.current = 'connected';
      startCallTimer();
      startAudioStream(stream, sessionId);
      console.log('[Call] ✅ Accepted — PCM stream started');
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle'); callStatusRef.current = 'idle';
    }
  }, [stopRingBeep, unlockReceiverCtx, startCallTimer, startAudioStream]);

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

  // ── Global click → unlock AudioContext (needed for rejoin after refresh) ──
  useEffect(() => {
    const unlock = () => {
      if (receiverCtxRef.current?.state === 'suspended') {
        receiverCtxRef.current.resume().then(() => {
          const chunks = pendingChunksRef.current.splice(0);
          const ctx = receiverCtxRef.current!;
          for (const c of chunks) scheduleChunk(c, ctx);
        }).catch(() => {});
      }
    };
    document.addEventListener('click',      unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      document.removeEventListener('click',      unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []); // eslint-disable-line

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const attach = () => {
      const socket = socketService.getSocket();
      if (!socket) return;

      socket.on('call:offer', (data: { sessionId: string; callerName: string; isReconnect?: boolean }) => {
        if (data.isReconnect) { setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting'; return; }
        if (callStatusRef.current !== 'idle') return;
        pendingOfferRef.current = { sessionId: data.sessionId, callerName: data.callerName };
        setCallSessionId(data.sessionId); callSessionIdRef.current = data.sessionId;
        setCallPartnerName(data.callerName);
        setCallStatus('ringing'); callStatusRef.current = 'ringing';
        startRingBeep();
        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
        ringingTimeoutRef.current = setTimeout(() => {}, RINGING_TIMEOUT_MS);
      });

      socket.on('call:answer', (_data: { sessionId: string }) => {
        if (callStatusRef.current !== 'calling' && callStatusRef.current !== 'reconnecting') return;
        if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }
        setCallStatus('connected'); callStatusRef.current = 'connected';
        startCallTimer();
        if (localStreamRef.current) startAudioStream(localStreamRef.current, callSessionIdRef.current!);
        console.log('[Call] ✅ Connected — PCM relay active');
      });

      socket.on('call:audio-chunk', (data: { chunk: unknown }) => {
        if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
        playAudioChunk(data.chunk);
      });

      socket.on('call:partner-reconnecting', (_data: unknown) => {
        if (callStatusRef.current === 'connected' || callStatusRef.current === 'reconnecting') {
          setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting';
          // Pause PCM output while partner reconnects
          if (scriptNodeRef.current && senderCtxRef.current) {
            // Just let onaudioprocess drop packets via callStatusRef check
          }
        }
      });

      socket.on('call:partner-reconnected', (data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current !== 'reconnecting') return;
        setCallStatus('connected'); callStatusRef.current = 'connected';
        startCallTimer(data.startTimestamp);
        console.log('[Call] ✅ Partner reconnected');
      });

      socket.on('call:rejoin-success', async (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Rejoin confirmed — restarting PCM stream');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          callSessionIdRef.current = data.sessionId;
          // Pre-create receiver ctx — will unlock on first user click if still suspended
          getReceiverCtx();
          setCallStatus('connected'); callStatusRef.current = 'connected';
          startCallTimer(data.startTimestamp);
          startAudioStream(stream, data.sessionId);
          socket.emit('call:offer', { sessionId: data.sessionId, callerName: callerNameRef.current, isReconnect: true });
        } catch (err) {
          console.error('[Call] Rejoin failed:', err);
          endCall(false);
        }
      });

      socket.on('call:rejoin-failed',   () => endCall(false));
      socket.on('call:end',             () => endCall(false));
      socket.on('call:ended-by-server', () => endCall(false));
    };

    const checkRejoin = () => {
      try {
        const s = JSON.parse(sessionStorage.getItem('pairon_call') || 'null');
        if ((s?.status === 'connected' || s?.status === 'reconnecting') && s?.sessionId) {
          const socket = socketService.getSocket();
          if (socket) {
            if (s.startTimestamp) callStartRef.current = s.startTimestamp;
            setCallPartnerName(s.partnerName ?? null);
            callSessionIdRef.current = s.sessionId; setCallSessionId(s.sessionId);
            socket.emit('call:rejoin', { sessionId: s.sessionId });
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
      s?.off('call:offer'); s?.off('call:answer'); s?.off('call:audio-chunk');
      s?.off('call:end'); s?.off('call:partner-reconnecting'); s?.off('call:partner-reconnected');
      s?.off('call:rejoin-success'); s?.off('call:rejoin-failed'); s?.off('call:ended-by-server');
    };
  }, [isAuthenticated, endCall, startCallTimer, playAudioChunk, startAudioStream,
      startRingBeep, getReceiverCtx]);

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
