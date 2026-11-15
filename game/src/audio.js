// Sound without assets: every effect is synthesised with the Web Audio API —
// a noise burst through a low-pass for a shot, a short square blip for a hit, a
// two-tone chime for a kill, a beep for the spike. The context is created on the
// first user gesture, so it stays silent until the player clicks Deploy.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    return buffer;
  }

  function noise(seconds, filterFreq, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + seconds + 0.02);
  }

  function tone(freq, seconds, type, gain, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    shot(kind) {
      if (kind === 'longshot') {
        noise(0.16, 900, 0.7);
        tone(140, 0.12, 'sine', 0.5, 0, 60);
      } else if (kind === 'breacher') {
        noise(0.22, 600, 0.9);
        tone(90, 0.16, 'sine', 0.6, 0, 45);
      } else if (kind === 'hornet') {
        noise(0.09, 1600, 0.45);
      } else {
        noise(0.12, 1200, 0.6);
        tone(160, 0.08, 'sine', 0.35, 0, 70);
      }
    },
    foeShot(distance) {
      const gain = Math.max(0.08, 0.5 - distance / 90);
      noise(0.1, 900, gain);
    },
    hit() {
      tone(1900, 0.05, 'square', 0.16);
    },
    kill() {
      tone(660, 0.07, 'square', 0.18);
      tone(990, 0.1, 'square', 0.18, 0.07);
    },
    hurt() {
      tone(120, 0.15, 'sawtooth', 0.3, 0, 70);
    },
    reload() {
      tone(500, 0.04, 'square', 0.12);
      tone(700, 0.04, 'square', 0.12, 0.18);
    },
    dry() {
      tone(300, 0.05, 'square', 0.14);
    },
    plantBeep() {
      tone(1250, 0.07, 'square', 0.2);
    },
    plant() {
      tone(880, 0.12, 'square', 0.2);
      tone(880, 0.12, 'square', 0.2, 0.16);
    },
    defuseTick() {
      tone(1500, 0.04, 'square', 0.1);
    },
    roundWin() {
      tone(523, 0.12, 'triangle', 0.25);
      tone(659, 0.12, 'triangle', 0.25, 0.12);
      tone(784, 0.22, 'triangle', 0.25, 0.24);
    },
    roundLose() {
      tone(392, 0.16, 'triangle', 0.25);
      tone(311, 0.22, 'triangle', 0.25, 0.16);
    },
    buy() {
      tone(880, 0.06, 'square', 0.14);
      tone(1174, 0.08, 'square', 0.14, 0.06);
    },
    denied() {
      tone(220, 0.09, 'square', 0.16);
    },
    explode() {
      noise(0.6, 400, 1.0);
      tone(70, 0.5, 'sine', 0.7, 0, 30);
    },
  };
}
