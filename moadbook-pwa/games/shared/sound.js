const STORAGE_KEY = 'moadbook.games.sound.v1';
const AudioContextClass = typeof window !== 'undefined'
  ? (window.AudioContext || window.webkitAudioContext)
  : null;
let audioContext = null;
let enabled = true;
try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* sound stays enabled when storage is unavailable */ }

const PRESETS = {
  tap: { notes: [620], duration: 0.045, wave: 'sine', volume: 0.028 },
  flip: { notes: [430, 610], duration: 0.055, wave: 'triangle', volume: 0.028 },
  success: { notes: [523, 659, 784], duration: 0.105, wave: 'triangle', volume: 0.045 },
  score: { notes: [740, 988], duration: 0.075, wave: 'sine', volume: 0.035 },
  finish: { notes: [523, 659, 784, 1047], duration: 0.12, wave: 'triangle', volume: 0.045 },
  error: { notes: [294, 220], duration: 0.095, wave: 'sine', volume: 0.035 },
};

function context() {
  if (!enabled || !AudioContextClass) return null;
  try { audioContext ||= new AudioContextClass(); return audioContext; }
  catch { return null; }
}

export function isGameSoundEnabled() { return enabled; }

export function setGameSoundEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* preference is optional */ }
  if (!enabled && audioContext?.state === 'running') void audioContext.suspend().catch(() => {});
  if (enabled && audioContext?.state === 'suspended') void audioContext.resume().catch(() => {});
  return enabled;
}

export function playGameSound(name = 'tap') {
  if (!enabled) return;
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const preset = PRESETS[name] || PRESETS.tap;
  const now = ctx.currentTime + 0.012;
  preset.notes.forEach((frequency, index) => {
    const start = now + index * preset.duration * 0.82;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = preset.wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(preset.volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + preset.duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + preset.duration + 0.015);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
