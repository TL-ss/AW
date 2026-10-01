/**
 * sfx.js — procedural, dependency-free sound effects for a browser Minecraft clone.
 *
 * Everything is synthesized at runtime from oscillators, a shared noise buffer,
 * biquad filters, gain nodes and an optional stereo panner. There are no
 * imports, no network requests and no sample files.
 *
 * All entry points are safe to call before `initAudio()` and in environments
 * without a usable AudioContext: they degrade to silent no-ops and never throw
 * (including on suspended or closed contexts).
 *
 * @module audio/sfx
 */

/* ------------------------------------------------------------------ *
 * Module state
 * ------------------------------------------------------------------ */

/** Hard ceiling on simultaneously live voices. */
const MAX_VOICES = 24;

/** Current master volume, 0..1. */
let volume = 0.8;

/** @type {AudioContext|null} Live context, or null when audio is unavailable. */
let ctx = null;

/** Master gain node feeding the destination. */
let master = null;

/** True when no AudioContext could be created: every call becomes a no-op. */
let silentMode = false;

/** Cached shared white-noise buffer. */
let noiseBuffer = null;

/** Peak amplitude of the cached noise buffer. */
const NOISE_AMPLITUDE = 0.9;

/** Live voices: voiceId -> { nodes, timer, retire }. */
const voices = new Map();

/** Lifetime count of successfully scheduled voices (diagnostics). */
let voicesScheduled = 0;

/** Count of voices dropped because the concurrency cap was reached. */
let voicesDropped = 0;

/** Internal id source for voices. */
let voiceSeq = 0;

/** setTimeout that survives exotic sandboxes. */
const later = typeof setTimeout === 'function' ? setTimeout : () => 0;

/** clearTimeout that survives exotic sandboxes. */
const cancelLater = typeof clearTimeout === 'function' ? clearTimeout : () => {};

/* ------------------------------------------------------------------ *
 * Diagnostics hook (optional; used by tools/sfx-check.html)
 * ------------------------------------------------------------------ */

try {
  if (typeof globalThis !== 'undefined') {
    Object.defineProperty(globalThis, '__sfxDebug', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: {
        get active() { return voices.size; },
        get scheduled() { return voicesScheduled; },
        get dropped() { return voicesDropped; },
        get cap() { return MAX_VOICES; },
        get silentMode() { return silentMode; },
        get hasContext() { return !!ctx; },
        get context() { return ctx; },
        get state() {
          try { return ctx && typeof ctx.state === 'string' ? ctx.state : null; } catch (_) { return null; }
        },
        get sampleRate() {
          try { return ctx && ctx.sampleRate ? ctx.sampleRate : 0; } catch (_) { return 0; }
        },
        names() { return Object.keys(SOUNDS); },
        reset() { voicesScheduled = 0; voicesDropped = 0; }
      }
    });
  }
} catch (_) { /* diagnostics are optional */ }

/* ------------------------------------------------------------------ *
 * Small utilities
 * ------------------------------------------------------------------ */

/** @returns {number} random float in [lo, hi) */
function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

/** @returns {number} v clamped into [lo, hi] */
function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** @returns {boolean} true for finite numbers */
function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

/** @returns {AudioContext|null} the context if it still exists and is usable */
function liveCtx() {
  if (!ctx) return null;
  try {
    if (ctx.state === 'closed') return null;
  } catch (_) {
    return null;
  }
  return ctx;
}

/**
 * Build (once per context) a shared white-noise AudioBuffer.
 * @returns {AudioBuffer|null}
 */
function getNoiseBuffer() {
  const c = liveCtx();
  if (!c) return null;
  try {
    if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  } catch (_) { noiseBuffer = null; }
  const frames = Math.max(1, Math.floor(c.sampleRate * 2));
  let buf;
  try {
    buf = c.createBuffer(1, frames, c.sampleRate);
  } catch (_) {
    return null;
  }
  let data;
  try {
    data = buf.getChannelData(0);
  } catch (_) {
    return null;
  }
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
  noiseBuffer = buf;
  return buf;
}

/**
 * Apply a click-free attack/hold/decay envelope to a gain param.
 * @param {AudioParam} param
 * @param {number} t0 start time
 * @param {number} peak peak gain
 * @param {number} attack attack seconds
 * @param {number} hold seconds held at peak
 * @param {number} decay decay seconds
 */
