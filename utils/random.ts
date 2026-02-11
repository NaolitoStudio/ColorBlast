
// A simple seeded random number generator (sfc32)
export class Random {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    // Basic hash of the seed string to get 4 32-bit integers
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3452271217);
      h = (h << 13) | (h >>> 19);
    }
    
    this.a = h >>> 0;
    this.b = (Math.imul(h ^ (h >>> 16), 2246822507)) >>> 0;
    this.c = (Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0;
    this.d = (h ^ (h >>> 16)) >>> 0;
  }

  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b | 0) + this.d | 0;
    this.d = this.d + 1 | 0;
    this.a = this.b ^ this.b >>> 9;
    this.b = this.c + (this.c << 3) | 0;
    this.c = (this.c << 21 | this.c >>> 11);
    this.c = this.c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}
