import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readTextPdf } from '../src/pdf/text-engine.ts';
import { TextSession } from '../src/pdf/text-session.ts';
import { loadPdfDocument } from '../src/pdf/pdf-load.ts';
import { incrementalBytes, trackChanges } from '../src/pdf/incremental.ts';
import { encryptedPdfs } from './fixtures/encrypted.ts';
import { aesCbc, md5, sha256, sha384, sha512 } from '../src/pdf/crypto-primitives.ts';

const font = new Uint8Array(
  await readFile(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
);
const latin1 = new TextDecoder('latin1');

/** PDF.js decrypts on its own: field value, annotation types and title as another reader sees them. */
async function independentRead(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  const annotations = await (await pdf.getPage(1)).getAnnotations();
  const { info } = (await pdf.getMetadata()) as { info: { Title?: string } };
  await pdf.destroy();
  return {
    value: annotations.find((item) => item.fieldName === 'answer')?.fieldValue,
    subtypes: annotations.map((item) => item.subtype).sort(),
    title: info.Title,
  };
}

for (const name of ['rc4-40', 'rc4-128', 'aes-128', 'aes-256'] as const) {
  test(`edits encrypted PDFs and keeps them encrypted (${name})`, async () => {
    const original = encryptedPdfs[name];
    let bytes = original.slice();
    const session = await TextSession.open(
      {
        read: async () => bytes.slice(),
        write: async (value) => {
          bytes = value.slice();
        },
        backup: async () => '',
      },
      font,
    );
    assert.equal(
      session.snapshot.fields.find((field) => field.name === 'answer')?.value,
      'Ä first',
    );
    session.setValue('answer', 'Geändert');
    session.addShape({
      page: 1,
      kind: 'rectangle',
      box: [40, 40, 140, 100],
      color: [1, 0, 0],
      width: 2,
    });
    await session.save();
    // Small files are rewritten whole: still encrypted, with the same dictionary.
    const text = latin1.decode(bytes);
    assert.match(text.slice(text.lastIndexOf('trailer')), /\/Encrypt \d+ 0 R/);
    assert.doesNotMatch(text, /Geändert|Ge\\344ndert|Locked title/);
    assert.deepEqual(await independentRead(bytes), {
      value: 'Geändert',
      subtypes: ['Square', 'Widget'],
      title: 'Locked title',
    });
    assert.equal(
      (await readTextPdf(bytes)).fields.find((field) => field.name === 'answer')?.value,
      'Geändert',
    );
    // Larger files append only the changed objects, encrypted with the same key.
    const pdf = await loadPdfDocument(original);
    const { tracker, stop } = trackChanges(pdf, original);
    pdf.setTitle('Neuer Titel');
    const appended = incrementalBytes(original, pdf, tracker, true)!;
    stop();
    assert.ok(original.every((value, index) => appended[index] === value));
    const update = latin1.decode(appended.subarray(original.length));
    assert.match(update, /\/Encrypt \d+ 0 R/);
    assert.doesNotMatch(update, /Neuer Titel/);
    assert.equal((await independentRead(appended)).title, 'Neuer Titel');
  });
}

test('PDFs that need a password to open stay read only, with a clear reason', async () => {
  await assert.rejects(loadPdfDocument(encryptedPdfs['aes-256-user']), /protected with a password/);
  // With the password the document opens.
  const pdf = await loadPdfDocument(encryptedPdfs['aes-256-user'], 'user');
  assert.equal(pdf.getForm().getTextField('answer').getText(), 'Ä first');
});

test('the built-in hashes and AES match Node for every length and key size', () => {
  const bytes = (length: number, seed: number) =>
    Uint8Array.from({ length }, (_, i) => (i * 31 + seed * 7) & 255);
  for (const length of [0, 1, 55, 56, 63, 64, 111, 112, 127, 128, 1000]) {
    const data = bytes(length, length);
    for (const [name, ours] of [
      ['md5', md5],
      ['sha256', sha256],
      ['sha384', sha384],
      ['sha512', sha512],
    ] as const) {
      assert.deepEqual(
        ours(data),
        new Uint8Array(createHash(name).update(data).digest()),
        `${name} ${length}`,
      );
    }
    for (const size of [16, 32]) {
      const key = bytes(size, 3);
      const iv = bytes(16, 5);
      const node = createCipheriv(`aes-${size * 8}-cbc`, key, iv);
      const expected = new Uint8Array(Buffer.concat([node.update(data), node.final()]));
      const encrypted = aesCbc('encrypt', key, iv, data, true);
      assert.deepEqual(encrypted, expected, `aes-${size * 8} ${length}`);
      assert.deepEqual(aesCbc('decrypt', key, iv, encrypted, true), data);
    }
  }
});