function applyEnv(param, t0, peak, attack, hold, decay) {
  const p = Math.max(peak, 1e-5);
  const a = Math.max(attack, 0.0008);
  const h = Math.max(hold, 0);
  const d = Math.max(decay, 0.005);
  try {
    param.setValueAtTime(1e-5, t0);
    param.exponentialRampToValueAtTime(p, t0 + a);
    if (h > 0) param.setValueAtTime(p, t0 + a + h);
    param.exponentialRampToValueAtTime(1e-5, t0 + a + h + d);
    param.setValueAtTime(0, t0 + a + h + d + 0.001);
  } catch (_) {
    try { param.value = 0; } catch (__) { /* give up quietly */ }
  }
}

/* ------------------------------------------------------------------ *
 * Voice plumbing
 * ------------------------------------------------------------------ */

/**
 * Open a voice: a tracked set of nodes feeding one destination that retires
 * together as soon as the scheduled tail has elapsed (`onended` when available,
 * a timer as the backstop).
 * @param {AudioContext} c
 * @param {AudioNode} dest stereo panner or master gain
 * @returns {{id:number, shim:object, nodes:Array, retire:Function, arm:Function}|null}
 */
function openVoice(c, dest) {
  let bus;
  try {
    bus = c.createGain();
    bus.gain.value = 1;
    bus.connect(dest);
  } catch (_) {
    return null;
  }
  const id = ++voiceSeq;
  const nodes = [bus];
  const record = { id, nodes, timer: 0, done: false };
  voices.set(id, record);
  voicesScheduled++;

  const retire = () => {
    if (record.done) return;
    record.done = true;
    voices.delete(id);
    if (record.timer) cancelLater(record.timer);
    for (let i = 0; i < nodes.length; i++) {
      try { nodes[i].disconnect(); } catch (_) { /* already gone */ }
    }
    nodes.length = 0;
  };
  record.retire = retire;

  const wrapNode = (node) => {
    if (!node) return node;
    nodes.push(node);
    if ('onended' in node) {
      try { node.onended = () => retire(); } catch (_) { /* optional */ }
    }
    return new Proxy(node, {
      get(target, prop) {
        if (prop === 'connect') {
          return (d, ...rest) => {
            const real = (d && d.__sfxReal) ? d.__sfxReal : d;
            try { target.connect(real, ...rest); } catch (_) { /* ignore */ }
            return d;
          };
        }
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, prop, value) {
        try { target[prop] = value; } catch (_) { /* ignore */ }
        return true;
      }
    });
  };

  // The shim looks like the AudioContext but hands out tracked node wrappers,
  // so designers can stay oblivious to voices, cleanup and panning.
  const shim = new Proxy(c, {
    get(target, prop) {
      if (prop === '__sfxReal') return target;
      if (prop === 'createGain') return () => wrapNode(target.createGain());
      if (prop === 'createOscillator') return () => wrapNode(target.createOscillator());
      if (prop === 'createBufferSource') return () => wrapNode(target.createBufferSource());
      if (prop === 'createBiquadFilter') return () => wrapNode(target.createBiquadFilter());
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    }
  });

  /** Arm the release timer for the tail that was just scheduled. */
  const arm = (seconds) => {
    const ms = Math.max(40, (isNum(seconds) ? seconds : 0.3) * 1000 + 120);
    if (record.timer) cancelLater(record.timer);
    record.timer = later(retire, ms);
  };

  return { id, shim, nodes, bus, retire, arm };
}

/* ------------------------------------------------------------------ *
 * DSP builders
 * ------------------------------------------------------------------ */

/**
 * Oscillator voice: pitch (optionally swept/wobbled) -> optional filters ->
 * amplitude envelope.
 * @returns {number} scheduled end time, or 0 when nothing was scheduled
 */
function buildTone(c, opts) {
  const t0 = (isNum(opts.t0) ? opts.t0 : c.currentTime) + (isNum(opts.delay) ? opts.delay : 0);
  const dur = Math.max(0.01, opts.dur || 0.08);
  const atk = opts.attack === undefined ? 0.004 : opts.attack;
  const hold = opts.hold === undefined ? 0 : opts.hold;
  let osc;
  try {
    osc = c.createOscillator();
  } catch (_) {
    return 0;
  }
  try {
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, opts.from || 200), t0);
    if (opts.to && Math.abs(opts.to - (opts.from || 0)) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
    }
  } catch (_) { /* keep whatever the node accepted */ }

  // Non-linear pitch wobble (bleats, growls, squeals).
  if (opts.wobble > 0) {
    try {
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = opts.wobbleRate || 22;
      const depth = c.createGain();
      depth.gain.value = opts.wobble;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.02);
    } catch (_) { /* wobble is decorative */ }
  }

  let node = osc;
  if (opts.bandpass) {
    try {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(Math.max(20, opts.bandpass), t0);
      bp.Q.value = opts.q === undefined ? 1 : opts.q;
      if (opts.bandpassTo && Math.abs(opts.bandpassTo - opts.bandpass) > 1) {
        bp.frequency.exponentialRampToValueAtTime(Math.max(20, opts.bandpassTo), t0 + dur);
      }
      node.connect(bp);
      node = bp;
    } catch (_) { /* skip stage */ }
  }
  if (opts.lowpass) {
    try {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.max(20, opts.lowpass), t0);
      lp.Q.value = opts.lpQ === undefined ? 0.7 : opts.lpQ;
      node.connect(lp);
      node = lp;
    } catch (_) { /* skip stage */ }
  }
  let amp;
  try {
    amp = c.createGain();
  } catch (_) {
    return 0;
  }
  applyEnv(amp.gain, t0, opts.gain === undefined ? 0.2 : opts.gain, atk, hold, dur - atk - hold);
  node.connect(amp);
  try {
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (_) {
    return 0;
  }
  return t0 + dur + 0.05;
}

