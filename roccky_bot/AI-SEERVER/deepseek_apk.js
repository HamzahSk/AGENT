/**
 DeepSeek unofficial API — Android client (similar to apk.js) WITHOUT WASM.
 The PoW solver uses a Keccak implementation reverse-engineered from ds_tai.wasm
 (DeepSeekHashV1: custom SHA3-256 — 23 rounds, RC[0] skipped, RC[5]=0x8000000080008081),
 rate 136 bytes, pad 0x06, 32-byte hex output.
 Uint32 implementation (2x32-bit per lane, no BigInt) — the same technique as
 DeepSeek's official JS fallback (worker 76608).

 Changes vs the original apk.js (Paxsenix):
 - x-client-version 1.2.1 -> 2.3.0 (the server now rejects < 2.0.0 with CLIENT_VERSION_TOO_LOW)
 - createNewChat: wrong response path; the id is at biz_data.chat_session.id
 - parseEventStream: the first fragment ({v:{response:{fragments:[...]}}}) was not parsed -> first word lost
 - PoW: pure JS Uint32 (no .wasm file at all), ~5300 hashes/s (~8x faster than BigInt)
 - Hash + API combined in one file, wrapped as the DeepSeek class

 PERFORMANCE NOTE: WASM ~8400 hashes/s, Uint32 ~5300 hashes/s.
 Difficulty 144000: WASM ~0.4s, Uint32 ~1.1s — close enough.
**/
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { fileTypeFromBuffer } from "file-type";

// ============================================================
// DeepSeekHashV1 — Uint32 implementation, no BigInt (dshashv5)
// SHA3-256 custom: 23 rounds, RC[0] skipped, 64-bit lanes bit-interleaved
// NOTE: `dshash` (one-shot hash -> hex) used to live in this file but was
// removed because it was unused; full explanation is above `dsSolve`.
// ============================================================

const [RC_LO, RC_HI] = [[
  0x00008082, 0x0000808a, 0x80008000, 0x0000808b,
  0x80000001, 0x80008081, 0x00008009, 0x0000008a,
  0x00000088, 0x80008009, 0x8000000a, 0x8000808b,
  0x0000008b, 0x00008089, 0x00008003, 0x00008002,
  0x00000080, 0x0000800a, 0x8000000a, 0x80008081,
  0x00008080, 0x80000001, 0x80008008,
], [
  0x00000000, 0x80000000, 0x80000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x00000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x80000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x00000000, 0x80000000, 0x80000000,
  0x80000000, 0x00000000, 0x80000000,
]];

// ---- bit interleaving: lane (lo, hi) <-> (even bits, odd bits) ----
function evenBits(x) { // gather the even bits of a 32-bit word into 16 bits
  x &= 0x55555555;
  x = (x | (x >>> 1)) & 0x33333333;
  x = (x | (x >>> 2)) & 0x0f0f0f0f;
  x = (x | (x >>> 4)) & 0x00ff00ff;
  return (x | (x >>> 8)) & 0x0000ffff;
}
const ilE = (lo, hi) => evenBits(lo) | (evenBits(hi) << 16);
const ilO = (lo, hi) => evenBits(lo >>> 1) | (evenBits(hi >>> 1) << 16);
const RCE = new Int32Array(23), RC_O = new Int32Array(23);

