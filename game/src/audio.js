// All sound is synthesised with WebAudio — no audio files, no network. The context is created
// lazily on the first user gesture (browsers block audio before that) and every effect is a short
// oscillator/noise burst. A tiny bassline loop plays while running.
export function createAudio() {
  let context = null;
  let master = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  // A cheerful, slightly frantic bassline in A minor, one note per 8th at 132 bpm.
  const BASSLINE = [110, 0, 110, 130.8, 0, 98, 0, 110, 87.3, 0, 98, 110, 0, 130.8, 146.8, 0];
  const STEP_SECONDS = 60 / 132 / 2;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  function scheduleMusic() {
    if (!ensure() || muted) return;
    const freq = BASSLINE[musicStep % BASSLINE.length];
    musicStep += 1;
    if (freq > 0) tone(freq, STEP_SECONDS * 0.9, 'triangle', 0.16);
    if (musicStep % 8 === 0) tone(660, 0.08, 'sine', 0.05);
    musicTimer = window.setTimeout(scheduleMusic, STEP_SECONDS * 1000);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    startMusic() {
      this.unlock();
      if (musicTimer === null) scheduleMusic();
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearTimeout(musicTimer);
        musicTimer = null;
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.stopMusic();
    },
    isMuted() {
      return muted;
    },
    jump() {
      tone(320, 0.16, 'square', 0.12, 640);
    },
    doubleJump() {
      tone(420, 0.14, 'square', 0.12, 840);
    },
    dash() {
      noise(0.18, 0.2, 2400);
      tone(180, 0.14, 'sawtooth', 0.1, 90);
    },
    pickup(combo) {
      const base = 660 + Math.min(combo, 8) * 55;
      tone(base, 0.1, 'sine', 0.18);
      tone(base * 1.5, 0.14, 'sine', 0.14);
    },
    golden() {
      [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => tone(f, 0.16, 'sine', 0.16), i * 55));
    },
    powerup() {
      [392, 523, 659, 784].forEach((f, i) => window.setTimeout(() => tone(f, 0.14, 'triangle', 0.16), i * 60));
    },
    hit() {
      noise(0.25, 0.3, 900);
      tone(140, 0.3, 'sawtooth', 0.22, 55);
    },
    gobble() {
      // Three descending clucks: the turkey's alarm call.
      [520, 430, 340].forEach((f, i) => window.setTimeout(() => tone(f, 0.09, 'square', 0.14, f * 0.7), i * 90));
    },
    farmerClose() {
      tone(220, 0.2, 'sawtooth', 0.14, 180);
      tone(220, 0.2, 'sawtooth', 0.14, 180);
    },
    zone() {
      [440, 554, 659].forEach((f, i) => window.setTimeout(() => tone(f, 0.18, 'triangle', 0.16), i * 80));
    },
    caught() {
      [330, 262, 196, 131].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'sawtooth', 0.18), i * 160));
    },
    escaped() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => window.setTimeout(() => tone(f, 0.28, 'triangle', 0.18), i * 110));
    },
    click() {
      tone(700, 0.05, 'sine', 0.1);
    },
  };
}