/**
 * Noise voice: shared noise buffer -> optional filter sweep -> envelope.
 * @returns {number} scheduled end time, or 0 when nothing was scheduled
 */
function buildNoise(c, opts) {
  const buf = getNoiseBuffer();
  if (!buf) return 0;
  const t0 = (isNum(opts.t0) ? opts.t0 : c.currentTime) + (isNum(opts.delay) ? opts.delay : 0);
  const dur = Math.max(0.005, opts.dur || 0.08);
  const atk = opts.attack === undefined ? 0.002 : opts.attack;
  const hold = opts.hold === undefined ? 0 : opts.hold;
  let src;
  try {
    src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (src.playbackRate) src.playbackRate.value = clamp(opts.noiseRate || 1, 0.25, 4);
  } catch (_) {
    return 0;
  }
  let node = src;

  const stages = [];
  if (opts.bandpass) stages.push(['bandpass', opts.bandpass, opts.bandpassTo, opts.q === undefined ? 0.8 : opts.q]);
  if (opts.lowpass) stages.push(['lowpass', opts.lowpass, opts.lowpassTo, opts.lpQ === undefined ? 0.7 : opts.lpQ]);
  if (opts.highpass) stages.push(['highpass', opts.highpass, opts.highpassTo, opts.hpQ === undefined ? 0.7 : opts.hpQ]);
  for (let i = 0; i < stages.length; i++) {
    const spec = stages[i];
    try {
      const f = c.createBiquadFilter();
      f.type = spec[0];
      f.frequency.setValueAtTime(Math.max(20, spec[1]), t0);
      if (spec[2] && Math.abs(spec[2] - spec[1]) > 1) {
        f.frequency.exponentialRampToValueAtTime(Math.max(20, spec[2]), t0 + dur);
      }
      f.Q.value = spec[3];
      node.connect(f);
      node = f;
    } catch (_) { /* skip stage */ }
  }

  let amp;
  try {
    amp = c.createGain();
  } catch (_) {
    return 0;
  }
  applyEnv(amp.gain, t0, opts.gain === undefined ? 0.2 : opts.gain, atk, hold, dur - atk - hold);
  if (opts.ampSweep) {
    // Extra gain movement for swells and crunchy decays.
    try {
      const mult = c.createGain();
      mult.gain.setValueAtTime(opts.ampSweep[0], t0);
      mult.gain.linearRampToValueAtTime(opts.ampSweep[1], t0 + dur * 0.5);
      mult.gain.linearRampToValueAtTime(opts.ampSweep[2], t0 + dur);
      mult.connect(amp);
      node.connect(mult);
    } catch (_) {
      node.connect(amp);
    }
  } else {
    node.connect(amp);
  }
  try {
    src.start(t0, rand(0, 1.2));
    src.stop(t0 + dur + 0.02);
  } catch (_) {
    return 0;
  }
  return t0 + dur + 0.05;
}

/** Convert a note name such as "C5" or "A#4" to Hz. */
function noteHz(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name));
  if (!m) return 440;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let semi = base[m[1].toLowerCase()];
  if (m[2] === '#') semi += 1;
  else if (m[2] === 'b') semi -= 1;
  return 440 * Math.pow(2, (semi - 9) / 12 + (Number(m[3]) - 4));
}

/** @returns {number} the later of two candidate end times */
function maxEnd(a, b) {
  return b > a ? b : a;
}

/* ------------------------------------------------------------------ *
 * Sound designers — (ctx, t0, gain, rate) -> end time
 * ------------------------------------------------------------------ */