// NOTE: the `dshash` function USED TO live here (inlined from dshashv5.js) but
// was removed because it was unused. What it did:
//   dshash(input) = one-shot DeepSeekHashV1 hash of a single input,
//                   returning the 32-byte digest as a hex string.
//   Its former uses:
//     1. Verification/debug: compare the full hash against the challenge.
//     2. Fallback in dsSolve: when `prefix + nonce + padding` did not fit in
//        one block (len > RATE - 2), it used dshash(prefix + n) === challenge.
//   The normal PoW path (short prefix) always fits in one block, so that path
//   was never hit; therefore `dshash` plus keccakF (full 23-round permutation),
//   laneHex, padBuf, dlLo, dlHi, spread, and HEX were removed too.
//   If you need full hashing, use dshashv5.js or reimplement it.
class DeepSeekHash {
  static keccakF8(s) {
    const B = new Int32Array(50); // rho+pi scratch
  
    for (let r = 0; r < 23; r++) {
      RCE[r] = ilE(RC_LO[r], RC_HI[r]); RC_O[r] = ilO(RC_LO[r], RC_HI[r]);
    }
    for (let r = 0; r < 22; r++) {
      const cE0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40], cO0 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      const cE1 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42], cO1 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      const cE2 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44], cO2 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      const cE3 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46], cO3 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      const cE4 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48], cO4 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
      const dE0 = cE4 ^ ((cO1 << 1) | (cO1 >>> 31)), dO0 = cO4 ^ cE1;
      const dE1 = cE0 ^ ((cO2 << 1) | (cO2 >>> 31)), dO1 = cO0 ^ cE2;
      const dE2 = cE1 ^ ((cO3 << 1) | (cO3 >>> 31)), dO2 = cO1 ^ cE3;
      const dE3 = cE2 ^ ((cO4 << 1) | (cO4 >>> 31)), dO3 = cO2 ^ cE4;
      const dE4 = cE3 ^ ((cO0 << 1) | (cO0 >>> 31)), dO4 = cO3 ^ cE0;
      const tE00 = s[0] ^ dE0, tO00 = s[1] ^ dO0;
      B[0] = tE00; B[1] = tO00;
      const tE01 = s[10] ^ dE0, tO01 = s[11] ^ dO0;
      B[32] = ((tE01 << 18) | (tE01 >>> 14)); B[33] = ((tO01 << 18) | (tO01 >>> 14));
      const tE02 = s[20] ^ dE0, tO02 = s[21] ^ dO0;
      B[14] = ((tO02 << 2) | (tO02 >>> 30)); B[15] = ((tE02 << 1) | (tE02 >>> 31));
      const tE03 = s[30] ^ dE0, tO03 = s[31] ^ dO0;
      B[46] = ((tO03 << 21) | (tO03 >>> 11)); B[47] = ((tE03 << 20) | (tE03 >>> 12));
      const tE04 = s[40] ^ dE0, tO04 = s[41] ^ dO0;
      B[28] = ((tE04 << 9) | (tE04 >>> 23)); B[29] = ((tO04 << 9) | (tO04 >>> 23));
      const tE10 = s[2] ^ dE1, tO10 = s[3] ^ dO1;
      B[20] = ((tO10 << 1) | (tO10 >>> 31)); B[21] = tE10;
      const tE11 = s[12] ^ dE1, tO11 = s[13] ^ dO1;
      B[2] = ((tE11 << 22) | (tE11 >>> 10)); B[3] = ((tO11 << 22) | (tO11 >>> 10));
      const tE12 = s[22] ^ dE1, tO12 = s[23] ^ dO1;
      B[34] = ((tE12 << 5) | (tE12 >>> 27)); B[35] = ((tO12 << 5) | (tO12 >>> 27));
      const tE13 = s[32] ^ dE1, tO13 = s[33] ^ dO1;
      B[16] = ((tO13 << 23) | (tO13 >>> 9)); B[17] = ((tE13 << 22) | (tE13 >>> 10));
      const tE14 = s[42] ^ dE1, tO14 = s[43] ^ dO1;
      B[48] = ((tE14 << 1) | (tE14 >>> 31)); B[49] = ((tO14 << 1) | (tO14 >>> 31));
      const tE20 = s[4] ^ dE2, tO20 = s[5] ^ dO2;
      B[40] = ((tE20 << 31) | (tE20 >>> 1)); B[41] = ((tO20 << 31) | (tO20 >>> 1));
      const tE21 = s[14] ^ dE2, tO21 = s[15] ^ dO2;
      B[22] = ((tE21 << 3) | (tE21 >>> 29)); B[23] = ((tO21 << 3) | (tO21 >>> 29));
      const tE22 = s[24] ^ dE2, tO22 = s[25] ^ dO2;
      B[4] = ((tO22 << 22) | (tO22 >>> 10)); B[5] = ((tE22 << 21) | (tE22 >>> 11));
      const tE23 = s[34] ^ dE2, tO23 = s[35] ^ dO2;
      B[36] = ((tO23 << 8) | (tO23 >>> 24)); B[37] = ((tE23 << 7) | (tE23 >>> 25));
      const tE24 = s[44] ^ dE2, tO24 = s[45] ^ dO2;
      B[18] = ((tO24 << 31) | (tO24 >>> 1)); B[19] = ((tE24 << 30) | (tE24 >>> 2));
      const tE30 = s[6] ^ dE3, tO30 = s[7] ^ dO3;
      B[10] = ((tE30 << 14) | (tE30 >>> 18)); B[11] = ((tO30 << 14) | (tO30 >>> 18));
      const tE31 = s[16] ^ dE3, tO31 = s[17] ^ dO3;
      B[42] = ((tO31 << 28) | (tO31 >>> 4)); B[43] = ((tE31 << 27) | (tE31 >>> 5));
      const tE32 = s[26] ^ dE3, tO32 = s[27] ^ dO3;
      B[24] = ((tO32 << 13) | (tO32 >>> 19)); B[25] = ((tE32 << 12) | (tE32 >>> 20));
      const tE33 = s[36] ^ dE3, tO33 = s[37] ^ dO3;
      B[6] = ((tO33 << 11) | (tO33 >>> 21)); B[7] = ((tE33 << 10) | (tE33 >>> 22));
      const tE34 = s[46] ^ dE3, tO34 = s[47] ^ dO3;
      B[38] = ((tE34 << 28) | (tE34 >>> 4)); B[39] = ((tO34 << 28) | (tO34 >>> 4));
      const tE40 = s[8] ^ dE4, tO40 = s[9] ^ dO4;
      B[30] = ((tO40 << 14) | (tO40 >>> 18)); B[31] = ((tE40 << 13) | (tE40 >>> 19));
      const tE41 = s[18] ^ dE4, tO41 = s[19] ^ dO4;
      B[12] = ((tE41 << 10) | (tE41 >>> 22)); B[13] = ((tO41 << 10) | (tO41 >>> 22));
      const tE42 = s[28] ^ dE4, tO42 = s[29] ^ dO4;
      B[44] = ((tO42 << 20) | (tO42 >>> 12)); B[45] = ((tE42 << 19) | (tE42 >>> 13));
      const tE43 = s[38] ^ dE4, tO43 = s[39] ^ dO4;
      B[26] = ((tE43 << 4) | (tE43 >>> 28)); B[27] = ((tO43 << 4) | (tO43 >>> 28));
      const tE44 = s[48] ^ dE4, tO44 = s[49] ^ dO4;
      B[8] = ((tE44 << 7) | (tE44 >>> 25)); B[9] = ((tO44 << 7) | (tO44 >>> 25));
      const r00E = B[0], r00O = B[1], r01E = B[2], r01O = B[3], r02E = B[4], r02O = B[5], r03E = B[6], r03O = B[7], r04E = B[8], r04O = B[9];
      s[0] = r00E ^ (~r01E & r02E); s[1] = r00O ^ (~r01O & r02O);
      s[2] = r01E ^ (~r02E & r03E); s[3] = r01O ^ (~r02O & r03O);
      s[4] = r02E ^ (~r03E & r04E); s[5] = r02O ^ (~r03O & r04O);
      s[6] = r03E ^ (~r04E & r00E); s[7] = r03O ^ (~r04O & r00O);
      s[8] = r04E ^ (~r00E & r01E); s[9] = r04O ^ (~r00O & r01O);
      const r10E = B[10], r10O = B[11], r11E = B[12], r11O = B[13], r12E = B[14], r12O = B[15], r13E = B[16], r13O = B[17], r14E = B[18], r14O = B[19];
      s[10] = r10E ^ (~r11E & r12E); s[11] = r10O ^ (~r11O & r12O);
      s[12] = r11E ^ (~r12E & r13E); s[13] = r11O ^ (~r12O & r13O);
      s[14] = r12E ^ (~r13E & r14E); s[15] = r12O ^ (~r13O & r14O);
      s[16] = r13E ^ (~r14E & r10E); s[17] = r13O ^ (~r14O & r10O);
      s[18] = r14E ^ (~r10E & r11E); s[19] = r14O ^ (~r10O & r11O);
      const r20E = B[20], r20O = B[21], r21E = B[22], r21O = B[23], r22E = B[24], r22O = B[25], r23E = B[26], r23O = B[27], r24E = B[28], r24O = B[29];
      s[20] = r20E ^ (~r21E & r22E); s[21] = r20O ^ (~r21O & r22O);
      s[22] = r21E ^ (~r22E & r23E); s[23] = r21O ^ (~r22O & r23O);
      s[24] = r22E ^ (~r23E & r24E); s[25] = r22O ^ (~r23O & r24O);
      s[26] = r23E ^ (~r24E & r20E); s[27] = r23O ^ (~r24O & r20O);
      s[28] = r24E ^ (~r20E & r21E); s[29] = r24O ^ (~r20O & r21O);
      const r30E = B[30], r30O = B[31], r31E = B[32], r31O = B[33], r32E = B[34], r32O = B[35], r33E = B[36], r33O = B[37], r34E = B[38], r34O = B[39];
      s[30] = r30E ^ (~r31E & r32E); s[31] = r30O ^ (~r31O & r32O);
      s[32] = r31E ^ (~r32E & r33E); s[33] = r31O ^ (~r32O & r33O);
      s[34] = r32E ^ (~r33E & r34E); s[35] = r32O ^ (~r33O & r34O);
      s[36] = r33E ^ (~r34E & r30E); s[37] = r33O ^ (~r34O & r30O);
      s[38] = r34E ^ (~r30E & r31E); s[39] = r34O ^ (~r30O & r31O);
      const r40E = B[40], r40O = B[41], r41E = B[42], r41O = B[43], r42E = B[44], r42O = B[45], r43E = B[46], r43O = B[47], r44E = B[48], r44O = B[49];
      s[40] = r40E ^ (~r41E & r42E); s[41] = r40O ^ (~r41O & r42O);
      s[42] = r41E ^ (~r42E & r43E); s[43] = r41O ^ (~r42O & r43O);
      s[44] = r42E ^ (~r43E & r44E); s[45] = r42O ^ (~r43O & r44O);
      s[46] = r43E ^ (~r44E & r40E); s[47] = r43O ^ (~r44O & r40O);
      s[48] = r44E ^ (~r40E & r41E); s[49] = r44O ^ (~r40O & r41O);
      s[0] ^= RCE[r]; s[1] ^= RC_O[r];
    }
    {
      const cE0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40], cO0 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      const cE1 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42], cO1 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      const cE2 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44], cO2 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      const cE3 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46], cO3 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      const cE4 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48], cO4 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
      const dE0 = cE4 ^ ((cO1 << 1) | (cO1 >>> 31)), dO0 = cO4 ^ cE1;
      const dE1 = cE0 ^ ((cO2 << 1) | (cO2 >>> 31)), dO1 = cO0 ^ cE2;
      const dE2 = cE1 ^ ((cO3 << 1) | (cO3 >>> 31)), dO2 = cO1 ^ cE3;
      const dE3 = cE2 ^ ((cO4 << 1) | (cO4 >>> 31)), dO3 = cO2 ^ cE4;
      const dE4 = cE3 ^ ((cO0 << 1) | (cO0 >>> 31)), dO4 = cO3 ^ cE0;
      const tE0 = s[0] ^ dE0, tO0 = s[1] ^ dO0;
      const qE0 = tE0, qO0 = tO0;
      const tE1 = s[12] ^ dE1, tO1 = s[13] ^ dO1;
      const qE1 = ((tE1 << 22) | (tE1 >>> 10)), qO1 = ((tO1 << 22) | (tO1 >>> 10));
      const tE2 = s[24] ^ dE2, tO2 = s[25] ^ dO2;
      const qE2 = ((tO2 << 22) | (tO2 >>> 10)), qO2 = ((tE2 << 21) | (tE2 >>> 11));
      const tE3 = s[36] ^ dE3, tO3 = s[37] ^ dO3;
      const qE3 = ((tO3 << 11) | (tO3 >>> 21)), qO3 = ((tE3 << 10) | (tE3 >>> 22));
      const tE4 = s[48] ^ dE4, tO4 = s[49] ^ dO4;
      const qE4 = ((tE4 << 7) | (tE4 >>> 25)), qO4 = ((tO4 << 7) | (tO4 >>> 25));
      s[0] = qE0 ^ (~qE1 & qE2) ^ RCE[22]; s[1] = qO0 ^ (~qO1 & qO2) ^ RC_O[22];
      s[2] = qE1 ^ (~qE2 & qE3); s[3] = qO1 ^ (~qO2 & qO3);
      s[4] = qE2 ^ (~qE3 & qE4); s[5] = qO2 ^ (~qO3 & qO4);
      s[6] = qE3 ^ (~qE4 & qE0); s[7] = qO3 ^ (~qO4 & qO0);
      s[8] = qE4 ^ (~qE0 & qE1); s[9] = qO4 ^ (~qO0 & qO1);
    }
  }
  static solve(challenge, prefix, maxNonce) {
    // Target digest -> interleaved words (so no hex output is needed per nonce)
    const tb = Buffer.from(challenge, 'hex');
    const t0 = ilE(tb.readInt32LE(0),  tb.readInt32LE(4)),  t1 = ilO(tb.readInt32LE(0),  tb.readInt32LE(4));
    const t2 = ilE(tb.readInt32LE(8),  tb.readInt32LE(12)), t3 = ilO(tb.readInt32LE(8),  tb.readInt32LE(12));
    const t4 = ilE(tb.readInt32LE(16), tb.readInt32LE(20)), t5 = ilO(tb.readInt32LE(16), tb.readInt32LE(20));
    const t6 = ilE(tb.readInt32LE(24), tb.readInt32LE(28)), t7 = ilO(tb.readInt32LE(24), tb.readInt32LE(28));
    const base = new Int32Array(50); // interleaved block holding only the prefix + final 0x80
    const S = new Int32Array(50);
    const RATE = 136;  // bytes — block rate
    const PAD  = 0x06; // SHA3 domain separator
    const solvePad = Buffer.alloc(RATE);

    const pre = Buffer.from(prefix, 'utf8');
    const pl = pre.length;
    solvePad.fill(0);
    pre.copy(solvePad, 0);
    solvePad[RATE - 1] = 0x80;
    base.fill(0);
    for (let l = 0; l < RATE >> 3; l++) {
      const lo = solvePad.readInt32LE(l * 8), hi = solvePad.readInt32LE(l * 8 + 4);
      if ((lo | hi) === 0) continue;
      base[2 * l] = ilE(lo, hi);
      base[2 * l + 1] = ilO(lo, hi);
    }
    const firstLane = pl >> 3;

    let digits = 1, limit = 10;
    for (let n = 0; n < maxNonce; n++) {
      if (n === limit) { digits++; limit *= 10; }
      const len = pl + digits;

      // Message doesn't fit one block together with the padding
      if (len > RATE - 2) return undefined;

      // Decimal digits of n + SHA3 pad byte, written straight into the block
      let m = n;
      for (let p = len - 1; p >= pl; p--) {
        const d = m % 10;
        solvePad[p] = 48 + d;
        m = (m - d) / 10;
      }
      solvePad[len] = PAD;
    
      // Fresh state = prefix block, then rebuild only the lanes that hold nonce digits
      S.set(base);
      for (let l = firstLane, last = len >> 3; l <= last; l++) {
        const lo = solvePad.readInt32LE(l * 8), hi = solvePad.readInt32LE(l * 8 + 4);
        S[2 * l] = ilE(lo, hi);
        S[2 * l + 1] = ilO(lo, hi);
      }
      DeepSeekHash.keccakF8(S);

      if (S[0] === t0 && S[1] === t1 && S[2] === t2 && S[3] === t3 &&
          S[4] === t4 && S[5] === t5 && S[6] === t6 && S[7] === t7) return n;
    }
    return undefined;
  }
}

