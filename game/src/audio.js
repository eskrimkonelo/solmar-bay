// Sound, all synthesized with WebAudio: no audio files, nothing to download. Engine hum follows
// the car's speed, the siren wails two tones, gunshots are filtered noise, and the mission
// jingle is a few triangle-wave notes. Audio starts only after a user gesture (browsers demand
// it) and M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    /** Call from any user gesture so the browser unlocks audio. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine note; speed01 is 0..1 of top speed. Call every frame while driving. */
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, ctx.currentTime, 0.08);
    },
    /** Two-tone siren while any police chase is active; call every frame. */
    siren(on, dt) {
      if (!ensure()) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt;
      const hi = Math.floor(sirenTimer / 0.45) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(hi ? 880 : 659, ctx.currentTime, 0.03);
      sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
    },
    shoot() {
      noise(0.12, 0.5, 1800);
      tone(180, 0.08, 'square', 0.25, 0, 60);
    },
    crash() {
      noise(0.25, 0.6, 500);
      tone(90, 0.2, 'sine', 0.4, 0, 40);
    },
    hit() {
      tone(220, 0.07, 'square', 0.2, 0, 110);
    },
    pickup() {
      tone(660, 0.09, 'triangle', 0.25);
      tone(990, 0.12, 'triangle', 0.25, 0.09);
    },
    mission() {
      tone(523, 0.14, 'triangle', 0.3);
      tone(659, 0.14, 'triangle', 0.3, 0.13);
      tone(784, 0.22, 'triangle', 0.3, 0.26);
    },
    busted() {
      tone(392, 0.25, 'sawtooth', 0.25, 0, 196);
      tone(311, 0.4, 'sawtooth', 0.25, 0.24, 155);
    },
    click() {
      tone(700, 0.05, 'square', 0.15);
    },
  };
}
