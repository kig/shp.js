/**
 * BitView - Bit-level access to ArrayBuffer for delta encoding
 */
export class BitView {
  buffer: ArrayBuffer;
  u8: Uint8Array;

  constructor(buf: ArrayBuffer) {
    this.buffer = buf;
    this.u8 = new Uint8Array(buf);
  }

  getBit(idx: number): number {
    const v = this.u8[idx >> 3];
    const off = idx & 0x7;
    return (v & (0x80 >> off)) >> (7 - off);
  }

  setBit(idx: number, val: number): void {
    const bidx = idx >> 3;
    const v = this.u8[bidx];
    const off = idx & 0x7;
    if (val) {
      this.u8[bidx] = v | (0x80 >> off);
    } else {
      this.u8[bidx] = v & ~(0x80 >> off);
    }
  }

  getInt12(idx: number): number {
    const bidx = (idx / 8) | 0;
    const a = this.u8[bidx];
    const b = this.u8[bidx + 1] || 0;
    const c = this.u8[bidx + 2] || 0;
    const off = idx % 8;
    const abits = 8 - off;
    const bbits = Math.min(12 - abits, 8);
    const cbits = Math.max(12 - abits - bbits, 0);
    const am = ~(0xff << abits);
    const bm = 0xff << (8 - bbits);
    const cm = 0xff << (8 - cbits);
    const maskedA = a & am;
    const maskedB = b & bm;
    const maskedC = c & cm;
    return (((maskedA << 16) + (maskedB << 8) + maskedC) >> (12 - off)) - 2048;
  }

  setInt12(idx: number, val: number): void {
    val += 2048;
    const bidx = (idx / 8) | 0;
    const off = idx % 8;
    const v = val << (12 - off);
    const a = (v & 0xff0000) >> 16;
    const b = (v & 0x00ff00) >> 8;
    const c = v & 0x0000ff;
    const abits = 8 - off;
    const bbits = Math.min(12 - abits, 8);
    const cbits = Math.max(12 - abits - bbits, 0);
    const am = 0xff << abits;
    this.u8[bidx] = (this.u8[bidx] & am) + a;
    const bm = ~(0xff << (8 - bbits));
    this.u8[bidx + 1] = (this.u8[bidx + 1] & bm) + b;
    const cm = ~(0xff << (8 - cbits));
    this.u8[bidx + 2] = (this.u8[bidx + 2] & cm) + c;
  }

  getInt6(idx: number): number {
    const bidx = (idx / 8) | 0;
    const a = this.u8[bidx];
    const b = this.u8[bidx + 1] || 0;
    const off = idx % 8;
    const abits = 8 - off;
    const bbits = Math.max(6 - abits, 0);
    const am = ~((0xff << abits) + (0xff >> (8 - (2 - off))));
    const bm = 0xff << (8 - bbits);
    const maskedA = a & am;
    const maskedB = b & bm;
    return (((maskedA << 8) + maskedB) >> (10 - off)) - 32;
  }

  setInt6(idx: number, val: number): void {
    val += 32;
    const bidx = (idx / 8) | 0;
    const off = idx % 8;
    const v = val << (10 - off);
    const a = (v & 0xff00) >> 8;
    const b = v & 0x00ff;
    const abits = 8 - off;
    const bbits = Math.max(6 - abits, 0);
    const am = (0xff << abits) + (0xff >> (8 - (2 - off)));
    this.u8[bidx] = (this.u8[bidx] & am) + a;
    const bm = ~(0xff << (8 - bbits));
    this.u8[bidx + 1] = (this.u8[bidx + 1] & bm) + b;
  }

  static test(): void {
    const buf = new ArrayBuffer(3);
    const bv = new BitView(buf);
    let i: number, j: number;
    for (j = 0; j < 12; j++) {
      for (i = -2048; i < 2048; i++) {
        bv.setInt12(j, i);
        if (bv.getInt12(j) !== i) {
          console.log('12-bit prob at', j, i);
          console.log('expected', i, 'got', bv.getInt12(j));
          break;
        }
      }
    }
    for (j = 0; j < 6; j++) {
      for (i = -32; i < 32; i++) {
        bv.setInt6(j, i);
        if (bv.getInt6(j) !== i) {
          console.log('6-bit prob at', j, i);
          console.log('expected', i, 'got', bv.getInt6(j));
          break;
        }
      }
    }
    console.log('BitView test complete');
  }
}
