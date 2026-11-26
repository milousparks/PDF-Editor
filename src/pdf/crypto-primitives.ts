/**
 * Hashes and ciphers needed by the PDF standard security handler, in plain TypeScript
 * so the plugin does not depend on Node or Electron modules: MD5, SHA-256/384/512,
 * RC4 and AES-128/256 (CBC, and ECB-free single blocks for key unwrapping).
 */

const utf8Free = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// ---------------------------------------------------------------- MD5

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
);

export function md5(...parts: Uint8Array[]): Uint8Array {
  const message = utf8Free(parts);
  const length = message.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(length / 2 ** 29), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      m[i] = view.getUint32(offset + i * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const sum = (a + f + MD5_K[i]! + m[g]!) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << MD5_S[i]!) | (sum >>> (32 - MD5_S[i]!)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  const result = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((word, i) => result.setUint32(i * 4, word >>> 0, true));
  return out;
}

// ---------------------------------------------------------------- SHA-256

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(...parts: Uint8Array[]): Uint8Array {
  const message = utf8Free(parts);
  const length = message.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 2 ** 29));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh! +
          (rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)) +
          ((e! & f!) ^ (~e! & g!)) +
          SHA256_K[i]! +
          w[i]!) |
        0;
      const t2 =
        ((rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, i) => (h[i] = (h[i]! + value!) | 0));
  }
  const out = new Uint8Array(32);
  const result = new DataView(out.buffer);
  h.forEach((word, i) => result.setUint32(i * 4, word));
  return out;
}

// ---------------------------------------------------------------- SHA-384 / SHA-512

const SHA512_K = [
  '428a2f98d728ae22',
  '7137449123ef65cd',
  'b5c0fbcfec4d3b2f',
  'e9b5dba58189dbbc',
  '3956c25bf348b538',
  '59f111f1b605d019',
  '923f82a4af194f9b',
  'ab1c5ed5da6d8118',
  'd807aa98a3030242',
  '12835b0145706fbe',
  '243185be4ee4b28c',
  '550c7dc3d5ffb4e2',
  '72be5d74f27b896f',
  '80deb1fe3b1696b1',
  '9bdc06a725c71235',
  'c19bf174cf692694',
  'e49b69c19ef14ad2',
  'efbe4786384f25e3',
  '0fc19dc68b8cd5b5',
  '240ca1cc77ac9c65',
  '2de92c6f592b0275',
  '4a7484aa6ea6e483',
  '5cb0a9dcbd41fbd4',
  '76f988da831153b5',
  '983e5152ee66dfab',
  'a831c66d2db43210',
  'b00327c898fb213f',
  'bf597fc7beef0ee4',
  'c6e00bf33da88fc2',
  'd5a79147930aa725',
  '06ca6351e003826f',
  '142929670a0e6e70',
  '27b70a8546d22ffc',
  '2e1b21385c26c926',
  '4d2c6dfc5ac42aed',
  '53380d139d95b3df',
  '650a73548baf63de',
  '766a0abb3c77b2a8',
  '81c2c92e47edaee6',
  '92722c851482353b',
  'a2bfe8a14cf10364',
  'a81a664bbc423001',
  'c24b8b70d0f89791',
  'c76c51a30654be30',
  'd192e819d6ef5218',
  'd69906245565a910',
  'f40e35855771202a',
  '106aa07032bbd1b8',
  '19a4c116b8d2d0c8',
  '1e376c085141ab53',
  '2748774cdf8eeb99',
  '34b0bcb5e19b48a8',
  '391c0cb3c5c95a63',
  '4ed8aa4ae3418acb',
  '5b9cca4f7763e373',
  '682e6ff3d6b2b8a3',
  '748f82ee5defb2fc',
  '78a5636f43172f60',
  '84c87814a1f0ab72',
  '8cc702081a6439ec',
  '90befffa23631e28',
  'a4506cebde82bde9',
  'bef9a3f7b2c67915',
  'c67178f2e372532b',
  'ca273eceea26619c',
  'd186b8c721c0c207',
  'eada7dd6cde0eb1e',
  'f57d4f7fee6ed178',
  '06f067aa72176fba',
  '0a637dc5a2c898a6',
  '113f9804bef90dae',
  '1b710b35131c471b',
  '28db77f523047d84',
  '32caab7b40c72493',
  '3c9ebe0a15c9bebc',
  '431d67c49c100d4c',
  '4cc5d4becb3e42b6',
  '597f299cfc657e2a',
  '5fcb6fab3ad6faec',
  '6c44198c4a475817',
].map((value) => BigInt(`0x${value}`));
const SHA512_INIT = [
  '6a09e667f3bcc908',
  'bb67ae8584caa73b',
  '3c6ef372fe94f82b',
  'a54ff53a5f1d36f1',
  '510e527fade682d1',
  '9b05688c2b3e6c1f',
  '1f83d9abfb41bd6b',
  '5be0cd19137e2179',
].map((value) => BigInt(`0x${value}`));
const SHA384_INIT = [
  'cbbb9d5dc1059ed8',
  '629a292a367cd507',
  '9159015a3070dd17',
  '152fecd8f70e5939',
  '67332667ffc00b31',
  '8eb44a8768581511',
  'db0c2e0d64f98fa7',
  '47b5481dbefa4fa4',
].map((value) => BigInt(`0x${value}`));

