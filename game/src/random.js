// A small seeded random source (mulberry32) plus the helpers the city and the autopilot use.
// Same seed, same city, same traffic: screenshots and replays are reproducible.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Integer in [min, max). */
    int(min, max) {
      return min + Math.floor(next() * (max - min));
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
