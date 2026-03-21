/**
 * CallContext — global voice call state.
 *
 * v4 — WebSocket Audio Relay with MediaSource Extension (MSE) playback.
 * - Audio captured with MediaRecorder (100ms chunks, webm/opus)
 * - Chunks relayed through Socket.IO (no TURN/WebRTC needed)
 * - Played back via MediaSource → <audio> element (proper streaming)
 *   decodeAudioData CANNOT handle partial webm chunks — MSE is the right API.
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
const CHUNK_INTERVAL_MS  = 100;

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

  // Recording
  const localStreamRef   = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mimeTypeRef      = useRef<string>('');

  // Playback — MediaSource Extension (MSE) feeds an <audio> element
  const audioElRef       = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef   = useRef<MediaSource | null>(null);
  const sourceBufferRef  = useRef<SourceBuffer | null>(null);
  const chunkQueueRef    = useRef<ArrayBuffer[]>([]);
  const mseReadyRef      = useRef<boolean>(false);
  const volumeRef        = useRef<number>(1.0);

  // Ring beep (oscillator-based, no AudioContext autoplay issues)
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
        if (!ringCtxRef.current || ringCtxRef.current.state === 'closed') {
          ringCtxRef.current = new AudioContext();
        }
        const ctx = ringCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 440;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch {}
    };
    beep();
    ringingBeepRef.current = setInterval(beep, 1500);
  }, []);

  const stopRingBeep = useCallback(() => {
    if (ringingBeepRef.current) { clearInterval(ringingBeepRef.current); ringingBeepRef.current = null; }
    ringCtxRef.current?.close().catch(() => {}); ringCtxRef.current = null;
  }, []);

  // ── MSE playback ──────────────────────────────────────────────────────────
  const flushMSEQueue = useCallback(() => {
    const sb = sourceBufferRef.current;
    if (!sb || sb.updating || chunkQueueRef.current.length === 0) return;
    const chunk = chunkQueueRef.current.shift()!;
    try { sb.appendBuffer(chunk); } catch (e) {
      console.warn('[Call] MSE appendBuffer error:', e);
    }
  }, []);

  /** Must be called from a user-gesture context (button click) so audio.play() is allowed */
  const initMSEPlayback = useCallback((mimeType: string) => {
    // Tear down any previous instance
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ''; audioElRef.current = null; }
    if (mediaSourceRef.current?.readyState === 'open') { try { mediaSourceRef.current.endOfStream(); } catch {} }
    mediaSourceRef.current = null; sourceBufferRef.current = null;
    chunkQueueRef.current = []; mseReadyRef.current = false;

    const safeMime = MediaSource.isTypeSupported(mimeType) ? mimeType
                   : MediaSource.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : 'audio/webm';

    const ms = new MediaSource();
    mediaSourceRef.current = ms;

    const audio = new Audio();
    audio.src = URL.createObjectURL(ms);
    audio.volume = volumeRef.current;
    audioElRef.current = audio;

    ms.addEventListener('sourceopen', () => {
      try {
        const sb = ms.addSourceBuffer(safeMime);
        sourceBufferRef.current = sb;
        sb.mode = 'sequence'; // play chunks in arrival order, ignore timestamps
        sb.addEventListener('updateend', flushMSEQueue);
        mseReadyRef.current = true;
        console.log('[Call] 🚀 MSE ready, mimeType:', safeMime);
        flushMSEQueue();
      } catch (e) { console.error('[Call] MSE init error:', e); }
    }, { once: true });

    audio.play().catch(e => console.warn('[Call] audio.play() blocked:', e.message));
  }, [flushMSEQueue]);

  /** Queue a received chunk for MSE playback */
  const playAudioChunk = useCallback((raw: unknown) => {
    let buffer: ArrayBuffer;
    if (raw instanceof ArrayBuffer) {
      buffer = raw;
    } else if (ArrayBuffer.isView(raw)) {
      const v = raw as Uint8Array;
      buffer = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
    } else {
      console.warn('[Call] Unknown chunk type:', typeof raw);
      return;
    }
    chunkQueueRef.current.push(buffer);
    if (mseReadyRef.current) flushMSEQueue();
  }, [flushMSEQueue]);

  // ── Start recording mic and streaming to server ───────────────────────────
  const startAudioStream = useCallback((stream: MediaStream, sessionId: string) => {
    if (mediaRecorderRef.current) { try { mediaRecorderRef.current.stop(); } catch {} }
    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType;
    const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 };
    if (mimeType) options.mimeType = mimeType;

    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = async (e) => {
      if (e.data.size < 1) return;
      if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
      const socket = socketService.getSocket();
      if (!socket?.connected) return;
      const buffer = await e.data.arrayBuffer();
      console.log('[Call] 📤 chunk', buffer.byteLength, 'bytes');
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
    if (mediaRecorderRef.current) { try { mediaRecorderRef.current.stop(); } catch {} mediaRecorderRef.current = null; }
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
    // MSE teardown
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ''; audioElRef.current = null; }
    if (mediaSourceRef.current?.readyState === 'open') { try { mediaSourceRef.current.endOfStream(); } catch {} }
    mediaSourceRef.current = null; sourceBufferRef.current = null;
    chunkQueueRef.current = []; mseReadyRef.current = false;
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
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  // ── toggleSpeaker ─────────────────────────────────────────────────────────
  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    volumeRef.current = next ? 1.8 : 1.0;
    if (audioElRef.current) audioElRef.current.volume = volumeRef.current;
    setIsSpeakerOn(next);
  }, [isSpeakerOn]);

  // ── startCall ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (sessionId: string, partnerName: string, callerName: string) => {
    if (callStatusRef.current !== 'idle') return;
    callerNameRef.current = callerName;

    // Init MSE NOW — user gesture required for audio.play() to work
    initMSEPlayback(getSupportedMimeType());

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
      if (err.name === 'NotAllowedError') alert('Microphone blocked. Allow access in browser settings.');
      else alert('Could not start call: ' + err.message);
    }
  }, [endCall, initMSEPlayback]);

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingOfferRef.current || callStatusRef.current !== 'ringing') return;
    const { sessionId } = pendingOfferRef.current;
    pendingOfferRef.current = null;
    stopRingBeep();
    if (ringingTimeoutRef.current) { clearTimeout(ringingTimeoutRef.current); ringingTimeoutRef.current = null; }

    // Init MSE NOW — user gesture required for audio.play()
    initMSEPlayback(getSupportedMimeType());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      callSessionIdRef.current = sessionId; setCallSessionId(sessionId);
      socketService.getSocket()?.emit('call:answer', { sessionId });
      setCallStatus('connected'); callStatusRef.current = 'connected';
      startCallTimer();
      startAudioStream(stream, sessionId);
      console.log('[Call] ✅ Accepted — audio streaming started');
    } catch (err: any) {
      alert('Could not answer call: ' + err.message);
      setCallStatus('idle'); callStatusRef.current = 'idle';
    }
  }, [stopRingBeep, initMSEPlayback, startCallTimer, startAudioStream]);

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

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const attach = () => {
      const socket = socketService.getSocket();
      if (!socket) return;

      // Incoming call
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

      // Caller: partner accepted
      socket.on('call:answer', (_data: { sessionId: string }) => {
        if (callStatusRef.current !== 'calling' && callStatusRef.current !== 'reconnecting') return;
        if (callingTimeoutRef.current) { clearTimeout(callingTimeoutRef.current); callingTimeoutRef.current = null; }
        setCallStatus('connected'); callStatusRef.current = 'connected';
        startCallTimer();
        if (localStreamRef.current) startAudioStream(localStreamRef.current, callSessionIdRef.current!);
        console.log('[Call] ✅ Connected via WebSocket relay');
      });

      // Receive audio chunk from partner → feed into MSE
      socket.on('call:audio-chunk', (data: { chunk: unknown }) => {
        if (callStatusRef.current !== 'connected' && callStatusRef.current !== 'reconnecting') return;
        console.log('[Call] 📥 chunk received, MSE ready:', mseReadyRef.current);
        playAudioChunk(data.chunk);
      });

      // Partner disconnected (grace period)
      socket.on('call:partner-reconnecting', (_data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current === 'connected' || callStatusRef.current === 'reconnecting') {
          setCallStatus('reconnecting'); callStatusRef.current = 'reconnecting';
          if (mediaRecorderRef.current?.state === 'recording') { try { mediaRecorderRef.current.pause(); } catch {} }
        }
      });

      // Partner reconnected
      socket.on('call:partner-reconnected', (data: { sessionId: string; startTimestamp: number }) => {
        if (callStatusRef.current !== 'reconnecting') return;
        setCallStatus('connected'); callStatusRef.current = 'connected';
        if (mediaRecorderRef.current?.state === 'paused') { try { mediaRecorderRef.current.resume(); } catch {} }
        startCallTimer(data.startTimestamp);
      });

      // Our own rejoin after page refresh
      socket.on('call:rejoin-success', async (data: { sessionId: string; startTimestamp: number }) => {
        console.log('[Call] Rejoin confirmed');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = stream;
          callSessionIdRef.current = data.sessionId;
          setCallStatus('connected'); callStatusRef.current = 'connected';
          startCallTimer(data.startTimestamp);
          initMSEPlayback(getSupportedMimeType());
          startAudioStream(stream, data.sessionId);
          socket.emit('call:offer', { sessionId: data.sessionId, callerName: callerNameRef.current, isReconnect: true });
        } catch (err) {
          console.error('[Call] Failed to restart audio after rejoin:', err);
          endCall(false);
        }
      });

      socket.on('call:rejoin-failed',     () => endCall(false));
      socket.on('call:end',               () => endCall(false));
      socket.on('call:ended-by-server',   () => endCall(false));
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
  }, [isAuthenticated, endCall, startCallTimer, playAudioChunk, startAudioStream, initMSEPlayback, startRingBeep]);

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
