let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playPickupSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(340, now + 0.045);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.055);
}

export function playRotateSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(360, now + 0.04);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

export function playSnapSound(enabled: boolean, clusterSize = 2): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tactile thump
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(160, now);
  thump.frequency.exponentialRampToValueAtTime(72, now + 0.08);
  thumpGain.gain.setValueAtTime(0.16, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
  thump.connect(thumpGain);
  thumpGain.connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.09);

  // Crisp harmonic click scaled subtly with cluster size
  const baseFreq = Math.min(880, 440 + clusterSize * 18);
  const chime = ctx.createOscillator();
  const chimeGain = ctx.createGain();
  chime.type = 'triangle';
  chime.frequency.setValueAtTime(baseFreq, now + 0.01);
  chime.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.11);
  chimeGain.gain.setValueAtTime(0.09, now + 0.01);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  chime.connect(chimeGain);
  chimeGain.connect(ctx.destination);
  chime.start(now + 0.01);
  chime.stop(now + 0.14);
}

export function playBoardLockSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const start = now + i * 0.055;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.09, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  });
}

export function playVictorySound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const start = now + i * 0.085;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.11, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.34);
  });
}

export function triggerHaptic(enabled: boolean, durationMs = 30): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Ignore on unsupported browsers
    }
  }
}