/** Stone: tight clicky bandpass burst around 800 Hz plus a low tick. */
function digStone(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.115, gain: g * 0.52, bandpass: 800 * r, q: 1.5,
    bandpassTo: 640 * r, noiseRate: r * 1.1
  });
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.05, type: 'triangle', from: 176 * r, to: 104 * r, lowpass: 620, gain: g * 0.3
  }));
  return end;
}

/** Gravel: brighter, crunchier double-layer bandpass burst. */
function digGravel(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.17, gain: g * 0.44, bandpass: 1200 * r, q: 0.9,
    bandpassTo: 820 * r, noiseRate: r * 1.05, ampSweep: [0.75, 1, 0.25]
  });
  end = maxEnd(end, buildNoise(c, {
    t0: t0 + 0.02, dur: 0.07, gain: g * 0.24, bandpass: 2600 * r, q: 2.4, noiseRate: r * 2.1
  }));
  return end;
}

/** Sand: airy high-passed hiss with almost no low end. */
function digSand(c, t0, g, r) {
  return buildNoise(c, {
    t0, dur: 0.2, gain: g * 0.34, bandpass: 3000 * r, q: 0.5, bandpassTo: 2000 * r,
    highpass: 1400, noiseRate: r * 1.3, ampSweep: [0.7, 1, 0.15]
  });
}

/** Grass: soft mid-range rustle with a little crunch on top. */
function digGrass(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.14, gain: g * 0.34, bandpass: 1700 * r, q: 0.6, lowpass: 4200,
    noiseRate: r * 1.2, ampSweep: [0.4, 1, 0.2]
  });
  end = maxEnd(end, buildNoise(c, {
    t0: t0 + 0.03, dur: 0.05, gain: g * 0.16, bandpass: 2600, q: 1.6
  }));
  return end;
}

/** Glass: sharp noise burst plus high inharmonic partials with fast decay. */
function digGlass(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.09, gain: g * 0.42, bandpass: 3400 * r, q: 0.8, highpass: 1600, noiseRate: r * 1.4
  });
  end = maxEnd(end, buildTone(c, { t0, dur: 0.3, type: 'sine', from: 2489 * r, to: 2460 * r, gain: g * 0.2 }));
  end = maxEnd(end, buildTone(c, { t0: t0 + 0.006, dur: 0.19, type: 'sine', from: 3721 * r, to: 3660 * r, gain: g * 0.13 }));
  end = maxEnd(end, buildTone(c, { t0: t0 + 0.012, dur: 0.1, type: 'sine', from: 5610 * r, gain: g * 0.07 }));
  return end;
}

/** Wool: heavily lowpassed soft thud, no transient snap. */
function digWool(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.17, gain: g * 0.4, lowpass: 420 * r, lpQ: 0.6, noiseRate: r * 0.8
  });
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.09, type: 'sine', from: 128 * r, to: 74 * r, gain: g * 0.22
  }));
  return end;
}

/** Wood: noise burst plus a short low marimba-ish tone. */
function digWood(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.09, gain: g * 0.36, bandpass: 1150 * r, q: 1.1, bandpassTo: 900 * r, noiseRate: r * 1.2
  });
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.19, type: 'triangle', from: 344 * r, to: 322 * r, lowpass: 2400, gain: g * 0.34
  }));
  end = maxEnd(end, buildTone(c, { t0, dur: 0.09, type: 'sine', from: 688 * r, gain: g * 0.1 }));
  return end;
}

/** Block placement: soft woody thunk without the dig transient. */
function place(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.16, type: 'triangle', from: 286 * r, to: 228 * r, lowpass: 2000, gain: g * 0.36
  });
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.08, gain: g * 0.26, bandpass: 620 * r, q: 0.9, lowpass: 1800
  }));
  return end;
}

/** Player hurt: short down-pitched sawtooth growl. */
function playerHurt(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.24, type: 'sawtooth', from: 330 * r, to: 118 * r,
    bandpass: 620, q: 0.8, lowpass: 1300, lpQ: 2.2, gain: g * 0.3
  });
  end = maxEnd(end, buildNoise(c, { t0, dur: 0.07, gain: g * 0.16, bandpass: 900, q: 1.2 }));
  return end;
}

/** Player death: longer, lower, two-stage groan. */
function playerDeath(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.9, type: 'sawtooth', from: 268 * r, to: 62 * r,
    bandpass: 430, q: 0.9, lowpass: 1100, lpQ: 2, gain: g * 0.34,
    attack: 0.01, wobble: 8, wobbleRate: 7
  });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.05, dur: 0.7, type: 'triangle', from: 132 * r, to: 44 * r, gain: g * 0.2, attack: 0.02
  }));
  return end;
}

