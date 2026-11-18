/* A tiny seeded generator so the same seed always builds the same Salmora.
   mulberry32 keeps it to a handful of integer ops and is plenty for city lots. */

export class Rng {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
    this.state = this.seed;
  }

  /** Float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [a, b). */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Whole number in [a, b]. */
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }

  /** True with the given probability. */
  chance(p) {
    return this.next() < p;
  }

  /** Uniform pick from an array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  /** A shuffled copy — the input is left alone. */
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    return out;
  }

  /** Signed value in [-m, m), handy for jitter. */
  jitter(m) {
    return this.range(-m, m);
  }

  /** A second stream that will not disturb this one's position. */
  fork(salt) {
    return new Rng((this.seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  }
}

/** Numeric hash of a string, for turning a seed query into a number. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
