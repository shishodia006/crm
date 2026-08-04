// Short two-tone "ding" synthesized with Web Audio — no audio file to ship/host.
export function playNotificationSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* audio not available in this browser/context — non-critical */ }
}

// Looping ringtone for the Voice call widget — synthesized, no audio file.
// `kind: 'incoming'` is a classic double-burst ring (~2s cycle, like a phone
// ringing); `kind: 'ringback'` is a single softer tone (~4s cycle, like the
// tone you hear while a call you placed is still ringing on the other end).
// Returns a controller — call .stop() when the call is answered/ended/cancelled.
export function playRingtone(kind = 'incoming') {
  let stopped = false;
  let ctx = null;
  let timeoutId = null;

  const ringOnce = () => {
    if (stopped) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!ctx) ctx = new Ctx();
      const bursts = kind === 'incoming' ? [0, 0.4] : [0];
      const freq = kind === 'incoming' ? 480 : 425;
      const duration = kind === 'incoming' ? 0.35 : 1.2;
      bursts.forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.03);
        gain.gain.linearRampToValueAtTime(0.15, start + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      });
    } catch { /* audio not available — non-critical, just silent */ }
    timeoutId = setTimeout(ringOnce, kind === 'incoming' ? 2000 : 4000);
  };
  ringOnce();

  return {
    stop() {
      stopped = true;
      clearTimeout(timeoutId);
      ctx?.close?.();
    },
  };
}