/** Pig: short nasal squeal with fast pitch jitter. */
function mobPig(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.26, type: 'sawtooth', from: 540 * r, to: 700 * r,
    bandpass: 1250, q: 2.6, lowpass: 3200, gain: g * 0.24,
    attack: 0.012, wobble: 70 * r, wobbleRate: 26
  });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.05, dur: 0.18, type: 'square', from: 760 * r, to: 380 * r,
    bandpass: 1900, q: 3.2, gain: g * 0.1, wobble: 90, wobbleRate: 34
  }));
  return end;
}

/** Sheep: bleating vibrato tone. */
function mobSheep(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.52, type: 'sawtooth', from: 372 * r, to: 322 * r,
    bandpass: 980, q: 1.6, lowpass: 3000, gain: g * 0.24,
    attack: 0.015, wobble: 34 * r, wobbleRate: 17
  });
  end = maxEnd(end, buildTone(c, { t0, dur: 0.4, type: 'sine', from: 186 * r, to: 168 * r, gain: g * 0.1 }));
  return end;
}

/** Zombie: low growled formant-ish pulse. */
function mobZombie(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.58, type: 'sawtooth', from: 118 * r, to: 92 * r,
    bandpass: 340, q: 3.4, lowpass: 1500, gain: g * 0.3,
    attack: 0.03, wobble: 10 * r, wobbleRate: 9
  });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.28, dur: 0.36, type: 'sawtooth', from: 96 * r, to: 72 * r,
    bandpass: 470, q: 3, lowpass: 1400, gain: g * 0.24, attack: 0.03, wobble: 8, wobbleRate: 7
  }));
  end = maxEnd(end, buildNoise(c, { t0, dur: 0.5, gain: g * 0.09, bandpass: 520 * r, q: 1.1 }));
  return end;
}

/** Generic mob hurt: mid-range growl with a noise edge. */
function mobHurt(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.26, type: 'sawtooth', from: 232 * r, to: 130 * r,
    bandpass: 660, q: 1.8, lowpass: 2200, gain: g * 0.28, attack: 0.008
  });
  end = maxEnd(end, buildNoise(c, { t0, dur: 0.09, gain: g * 0.14, bandpass: 1400 * r, q: 1.3 }));
  return end;
}

/** Item pickup: two quick rising blips. */
function itemPickup(c, t0, g, r) {
  let end = buildTone(c, { t0, dur: 0.07, type: 'triangle', from: 780 * r, to: 900 * r, gain: g * 0.26 });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.055, dur: 0.1, type: 'triangle', from: 1170 * r, to: 1500 * r, gain: g * 0.24
  }));
  return end;
}

/** Item pop: very short sine blip with a fast pitch drop. */
function itemPop(c, t0, g, r) {
  let end = buildTone(c, { t0, dur: 0.1, type: 'sine', from: 660 * r, to: 230 * r, gain: g * 0.32 });
  end = maxEnd(end, buildTone(c, { t0, dur: 0.05, type: 'triangle', from: 1320 * r, to: 900 * r, gain: g * 0.1 }));
  return end;
}

/** UI click: very short triangle blip with a fast pitch drop. */
function click(c, t0, g, r) {
  return buildTone(c, {
    t0, dur: 0.045, type: 'triangle', from: 1150 * r, to: 620 * r,
    lowpass: 5200, gain: g * 0.28, attack: 0.001
  });
}

/** Open: rising woody creak plus a soft latch thunk. */
function openSfx(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.36, type: 'sawtooth', from: 168 * r, to: 268 * r,
    bandpass: 900, bandpassTo: 1500, q: 4.5, lowpass: 2600, gain: g * 0.18,
    attack: 0.02, wobble: 12, wobbleRate: 15
  });
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.34, gain: g * 0.14, bandpass: 1400 * r, bandpassTo: 2400 * r, q: 2.4,
    ampSweep: [0.35, 1, 0.3]
  }));
  end = maxEnd(end, buildTone(c, { t0: t0 + 0.3, dur: 0.12, type: 'sine', from: 150 * r, to: 96 * r, gain: g * 0.2 }));
  return end;
}

/** Close: descending creak and a solid thunk. */
function closeSfx(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.26, type: 'sawtooth', from: 268 * r, to: 158 * r,
    bandpass: 1400, bandpassTo: 780, q: 4, lowpass: 2400, gain: g * 0.18, attack: 0.012
  });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.12, dur: 0.16, type: 'triangle', from: 310 * r, to: 150 * r, lowpass: 1800, gain: g * 0.3
  }));
  end = maxEnd(end, buildNoise(c, {
    t0: t0 + 0.12, dur: 0.09, gain: g * 0.2, bandpass: 700 * r, q: 0.9, lowpass: 1500
  }));
  return end;
}

