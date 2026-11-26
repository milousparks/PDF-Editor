import { aesCbc, md5, randomBytes, rc4, sha256, sha384, sha512 } from './crypto-primitives.ts';
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
} from 'pdf-lib';
import type { PDFContext, PDFObject, PDFRef } from 'pdf-lib';

/**
 * The PDF standard security handler (password-based encryption, ISO 32000-2 §7.6.4):
 * RC4 40/128-bit (revisions 2–4), AES-128 (revision 4) and AES-256 (revisions 5–6).
 *
 * Documents are decrypted when they are loaded and every object is encrypted again
 * with the document's own key when it is written, so a saved file keeps the original
 * protection (same /Encrypt dictionary, same passwords and permissions).
 */

export class PasswordRequired extends Error {
  constructor() {
    super('This PDF is protected with a password. Password-protected PDFs are read only.');
  }
}

type Method = 'RC4' | 'AESV2' | 'AESV3' | 'None';

const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const HASHES = { md5, sha256, sha384, sha512 };
const hash = (algorithm: keyof typeof HASHES, ...parts: Uint8Array[]): Uint8Array =>
  HASHES[algorithm](...parts);
const equal = (a: Uint8Array, b: Uint8Array, length: number): boolean => {
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return a.length >= length && b.length >= length;
};

function aes(
  mode: 'encrypt' | 'decrypt',
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
  padding: boolean,
): Uint8Array {
  return aesCbc(mode, key, iv, data, padding);
}

/** Algorithm 2.B: the hash used by revision 6 (revision 5 uses plain SHA-256). */
function hash2B(password: Uint8Array, salt: Uint8Array, user: Uint8Array, revision: number) {
  let k = hash('sha256', password, salt, user);
  if (revision < 6) {
    return k;
  }
  for (let round = 0; ; round++) {
    const once = concat(password, k, user);
    const k1 = new Uint8Array(once.length * 64);
    for (let i = 0; i < 64; i++) {
      k1.set(once, i * once.length);
    }
    const e = aes('encrypt', k.subarray(0, 16), k.subarray(16, 32), k1, false);
    let sum = 0;
    for (let i = 0; i < 16; i++) {
      sum += e[i]!;
    }
    k = hash((['sha256', 'sha384', 'sha512'] as const)[sum % 3]!, e);
    if (round >= 63 && e[e.length - 1]! <= round - 32) {
      break;
    }
  }
  return k.subarray(0, 32);
}

function bytesOf(value: PDFObject | undefined): Uint8Array {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.asBytes();
  }
  throw new Error('Invalid PDF encryption dictionary.');
}

const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 255);
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export interface Security {
  /** The /Encrypt dictionary's own object, which is never encrypted. */
  readonly dictionaryRef?: PDFRef;
  decrypt(ref: PDFRef, object: PDFObject, context: PDFContext): PDFObject;
  encrypt(ref: PDFRef, object: PDFObject, context: PDFContext): PDFObject;
}