function sha512Family(init: bigint[], size: number, parts: Uint8Array[]): Uint8Array {
  const message = utf8Free(parts);
  const length = message.length;
  const padded = new Uint8Array((((length + 16) >> 7) + 1) << 7);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(length) * 8n);
  const mask = (1n << 64n) - 1n;
  const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & mask;
  const h = [...init];
  const w: bigint[] = new Array<bigint>(80);
  for (let offset = 0; offset < padded.length; offset += 128) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getBigUint64(offset + i * 8);
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 15]!;
      const y = w[i - 2]!;
      const s0 = rotr(x, 1n) ^ rotr(x, 8n) ^ (x >> 7n);
      const s1 = rotr(y, 19n) ^ rotr(y, 61n) ^ (y >> 6n);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) & mask;
    }
    let [a, b, c, d, e, f, g, hh] = h as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    for (let i = 0; i < 80; i++) {
      const t1 =
        (hh +
          (rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n)) +
          ((e & f) ^ (~e & mask & g)) +
          SHA512_K[i]! +
          w[i]!) &
        mask;
      const t2 =
        ((rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & mask;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) & mask;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) & mask;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, i) => (h[i] = (h[i]! + value) & mask));
  }
  const out = new Uint8Array(64);
  const result = new DataView(out.buffer);
  h.forEach((word, i) => result.setBigUint64(i * 8, word));
  return out.subarray(0, size);
}

export const sha384 = (...parts: Uint8Array[]) => sha512Family(SHA384_INIT, 48, parts);
export const sha512 = (...parts: Uint8Array[]) => sha512Family(SHA512_INIT, 64, parts);

// ---------------------------------------------------------------- RC4

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    const t = s[i]!;
    s[i] = s[j]!;
    s[j] = t;
    out[n] = data[n]! ^ s[(s[i]! + s[j]!) & 255]!;
  }
  return out;
}

// ---------------------------------------------------------------- AES

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
{
  // Build the S-box from the multiplicative inverse in GF(2^8) and the affine map.
  let p = 1;
  let q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) {
      q ^= 0x09;
    }
    const x =
      q ^
      ((q << 1) | (q >> 7)) ^
      ((q << 2) | (q >> 6)) ^
      ((q << 3) | (q >> 5)) ^
      ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) {
    INV_SBOX[SBOX[i]!] = i;
  }
}
const xtime = (x: number) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (x: number, y: number) => {
  let result = 0;
  for (; y; y >>= 1, x = xtime(x)) {
    if (y & 1) {
      result ^= x;
    }
  }
  return result;
};
// Round tables: one 32-bit lookup per byte and round instead of field arithmetic.
const TE = [0, 1, 2, 3].map(() => new Uint32Array(256));
const TD = [0, 1, 2, 3].map(() => new Uint32Array(256));
for (let i = 0; i < 256; i++) {
  const s = SBOX[i]!;
  const e = ((mul(s, 2) << 24) | (s << 16) | (s << 8) | mul(s, 3)) >>> 0;
  const v = INV_SBOX[i]!;
  const d = ((mul(v, 14) << 24) | (mul(v, 9) << 16) | (mul(v, 13) << 8) | mul(v, 11)) >>> 0;
  for (let r = 0; r < 4; r++) {
    TE[r]![i] = ((e >>> (8 * r)) | (e << (32 - 8 * r))) >>> 0;
    TD[r]![i] = ((d >>> (8 * r)) | (d << (32 - 8 * r))) >>> 0;
  }
}

interface AesKey {
  rounds: number;
  enc: Uint32Array;
  dec: Uint32Array;
}