/** Splash: long noise swell through a sweeping lowpass. */
function splash(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.95, gain: g * 0.4, lowpass: 500, lowpassTo: 3200, lpQ: 1.1,
    highpass: 220, noiseRate: r * 1.05, attack: 0.16, ampSweep: [0.25, 1, 0.18]
  });
  end = maxEnd(end, buildNoise(c, {
    t0: t0 + 0.05, dur: 0.5, gain: g * 0.16, bandpass: 1800 * r, bandpassTo: 900 * r,
    q: 0.7, attack: 0.05
  }));
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.22, type: 'sine', from: 220 * r, to: 70 * r, gain: g * 0.18, attack: 0.01
  }));
  return end;
}

/** Explosion: broadband noise with a long tail plus a low sine thump. */
function explode(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 1.5, gain: g * 0.55, lowpass: 2600, lowpassTo: 320, lpQ: 0.8,
    highpass: 40, noiseRate: r * 0.95, attack: 0.008, ampSweep: [1, 0.6, 0.2]
  });
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.35, gain: g * 0.3, bandpass: 620 * r, bandpassTo: 180 * r, q: 0.6
  }));
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.75, type: 'sine', from: 92 * r, to: 32 * r, gain: g * 0.5, attack: 0.006
  }));
  return end;
}

/** TNT fuse: sparse crackling hiss. */
function fuse(c, t0, g, r) {
  let end = 0;
  for (let i = 0; i < 7; i++) {
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + i * 0.115 + rand(-0.02, 0.02),
      dur: rand(0.03, 0.07),
      gain: g * rand(0.12, 0.24),
      bandpass: rand(1800, 4200) * r,
      q: rand(1.5, 3),
      highpass: 900,
      noiseRate: r * rand(1.2, 1.8)
    }));
  }
  return end;
}

/** Level up: short rising bell arpeggio. */
function levelup(c, t0, g, r) {
  const notes = ['C5', 'E5', 'G5', 'A5', 'C6', 'E6'];
  let end = 0;
  for (let i = 0; i < notes.length; i++) {
    const f = noteHz(notes[i]) * r;
    const st = t0 + i * 0.085;
    end = maxEnd(end, buildTone(c, {
      t0: st, dur: 0.7 - i * 0.05, type: 'triangle', from: f, to: f * 0.998, gain: g * 0.16
    }));
    end = maxEnd(end, buildTone(c, { t0: st, dur: 0.4, type: 'sine', from: f * 2.01, gain: g * 0.055 }));
  }
  return end;
}

/** Bow release: taut string thwip. */
function bow(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 0.13, gain: g * 0.3, bandpass: 1500 * r, bandpassTo: 600 * r, q: 1.6, noiseRate: r * 1.4
  });
  end = maxEnd(end, buildTone(c, {
    t0, dur: 0.12, type: 'triangle', from: 420 * r, to: 170 * r, lowpass: 2200, gain: g * 0.18
  }));
  return end;
}

/** Arrow flight: short airy whoosh. */
function arrow(c, t0, g, r) {
  return buildNoise(c, {
    t0, dur: 0.3, gain: g * 0.26, bandpass: 2400 * r, bandpassTo: 900 * r, q: 1.2,
    highpass: 700, attack: 0.03, ampSweep: [0.2, 1, 0.25], noiseRate: r * 1.2
  });
}

/** Door: hinge creak sweep plus a latch clunk. */
function door(c, t0, g, r) {
  let end = buildTone(c, {
    t0, dur: 0.42, type: 'sawtooth', from: 142 * r, to: 236 * r,
    bandpass: 700, bandpassTo: 1150, q: 5, lowpass: 2400, gain: g * 0.16,
    attack: 0.025, wobble: 16, wobbleRate: 12
  });
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.4, gain: g * 0.12, bandpass: 1100 * r, bandpassTo: 1700 * r, q: 3,
    ampSweep: [0.3, 1, 0.35]
  }));
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.34, dur: 0.16, type: 'triangle', from: 240 * r, to: 120 * r, lowpass: 1600, gain: g * 0.28
  }));
  return end;
}