function dsSolve(challenge, prefix, maxNonce) {
  return DeepSeekHash.solve(challenge, prefix, maxNonce);
}

const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason || new Error('Request aborted'));
  const done = () => signal?.removeEventListener('abort', abort);
  const timer = setTimeout(() => { done(); resolve(); }, ms);
  const abort = () => {
    clearTimeout(timer);
    done();
    reject(signal.reason || new Error('Request aborted'));
  };
  signal?.addEventListener('abort', abort, { once: true });
});

function streamIterator(stream) {
  if (stream?.[Symbol.asyncIterator]) return stream[Symbol.asyncIterator]();
  if (stream?.getReader) {
    const reader = stream.getReader();
    return {
      next: () => reader.read(),
      return: async () => { await reader.cancel(); return { done: true }; },
    };
  }
  throw new Error('DeepSeek returned an unsupported stream body');
}

async function nextWithIdleTimeout(iterator, timeoutMs, controller) {
  let timer;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`DeepSeek stream idle timeout after ${timeoutMs}ms`);
          error.code = 'UPSTREAM_IDLE_TIMEOUT';
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function suffixFromSnapshot(current, snapshot) {
  if (!snapshot || snapshot === current || current.startsWith(snapshot)) return '';
  if (snapshot.startsWith(current)) return snapshot.slice(current.length);
  const error = new Error('DeepSeek sent a conflicting cumulative text snapshot');
  error.code = 'UPSTREAM_STREAM_CORRUPTED';
  throw error;
}