export function openSecurity(
  encrypt: PDFDict,
  dictionaryRef: PDFRef | undefined,
  firstId: Uint8Array,
  password = '',
): Security {
  const name = (key: string) => encrypt.get(PDFName.of(key))?.toString().slice(1);
  const number = (key: string, fallback: number) =>
    encrypt.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber() ?? fallback;
  if (name('Filter') !== 'Standard') {
    throw new Error('This PDF uses an unsupported encryption method and is read only.');
  }
  const version = number('V', 0);
  const revision = number('R', 2);
  const encryptMetadata =
    encrypt.lookupMaybe(PDFName.of('EncryptMetadata'), PDFBool) !== PDFBool.False;
  const o = bytesOf(encrypt.lookup(PDFName.of('O')));
  const u = bytesOf(encrypt.lookup(PDFName.of('U')));
  const p = number('P', 0);

  // Crypt filters (version 4 and 5) choose a method for streams and for strings.
  const filterMethod = (key: 'StmF' | 'StrF'): Method => {
    if (version < 4) {
      return 'RC4';
    }
    const filter = name(key) ?? 'Identity';
    if (filter === 'Identity') {
      return 'None';
    }
    const cf = encrypt
      .lookupMaybe(PDFName.of('CF'), PDFDict)
      ?.lookupMaybe(PDFName.of(filter), PDFDict);
    const cfm = cf?.get(PDFName.of('CFM'))?.toString().slice(1) ?? 'None';
    if (cfm === 'V2') {
      return 'RC4';
    }
    if (cfm === 'AESV2' || cfm === 'AESV3' || cfm === 'None') {
      return cfm;
    }
    throw new Error('This PDF uses an unsupported encryption method and is read only.');
  };
  const streams = filterMethod('StmF');
  const strings = filterMethod('StrF');

  let key: Uint8Array;
  if (revision >= 5) {
    const secret = new TextEncoder().encode(password.normalize('NFKC')).subarray(0, 127);
    const ue = bytesOf(encrypt.lookup(PDFName.of('UE')));
    const oe = bytesOf(encrypt.lookup(PDFName.of('OE')));
    if (equal(hash2B(secret, u.subarray(32, 40), new Uint8Array(), revision), u, 32)) {
      const intermediate = hash2B(secret, u.subarray(40, 48), new Uint8Array(), revision);
      key = aes('decrypt', intermediate, new Uint8Array(16), ue.subarray(0, 32), false);
    } else if (equal(hash2B(secret, o.subarray(32, 40), u.subarray(0, 48), revision), o, 32)) {
      const intermediate = hash2B(secret, o.subarray(40, 48), u.subarray(0, 48), revision);
      key = aes('decrypt', intermediate, new Uint8Array(16), oe.subarray(0, 32), false);
    } else {
      throw new PasswordRequired();
    }
  } else {
    const length = revision === 2 ? 5 : Math.min(16, Math.max(5, number('Length', 40) / 8));
    const padded = (secret: Uint8Array) => {
      const out = new Uint8Array(32);
      out.set(secret.subarray(0, 32));
      out.set(PAD.subarray(0, 32 - Math.min(32, secret.length)), Math.min(32, secret.length));
      return out;
    };
    // Algorithm 2: the file key from the user password.
    const fileKey = (secret: Uint8Array) => {
      const permissions = Uint8Array.of(p & 255, (p >> 8) & 255, (p >> 16) & 255, (p >>> 24) & 255);
      let k = hash(
        'md5',
        padded(secret),
        o.subarray(0, 32),
        permissions,
        firstId,
        revision >= 4 && !encryptMetadata ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(),
      );
      if (revision >= 3) {
        for (let i = 0; i < 50; i++) {
          k = hash('md5', k.subarray(0, length));
        }
      }
      return k.subarray(0, length);
    };
    // Algorithms 4 and 5: does a key reproduce /U?
    const opens = (candidate: Uint8Array) => {
      if (revision === 2) {
        return equal(rc4(candidate, PAD), u, 32);
      }
      let value = rc4(candidate, hash('md5', PAD, firstId));
      for (let i = 1; i <= 19; i++) {
        value = rc4(
          candidate.map((byte) => byte ^ i),
          value,
        );
      }
      return equal(value, u, 16);
    };
    const secret = latin1(password);
    const user = fileKey(secret);
    if (opens(user)) {
      key = user;
    } else {
      // Algorithm 7: the owner password decrypts /O into the user password.
      let ownerKey = hash('md5', padded(secret));
      if (revision >= 3) {
        for (let i = 0; i < 50; i++) {
          ownerKey = hash('md5', ownerKey);
        }
      }
      ownerKey = ownerKey.subarray(0, length);
      let userPassword = o.subarray(0, 32);
      if (revision === 2) {
        userPassword = rc4(ownerKey, userPassword);
      } else {
        for (let i = 19; i >= 0; i--) {
          userPassword = rc4(
            ownerKey.map((byte) => byte ^ i),
            userPassword,
          );
        }
      }
      const owner = fileKey(userPassword);
      if (!opens(owner)) {
        throw new PasswordRequired();
      }
      key = owner;
    }
  }

  const objectKey = (ref: PDFRef, method: Method): Uint8Array => {
    if (method === 'AESV3') {
      return key;
    }
    const n = ref.objectNumber;
    const g = ref.generationNumber;
    const extended = concat(
      key,
      Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255),
      method === 'AESV2' ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(),
    );
    return hash('md5', extended).subarray(0, Math.min(key.length + 5, 16));
  };
  const transform = (
    mode: 'encrypt' | 'decrypt',
    ref: PDFRef,
    method: Method,
    data: Uint8Array,
  ): Uint8Array => {
    if (method === 'None') {
      return data;
    }
    const k = objectKey(ref, method);
    if (method === 'RC4') {
      return rc4(k, data);
    }
    if (mode === 'encrypt') {
      const iv = randomBytes(16);
      return concat(iv, aes('encrypt', k, iv, data, true));
    }
    // Damaged or empty AES payloads decrypt to nothing rather than failing the document.
    if (data.length < 32 || data.length % 16) {
      return new Uint8Array();
    }
    try {
      return aes('decrypt', k, data.subarray(0, 16), data.subarray(16), true);
    } catch {
      return new Uint8Array();
    }
  };

  const convert = (
    mode: 'encrypt' | 'decrypt',
    ref: PDFRef,
    object: PDFObject,
    context: PDFContext,
  ): PDFObject => {
    if (dictionaryRef && ref === dictionaryRef) {
      return object;
    }
    const walk = (value: PDFObject, signature: boolean): PDFObject => {
      if (value instanceof PDFString || value instanceof PDFHexString) {
        if (signature) {
          return value;
        }
        return PDFHexString.of(hex(transform(mode, ref, strings, value.asBytes())));
      }
      if (value instanceof PDFArray) {
        const array = PDFArray.withContext(context);
        for (const item of value.asArray()) {
          array.push(walk(item, false));
        }
        return array;
      }
      if (value instanceof PDFDict) {
        // Signature values (/Contents of a /Sig dictionary) are never encrypted.
        const sig = ['Sig', 'DocTimeStamp'].includes(
          value.get(PDFName.of('Type'))?.toString().slice(1) ?? '',
        );
        const entries = new Map<PDFName, PDFObject>();
        for (const [key, item] of value.entries()) {
          entries.set(key, walk(item, sig && key === PDFName.of('Contents')));
        }
        return (value.constructor as typeof PDFDict).fromMapWithContext(entries, context);
      }
      return value;
    };
    if (object instanceof PDFStream) {
      const type = object.dict.get(PDFName.of('Type'))?.toString().slice(1);
      if (type === 'XRef') {
        return object;
      }
      const filters = object.dict.get(PDFName.of('Filter'));
      const crypt =
        filters?.toString() === '/Crypt' ||
        (filters instanceof PDFArray && filters.asArray()[0]?.toString() === '/Crypt');
      const keep = crypt || (type === 'Metadata' && !encryptMetadata);
      const dict = walk(object.dict, false) as PDFDict;
      const contents = object instanceof PDFRawStream ? object.contents : object.getContents();
      return PDFRawStream.of(dict, keep ? contents : transform(mode, ref, streams, contents));
    }
    return walk(object, false);
  };

  return {
    dictionaryRef,
    decrypt: (ref, object, context) => convert('decrypt', ref, object, context),
    encrypt: (ref, object, context) => convert('encrypt', ref, object, context),
  };
}