/** Chest: latch click, wooden thud and a short hinge creak. */
function chest(c, t0, g, r) {
  let end = buildTone(c, { t0, dur: 0.06, type: 'triangle', from: 980 * r, to: 560 * r, lowpass: 4000, gain: g * 0.16 });
  end = maxEnd(end, buildTone(c, {
    t0: t0 + 0.03, dur: 0.22, type: 'triangle', from: 330 * r, to: 240 * r, lowpass: 1800, gain: g * 0.32
  }));
  end = maxEnd(end, buildNoise(c, {
    t0: t0 + 0.02, dur: 0.24, gain: g * 0.2, bandpass: 1250 * r, bandpassTo: 820 * r, q: 2.2
  }));
  return end;
}

/** Furnace: low rumble with crackling embers. */
function furnace(c, t0, g, r) {
  let end = 0;
  for (let i = 0; i < 10; i++) {
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + i * 0.075 + rand(-0.015, 0.015),
      dur: rand(0.025, 0.06),
      gain: g * rand(0.08, 0.2),
      bandpass: rand(900, 2600) * r,
      q: rand(1.6, 3.4),
      highpass: 500
    }));
  }
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.75, gain: g * 0.16, lowpass: 420 * r, lpQ: 0.8, highpass: 80, ampSweep: [0.5, 1, 0.35]
  }));
  return end;
}

/** Anvil: metallic inharmonic clang with a bright strike transient. */
function anvil(c, t0, g, r) {
  const f = 174 * r;
  const ratios = [1, 2.76, 5.4, 8.93];
  const gains = [0.24, 0.16, 0.1, 0.06];
  let end = 0;
  for (let i = 0; i < ratios.length; i++) {
    end = maxEnd(end, buildTone(c, {
      t0: t0 + i * 0.002, dur: 1.1 - i * 0.2, type: 'sine', from: f * ratios[i],
      gain: g * gains[i], attack: 0.002
    }));
  }
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 0.14, gain: g * 0.28, bandpass: 3600 * r, bandpassTo: 1800 * r, q: 1.4, highpass: 900
  }));
  return end;
}

/** Water ambient: three gentle overlapping lowpassed swells. */
function waterAmbient(c, t0, g, r) {
  const starts = [0, 0.9, 1.8];
  let end = 0;
  for (let i = 0; i < starts.length; i++) {
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + starts[i], dur: 1.0, gain: g * 0.3,
      lowpass: rand(420, 780) * r, lowpassTo: rand(260, 460) * r, lpQ: 1.1, highpass: 120,
      attack: 0.4, noiseRate: r * rand(0.6, 0.9), ampSweep: [0.2, 1, 0.2]
    }));
  }
  return end;
}

/** Rain: sustained bandpassed noise bed with a soft amplitude drift. */
function rain(c, t0, g, r) {
  let end = buildNoise(c, {
    t0, dur: 2.2, gain: g * 0.26, bandpass: 2200 * r, bandpassTo: 1500 * r, q: 0.5,
    highpass: 400, attack: 0.6, noiseRate: r * 1.1, ampSweep: [0.55, 1, 0.6]
  });
  end = maxEnd(end, buildNoise(c, {
    t0, dur: 2.2, gain: g * 0.12, bandpass: 5200 * r, q: 0.8, highpass: 2000, attack: 0.8
  }));
  return end;
}

/** Build a quieter, slightly brighter variant of a digging texture for steps. */
function makeStep(base) {
  return function stepped(c, t0, g, r) {
    return base(c, t0, g * 0.45, r * 1.12);
  };
}

/* ------------------------------------------------------------------ *
 * Sound table
 * ------------------------------------------------------------------ */

/** name -> designer(ctx, startTime, gain, rate) -> endTime */
const SOUNDS = {
  'dig.stone': digStone,
  'dig.wood': digWood,
  'dig.grass': digGrass,
  'dig.sand': digSand,
  'dig.gravel': digGravel,
  'dig.glass': digGlass,
  'dig.wool': digWool,
  place,
  'step.stone': makeStep(digStone),
  'step.wood': makeStep(digWood),
  'step.grass': makeStep(digGrass),
  'step.sand': makeStep(digSand),
  'step.gravel': makeStep(digGravel),
  'step.wool': makeStep(digWool),
  'player.hurt': playerHurt,
  'player.death': playerDeath,
  'mob.pig': mobPig,
  'mob.sheep': mobSheep,
  'mob.zombie': mobZombie,
  'mob.hurt': mobHurt,
  'item.pickup': itemPickup,
  'item.pop': itemPop,
  click,
  open: openSfx,
  close: closeSfx,
  splash,
  explode,
  fuse,
  levelup,
  bow,
  arrow,
  door,
  chest,
  furnace,
  anvil,
  'water.ambient': waterAmbient,
  rain
};

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Lazily create the shared AudioContext and master gain. Safe to call any
 * number of times: only the first successful call builds anything, later calls
 * just re-attempt a resume. When `AudioContext` is missing or construction
 * fails, the module switches to a permanent silent mode instead of throwing.
 * @returns {void}
 */