class DeepSeekSSEDecoder {
  constructor() {
    this.buffer = '';
    this.dataLines = [];
    this.message = '';
    this.thoughts = '';
    this.search_queries = [];
    this.search_results = [];
    this.search_indexes = [];
    this.message_id = -1;
    this.parent_id = -1;
    this.terminal = false;
  }

  push(text, final = false) {
    this.buffer += text;
    const events = [];
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      events.push(...this.#line(line));
    }
    if (final) {
      if (this.buffer) events.push(...this.#line(this.buffer.replace(/\r$/, '')));
      this.buffer = '';
      events.push(...this.#dispatch());
    }
    return events;
  }

  #line(line) {
    if (line === '') return this.#dispatch();
    if (line.startsWith(':')) return [];
    if (line === '[DONE]') {
      this.dataLines.push('[DONE]');
      return this.#dispatch();
    }
    if (line.startsWith('data:')) {
      const events = this.dataLines.length ? this.#dispatch() : [];
      this.dataLines.push(line.slice(5).replace(/^ /, ''));
      return events;
    }
    return [];
  }

  #dispatch() {
    if (this.dataLines.length === 0) return [];
    const data = this.dataLines.join('\n').trim();
    this.dataLines = [];
    if (!data || data === '{}') return [];
    if (data === '[DONE]') {
      this.terminal = true;
      return [{ done: true }];
    }

    let doc;
    try {
      doc = JSON.parse(data);
    } catch (cause) {
      const error = new Error('DeepSeek sent malformed SSE JSON');
      error.code = 'UPSTREAM_STREAM_CORRUPTED';
      error.cause = cause;
      throw error;
    }

    const events = [];
    if (doc?.type === 'error' || doc?.error) {
      const value = doc.content || doc.finish_reason || doc.error?.message || doc.message || 'Unknown DeepSeek stream error';
      events.push({ error: String(value) });
      this.terminal = true;
      return events;
    }

    const choice = doc?.choices?.[0];
    const delta = choice?.delta;
    if (delta?.type === 'text' && typeof delta.content === 'string') {
      this.message += delta.content;
      events.push({ delta: delta.content });
    } else if (delta?.type === 'thinking' && typeof delta.content === 'string') {
      this.thoughts += delta.content;
      events.push({ thinking: delta.content });
    } else if (typeof delta?.content === 'string') {
      this.message += delta.content;
      events.push({ delta: delta.content });
    } else if (typeof doc?.v === 'string' && (
      doc.p === 'response/content' ||
      doc.p === 'response/fragments/-1/content' ||
      !doc.p
    )) {
      this.message += doc.v;
      events.push({ delta: doc.v });
    } else if (Array.isArray(doc?.v?.response?.fragments)) {
      const snapshot = doc.v.response.fragments
        .filter(fragment => fragment?.type === 'RESPONSE' && typeof fragment.content === 'string')
        .map(fragment => fragment.content)
        .join('');
      const textDelta = suffixFromSnapshot(this.message, snapshot);
      if (textDelta) {
        this.message += textDelta;
        events.push({ delta: textDelta });
      }
    }

    if (delta?.type === 'search_query' && Array.isArray(delta.search_queries)) {
      this.search_queries = delta.search_queries;
      events.push({ search_queries: delta.search_queries });
    }
    if (delta?.type === 'search_result' && Array.isArray(delta.search_results)) {
      this.search_results = delta.search_results;
      events.push({ search_results: delta.search_results });
    }
    if (delta?.type === 'search_index' && Array.isArray(delta.search_indexes)) {
      this.search_indexes = delta.search_indexes;
      events.push({ search_indexes: delta.search_indexes });
    }

    this.message_id = doc.response_message_id ?? doc.message_id ?? doc?.v?.response?.message_id ?? this.message_id;
    this.parent_id = doc.request_message_id ?? doc.parent_id ?? doc?.v?.response?.parent_id ?? this.parent_id;

    const statusValue = typeof doc?.v === 'string' && /status/i.test(doc?.p || '') ? doc.v.toLowerCase() : '';
    const terminal = choice?.finish_reason != null ||
      ['finish', 'finished', 'completed', 'message_end', 'done'].includes(String(doc?.type || '').toLowerCase()) ||
      ['finish', 'finished', 'completed', 'done'].includes(statusValue);
    if (terminal) {
      this.terminal = true;
      events.push({ done: true });
    }
    return events;
  }

