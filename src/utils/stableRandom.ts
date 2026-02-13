export type RandomFn = () => number;

/**
 * Simple 32-bit FNV-1a hash to derive deterministic seeds from strings.
 */
export const hashStringToSeed = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Mulberry32 deterministic PRNG.
 * Given the same seed, it always produces the same sequence.
 */
export const createSeededRandom = (seed: number): RandomFn => {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Returns a shuffled copy using a provided deterministic RNG.
 */
export const shuffleWithRandom = <T>(items: T[], random: RandomFn): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