export function initAudio() {
  if (ctx || silentMode) {
    resumeAudio();
    return;
  }
  let Ctor = null;
  try {
    Ctor = (typeof globalThis !== 'undefined' &&
      (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
  } catch (_) {
    Ctor = null;
  }
  if (typeof Ctor !== 'function') {
    silentMode = true;
    return;
  }
  let c = null;
  try {
    c = new Ctor();
  } catch (_) {
    silentMode = true;
    return;
  }
  try {
    const m = c.createGain();
    m.gain.value = volume;
    m.connect(c.destination);
    ctx = c;
    master = m;
    getNoiseBuffer();
  } catch (_) {
    try { if (c && typeof c.close === 'function') c.close(); } catch (__) { /* ignore */ }
    ctx = null;
    master = null;
    silentMode = true;
    return;
  }
  // A fresh context is often suspended until autoplay policy allows it.
  try {
    if (typeof c.resume === 'function' && c.state !== 'running') {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch (_) { /* staying suspended is fine: scheduling still works */ }
}

/**
 * Set the master output gain.
 * @param {number} v desired volume in 0..1 (clamped; non-finite values ignored)
 * @returns {void}
 */
export function setVolume(v) {
  if (!isNum(v)) return;
  volume = clamp(v, 0, 1);
  const m = master;
  if (!m) return;
  const c = liveCtx();
  try {
    const t = c ? c.currentTime : 0;
    m.gain.cancelScheduledValues(t);
    m.gain.setTargetAtTime(volume, t, 0.01);
  } catch (_) {
    try { m.gain.value = volume; } catch (__) { /* ignore */ }
  }
}

/**
 * Read the current master volume.
 * @returns {number} volume in 0..1 (the last requested value when audio is unavailable)
 */
export function getVolume() {
  return volume;
}

/**
 * Suspend audio output (hidden tab, paused game). Never throws, including on an
 * already-suspended, closed or missing context.
 * @returns {void}
 */
export function suspendAudio() {
  const c = liveCtx();
  if (!c || typeof c.suspend !== 'function') return;
  if (c.state === 'suspended') return;
  try {
    const p = c.suspend();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) { /* ignore */ }
}

/**
 * Resume audio output. Never throws, including on a closed or missing context.
 * @returns {void}
 */
export function resumeAudio() {
  const c = liveCtx();
  if (!c || typeof c.resume !== 'function') return;
  if (c.state === 'running') return;
  try {
    const p = c.resume();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) { /* ignore */ }
}

/**
 * Play a named sound effect. Unknown names are silently ignored and every
 * failure path (no context, closed context, node-construction error) is
 * swallowed, so callers never see an exception.
 * @param {string} name one of the supported sound names
 * @param {{volume?: number, rate?: number, pan?: number}} [opts]
 *        volume = per-call gain multiplier, rate = pitch multiplier,
 *        pan = -1 (left) .. 1 (right), ignored when panning is unsupported
 * @returns {void}
 */
export function playSfx(name, opts) {
  try {
    if (typeof name !== 'string') return;
    const design = SOUNDS[name];
    if (typeof design !== 'function') return;   // unknown name: ignore silently
    const c = liveCtx();
    if (!c || !master) return;                  // not initialised, or closed
    if (voices.size >= MAX_VOICES) {            // concurrency cap
      voicesDropped++;
      return;
    }
    const o = opts || {};
    const vGain = isNum(o.volume) ? clamp(o.volume, 0, 4) : 1;
    const rate = isNum(o.rate) ? clamp(o.rate, 0.25, 4) : 1;
    const pan = isNum(o.pan) ? clamp(o.pan, -1, 1) : 0;

    // Per-voice destination: stereo panner when available, else the master bus.
    let dest = master;
    if (pan !== 0 && typeof c.createStereoPanner === 'function') {
      try {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        p.connect(master);
        dest = p;
      } catch (_) {
        dest = master;
      }
    }

    const voice = openVoice(c, dest);
    if (!voice) return;

    // Slight random detune/gain per call so repeats never machine-gun.
    const g = vGain * rand(0.88, 1.12);
    const r = rate * rand(0.94, 1.07);

    let end = 0;
    try {
      end = design(voice.shim, c.currentTime, g, r) || 0;
    } catch (_) {
      end = 0;
    }
    voice.arm(end > 0 ? end - c.currentTime : 0.3);
  } catch (_) {
    // Never propagate audio failures into gameplay.
  }
}