  result(error = null) {
    return {
      message: this.message,
      thoughts: this.thoughts,
      search_queries: this.search_queries,
      search_results: this.search_results,
      search_indexes: this.search_indexes,
      message_id: this.message_id,
      parent_id: this.parent_id,
      error,
    };
  }
}

// ============================================================
// Chat session — one conversation with its own id + parent message
// ============================================================
class ChatSession {
  constructor(client, { id, parentMessageId = null } = {}) {
    this.client = client;
    this.id = id;
    this.parentMessageId = parentMessageId;
  }

  async chat(opts = {}) {
    const state = new DeepSeekSSEDecoder();
    let streamError = null;
    for await (const event of this.chatStream(opts)) {
      if (event.delta) state.message += event.delta;
      if (event.thinking) state.thoughts += event.thinking;
      if (event.search_queries) state.search_queries = event.search_queries;
      if (event.search_results) state.search_results = event.search_results;
      if (event.search_indexes) state.search_indexes = event.search_indexes;
      if (event.message_id != null) state.message_id = event.message_id;
      if (event.parent_id != null) state.parent_id = event.parent_id;
      if (event.error) streamError = event.error;
    }
    return state.result(streamError);
  }

  async *chatStream({ prompt, parent_message_id, ref_file_urls = [], thinking_enabled = false, search_enabled = false, signal } = {}) {
    for await (const event of this.client.chatCompletionsStream({
      prompt,
      chat_session_id: this.id,
      parent_message_id: parent_message_id ?? this.parentMessageId,
      ref_file_urls,
      thinking_enabled,
      search_enabled,
      signal,
    })) {
      if (event.done && event.message_id != null && event.message_id !== -1) {
        this.parentMessageId = event.message_id;
      }
      yield event;
    }
  }
}

