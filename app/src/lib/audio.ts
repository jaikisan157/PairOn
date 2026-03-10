// Sound effects using Web Audio API - no files needed
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

// Must be called from a user gesture (click/tap) to unlock audio on desktop
export function initAudio() {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        // Play a silent sound to fully unlock
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
    } catch {
        // Audio not supported
    }
}

// Auto-unlock on first user interaction
if (typeof document !== 'undefined') {
    const unlock = () => {
        initAudio();
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
}

function playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.3,
    startDelay: number = 0
) {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);

        // Fade in and out for smooth sound
        gainNode.gain.setValueAtTime(0, ctx.currentTime + startDelay);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.02);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + startDelay + duration);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(ctx.currentTime + startDelay);
        oscillator.stop(ctx.currentTime + startDelay + duration);
    } catch {
        // Audio not supported, silently fail
    }
}

// Match found / Connected - ascending three-note chime (C-E-G)
export function playMatchSound() {
    playTone(523, 0.15, 'sine', 0.25, 0);      // C5
    playTone(659, 0.15, 'sine', 0.25, 0.12);    // E5
    playTone(784, 0.25, 'sine', 0.2, 0.24);     // G5
}

// Message received - short subtle blip
export function playMessageSound() {
    playTone(880, 0.08, 'sine', 0.15, 0);       // A5 - quick blip
    playTone(1047, 0.1, 'sine', 0.1, 0.06);     // C6 - soft follow
}

// Message sent - single quick soft blip
export function playSendSound() {
    playTone(700, 0.06, 'sine', 0.1, 0);
}

// Disconnect - descending tone (A-E-C)
export function playDisconnectSound() {
    playTone(440, 0.15, 'sine', 0.2, 0);        // A4
    playTone(330, 0.2, 'sine', 0.15, 0.12);     // E4
    playTone(262, 0.3, 'sine', 0.1, 0.28);      // C4 - low end
}