function expandKey(key: Uint8Array): AesKey {
  const nk = key.length / 4;
  if (nk !== 4 && nk !== 6 && nk !== 8) {
    throw new Error('Invalid AES key length.');
  }
  const rounds = nk + 6;
  const enc = new Uint32Array(4 * (rounds + 1));
  for (let i = 0; i < nk; i++) {
    enc[i] =
      ((key[4 * i]! << 24) | (key[4 * i + 1]! << 16) | (key[4 * i + 2]! << 8) | key[4 * i + 3]!) >>>
      0;
  }
  let rcon = 1;
  const sub = (w: number) =>
    ((SBOX[w >>> 24]! << 24) |
      (SBOX[(w >>> 16) & 255]! << 16) |
      (SBOX[(w >>> 8) & 255]! << 8) |
      SBOX[w & 255]!) >>>
    0;
  for (let i = nk; i < enc.length; i++) {
    let t = enc[i - 1]!;
    if (i % nk === 0) {
      t = (sub(((t << 8) | (t >>> 24)) >>> 0) ^ (rcon << 24)) >>> 0;
      rcon = xtime(rcon);
    } else if (nk > 6 && i % nk === 4) {
      t = sub(t);
    }
    enc[i] = (enc[i - nk]! ^ t) >>> 0;
  }
  // Equivalent inverse cipher: reversed round keys with InvMixColumns applied.
  const dec = new Uint32Array(enc.length);
  for (let r = 0; r <= rounds; r++) {
    for (let c = 0; c < 4; c++) {
      const w = enc[(rounds - r) * 4 + c]!;
      dec[r * 4 + c] =
        r === 0 || r === rounds
          ? w
          : (TD[0]![SBOX[w >>> 24]!]! ^
              TD[1]![SBOX[(w >>> 16) & 255]!]! ^
              TD[2]![SBOX[(w >>> 8) & 255]!]! ^
              TD[3]![SBOX[w & 255]!]!) >>>
            0;
    }
  }
  return { rounds, enc, dec };
}

function cryptBlock(key: AesKey, input: Uint32Array, output: Uint32Array, decrypt: boolean): void {
  const k = decrypt ? key.dec : key.enc;
  const t = decrypt ? TD : TE;
  const box = decrypt ? INV_SBOX : SBOX;
  // Decryption reads the columns in the inverse ShiftRows order.
  const [o1, o2, o3] = decrypt ? [3, 2, 1] : [1, 2, 3];
  let s0 = input[0]! ^ k[0]!;
  let s1 = input[1]! ^ k[1]!;
  let s2 = input[2]! ^ k[2]!;
  let s3 = input[3]! ^ k[3]!;
  let at = 4;
  for (let r = 1; r < key.rounds; r++) {
    const s = [s0, s1, s2, s3];
    const n = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      n[c] =
        t[0]![s[c]! >>> 24]! ^
        t[1]![(s[(c + o1) & 3]! >>> 16) & 255]! ^
        t[2]![(s[(c + o2) & 3]! >>> 8) & 255]! ^
        t[3]![s[(c + o3) & 3]! & 255]! ^
        k[at + c]!;
    }
    [s0, s1, s2, s3] = n as [number, number, number, number];
    at += 4;
  }
  const s = [s0, s1, s2, s3];
  for (let c = 0; c < 4; c++) {
    output[c] =
      ((box[s[c]! >>> 24]! << 24) |
        (box[(s[(c + o1) & 3]! >>> 16) & 255]! << 16) |
        (box[(s[(c + o2) & 3]! >>> 8) & 255]! << 8) |
        box[s[(c + o3) & 3]! & 255]!) ^
      k[at + c]!;
    output[c] = output[c]! >>> 0;
  }
}

/** AES-CBC; `padding` adds or removes PKCS#7 padding. */
export function aesCbc(
  mode: 'encrypt' | 'decrypt',
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
  padding: boolean,
): Uint8Array {
  const expanded = expandKey(key);
  let input = data;
  if (mode === 'encrypt' && padding) {
    const pad = 16 - (data.length % 16);
    input = new Uint8Array(data.length + pad);
    input.set(data);
    input.fill(pad, data.length);
  }
  if (input.length % 16) {
    throw new Error('AES data is not a whole number of blocks.');
  }
  const out = new Uint8Array(input.length);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const outView = new DataView(out.buffer);
  const chain = new Uint32Array(4);
  const ivView = new DataView(iv.buffer, iv.byteOffset, 16);
  for (let i = 0; i < 4; i++) {
    chain[i] = ivView.getUint32(i * 4);
  }
  const block = new Uint32Array(4);
  const result = new Uint32Array(4);
  for (let offset = 0; offset < input.length; offset += 16) {
    for (let i = 0; i < 4; i++) {
      block[i] = view.getUint32(offset + i * 4);
    }
    if (mode === 'encrypt') {
      for (let i = 0; i < 4; i++) {
        block[i] = block[i]! ^ chain[i]!;
      }
      cryptBlock(expanded, block, result, false);
      chain.set(result);
    } else {
      cryptBlock(expanded, block, result, true);
      for (let i = 0; i < 4; i++) {
        result[i] = result[i]! ^ chain[i]!;
      }
      chain.set(block);
    }
    for (let i = 0; i < 4; i++) {
      outView.setUint32(offset + i * 4, result[i]!);
    }
  }
  if (mode === 'decrypt' && padding) {
    const pad = out[out.length - 1]!;
    if (!pad || pad > 16 || pad > out.length) {
      throw new Error('Invalid AES padding.');
    }
    return out.subarray(0, out.length - pad);
  }
  return out;
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