// ============================================================
// DeepSeek API client
// ============================================================
class DeepSeek {
  constructor({
    auth = process.env.DEEPSEEK_TOKEN,
    clientVersion = '2.3.0',
    rangersId = '7865329968002107661',
    headers = {},
    baseURL = 'https://chat.deepseek.com',
    transport = axios,
    requestTimeoutMs = Number(process.env.DEEPSEEK_REQUEST_TIMEOUT_MS || 30000),
    streamIdleTimeoutMs = Number(process.env.DEEPSEEK_STREAM_IDLE_TIMEOUT_MS || 45000),
  } = {}) {
    if (!auth) throw new Error("DeepSeek: 'auth' is required (pass auth or set DEEPSEEK_TOKEN)");
    const CLIENT_VERSION = clientVersion;
    const AUTH = auth;
    const baseHeaders = {
      'User-Agent': `DeepSeek/${CLIENT_VERSION} Android/31`,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'x-client-platform': 'android',
      'x-client-version': CLIENT_VERSION,
      'x-client-locale': 'en_US',
      'x-rangers-id': rangersId,
      'authorization': `Bearer ${AUTH}`,
      'accept-charset': 'UTF-8'
    };

    this.clientVersion = CLIENT_VERSION;
    this.auth = AUTH;
    this.baseHeaders = baseHeaders;
    this.headers = { ...baseHeaders, ...headers };
    this.baseURL = baseURL.replace(/\/$/, '');
    this.http = transport;
    this.requestTimeoutMs = requestTimeoutMs;
    this.streamIdleTimeoutMs = streamIdleTimeoutMs;
  }

  // PoW as in ds_tai.wasm: nonce 0..difficulty-1, target = hash(prefix + str(nonce))
  calculateHash(algorithm, challenge, salt, difficulty, expireAt) {
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error('Unsupported algorithm: ' + algorithm);
    }
    const prefix = `${salt}_${expireAt}_`;
    const start = Date.now();
    const answer = dsSolve(challenge, prefix, difficulty);
    const seconds = (Date.now() - start) / 1000;
    console.log(`Hash solved in ${seconds.toFixed(3)}s`);
    return answer;
  }

  // Create a conversation and return a ChatSession (session.id + session.chat()).
  async create({ agent = "chat", signal } = {}) {
    const res = await this.http.post(`${this.baseURL}/api/v0/chat_session/create`, {
      agent
    }, {
      headers: this.headers,
      timeout: this.requestTimeoutMs,
      signal,
    });

    const id = res?.data?.data?.biz_data?.chat_session?.id;
    if (!id) throw new Error("Failed to create new chat");

    return new ChatSession(this, { id });
  }

  // Backward-compatible helper: returns only the session id.
  async createNewChat() {
    const session = await this.create();
    return session.id;
  }

  async generateSignature(path, signal) {
    const pow = await this.http.post(`${this.baseURL}/api/v0/chat/create_pow_challenge`, {
      target_path: path
    }, {
      headers: this.headers,
      timeout: this.requestTimeoutMs,
      signal,
    });

    if (pow.status !== 200) return null;

    const response = pow?.data?.data?.biz_data?.challenge;

    if (!response) throw new Error("Failed to obtain challenge.");

    const { algorithm, challenge, salt, difficulty, expire_at, signature, target_path } = response;

    const answer = this.calculateHash(algorithm, challenge, salt, difficulty, expire_at);
    if (answer === undefined) throw new Error("PoW failed: nonce not found");

    const sh = Buffer.from(JSON.stringify({
      algorithm,
      challenge,
      salt,
      answer,
      signature,
      target_path
    })).toString('base64');

    return sh;
  }

  async chatCompletions(options) {
    const decoder = new DeepSeekSSEDecoder();
    let streamError = null;
    for await (const event of this.chatCompletionsStream(options)) {
      if (event.delta) decoder.message += event.delta;
      if (event.thinking) decoder.thoughts += event.thinking;
      if (event.search_queries) decoder.search_queries = event.search_queries;
      if (event.search_results) decoder.search_results = event.search_results;
      if (event.search_indexes) decoder.search_indexes = event.search_indexes;
      if (event.message_id != null) decoder.message_id = event.message_id;
      if (event.parent_id != null) decoder.parent_id = event.parent_id;
      if (event.error) streamError = event.error;
    }
    return decoder.result(streamError);
  }

  async *chatCompletionsStream({ prompt, chat_session_id, parent_message_id = null, ref_file_urls = [], thinking_enabled = false, search_enabled = false, signal }) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('DeepSeek prompt must be a non-empty string');
    const ref_file_ids = [];
    for (const item of ref_file_urls || []) {
      const fileId = await this.uploadFile(item, signal);
      if (!fileId) throw new Error(`DeepSeek rejected attachment: ${item}`);
      ref_file_ids.push(fileId);
    }

    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason || new Error('Client disconnected'));
    signal?.addEventListener('abort', abort, { once: true });
    let iterator;
    let body;
    const decoder = new DeepSeekSSEDecoder();

    try {
      const signature = await this.generateSignature('/api/v0/chat/completion', controller.signal);
      const response = await this.http.post(`${this.baseURL}/api/v0/chat/completion`, {
      chat_session_id,
      parent_message_id,
      prompt,
      ref_file_ids,
      thinking_enabled,
      search_enabled,
      legacy_format: true
    }, {
      headers: {
        ...this.headers,
        'x-ds-pow-response': signature,
      },
      responseType: 'stream',
      timeout: 0,
      signal: controller.signal,
      validateStatus: () => true,
    });

      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`DeepSeek HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      body = response.data;
      iterator = streamIterator(body);
      const textDecoder = new TextDecoder();
      let emittedDone = false;

      while (true) {
        const { value, done } = await nextWithIdleTimeout(iterator, this.streamIdleTimeoutMs, controller);
        if (done) break;
        const text = typeof value === 'string' ? value : textDecoder.decode(value, { stream: true });
        for (const event of decoder.push(text)) {
          if (event.error) {
            const error = new Error(event.error);
            error.code = 'UPSTREAM_ERROR';
            throw error;
          }
          if (event.done) {
            emittedDone = true;
            yield { ...event, message_id: decoder.message_id, parent_id: decoder.parent_id };
            break;
          }
          yield event;
        }
        if (emittedDone) break;
      }

      if (!emittedDone) {
        const decoderTail = textDecoder.decode();
        if (decoderTail) {
          for (const event of decoder.push(decoderTail)) {
            if (event.done) emittedDone = true;
            yield event.done ? { ...event, message_id: decoder.message_id, parent_id: decoder.parent_id } : event;
          }
        }
        for (const event of decoder.push('', true)) {
          if (event.done) emittedDone = true;
          yield event.done ? { ...event, message_id: decoder.message_id, parent_id: decoder.parent_id } : event;
        }
      }
      if (!emittedDone && !decoder.terminal) {
        const error = new Error('DeepSeek stream ended before a completion event');
        error.code = 'UPSTREAM_STREAM_TRUNCATED';
        throw error;
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      controller.abort();
      try { body?.destroy?.(); } catch {}
      try { iterator?.return?.()?.catch?.(() => {}); } catch {}
    }
  }

  async uploadFile(url, signal) {
    const response = await this.http.get(url, { responseType: 'arraybuffer', timeout: this.requestTimeoutMs, signal });
    if (response.status !== 200) throw new Error("Failed to get buffer");

    const mimetype = String(response.headers["content-type"] || '').split(';', 1)[0].trim().toLowerCase();
    const allowedTypes = ["application/json", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

    if (!(mimetype.startsWith("image/") || mimetype.startsWith("text/") || allowedTypes.includes(mimetype))) return null;

    const buffer = Buffer.from(response.data);
    const detected = await fileTypeFromBuffer(buffer);
    const fallbackExtensions = { 'application/json': 'json', 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt' };
    const ext = detected?.ext || fallbackExtensions[mimetype] || (mimetype.startsWith('text/') ? 'txt' : mimetype.startsWith('image/') ? 'img' : 'bin');

    let data = new FormData();
    data.append('file', buffer, `${crypto.randomUUID()}.${ext}`);

    const signature = await this.generateSignature("/api/v0/file/upload_file", signal);

    const res = await this.http.post(`${this.baseURL}/api/v0/file/upload_file`, data, {
      headers: {
        ...this.headers,
        'Content-Type': undefined,
        'x-ds-pow-response': signature,
        ...data.getHeaders()
      },
      timeout: this.requestTimeoutMs,
      signal,
    });

    if (res.status !== 200) return null;

    const file_id = res.data.data.biz_data.id;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data } = await this.http.get(`${this.baseURL}/api/v0/file/fetch_files?file_ids=${encodeURIComponent(file_id)}`, {
        headers: this.headers,
        timeout: this.requestTimeoutMs,
        signal,
      });

      console.info(`DEEPSEEK CHECKING FILE WITH ID: ${file_id} (${attempt}/5)`);

      const file = data?.data?.biz_data?.files?.[0];
      if (file?.status === "SUCCESS") return file_id;
      if (file?.status === "FAILED") throw new Error(`File processing failed: ${file_id}`);

      if (attempt < 5) await delay(5000, signal);
    }
    throw new Error(`File processing timed out after 5 attempts: ${file_id}`);
  }

  parseEventStream(data) {
    const decoder = new DeepSeekSSEDecoder();
    let error = null;
    for (const event of decoder.push(String(data), true)) if (event.error) error = event.error;
    return decoder.result(error);
  }
}



/**
 * Usage:
 *   const session = await deepseek.create();
 *   const reply = await session.chat({ prompt: "..." });
 * session.id can be reused to continue the same conversation; parent_message_id
 * is tracked automatically by ChatSession (and can be overridden per call).
 **/
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) (async () => {
  try {
    const deepseek = new DeepSeek();
    const session = await deepseek.create();
    console.log(`NEW CHAT SESSION WITH ID: ${session.id}`);

    const text = await session.chat({
      prompt: "haloo, apa kabar",
      thinking_enabled: false,
      search_enabled: false
    });

    /**
     * Upload an image like this (the file must contain text, otherwise it gets
     * stuck at "CHECKING FILE"):
    const text = await session.chat({
      prompt: "What is this?",
      ref_file_urls: [
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQwTvHvSI7HuRvfZan7eXf33ceBD35EBeD93WddenbCx313xy2v9jreXj4&s=10"
      ]
    });*/

    // Continue the same session (parent_message_id is automatic):
    // const text2 = await session.chat({ prompt: "continue the previous question" });

    console.log(text);
  } catch (e) {
    console.error(e);
  }
})();

export { DeepSeek, ChatSession, DeepSeekHash, dsSolve };
export default DeepSeek;
