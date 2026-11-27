import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFName } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TextSession } from '../src/pdf/text-session.ts';
import { readTextPdf } from '../src/pdf/text-engine.ts';
import { insertPaperPage, removePaperPage } from '../src/pdf/paper.ts';
import { encryptedPdfs } from './fixtures/encrypted.ts';

const font = new Uint8Array(
  await readFile(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
);

async function open(initial: Uint8Array) {
  let bytes = initial.slice();
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
  return { session, bytes: () => bytes };
}

test('pen line styles are saved as dashed ink that other readers draw dashed', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  const { session, bytes } = await open(await doc.save());
  const line = (y: number): [number, number][] => [
    [40, y],
    [200, y + 20],
  ];
  session.addStroke(1, 'scribble', line(40), 2, [0, 0, 1], undefined, 'dash');
  const dotted = session.addStroke(1, 'scribble', line(140), 1, undefined, undefined, 'dot');
  session.addStroke(1, 'scribble', line(240), 0.5);
  // Copies keep their style.
  session.pasteObjects(session.copyObjects([{ kind: 'ink', id: dotted.id }]));
  await session.save();
  assert.deepEqual(
    (await readTextPdf(bytes())).strokes.map((stroke) => [stroke.width, stroke.dash]),
    [
      [2, 'dash'],
      [1, 'dot'],
      [0.5, undefined],
      [1, 'dot'],
    ],
  );
  const pdf = await getDocument({ data: bytes().slice() }).promise;
  const annotations = await (await pdf.getPage(1)).getAnnotations();
  await pdf.destroy();
  // PDF.js border styles: 1 solid, 2 dashed.
  assert.deepEqual(
    annotations.map((item) => item.borderStyle.style),
    [2, 2, 1, 2],
  );
});

test('writing paper pages are inserted like the page beside them and removed with their content', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  doc.addPage([300, 300]);
  const { session, bytes } = await open(await doc.save());
  session.addStroke(2, 'scribble', [
    [40, 40],
    [80, 80],
  ]);
  await session.save();

  // After page 1: same size as page 1; the drawing on old page 2 is now on page 3.
  await session.editPages((pdf) => insertPaperPage(pdf, 1, 'ruled', pdf.getPage(0)));
  assert.deepEqual(session.snapshot.pages, [
    [0, 0, 400, 600],
    [0, 0, 400, 600],
    [0, 0, 300, 300],
  ]);
  assert.deepEqual(session.snapshot.paperPages, [2]);
  assert.equal(session.snapshot.strokes[0]!.page, 3);
  await session.editPages((pdf) => insertPaperPage(pdf, 3, 'squared', pdf.getPage(2)));
  assert.deepEqual(session.snapshot.paperPages, [2, 4]);

  // Other readers see the rules: one line per 24 pt below the header plus the margin.
  const pdf = await getDocument({ data: bytes().slice() }).promise;
  const ops = await (await pdf.getPage(2)).getOperatorList();
  await pdf.destroy();
  assert.ok(ops.fnArray.length > 0);

  // Write on the paper page, then remove it: its text box goes with it.
  const field = session.add(2, [60, 400, 300, 430], 12, false);
  session.setValue(field.name, 'Notizen');
  await session.save();
  await assert.rejects(
    session.editPages((pdf) => removePaperPage(pdf, 0)),
    /Only pages inserted as writing paper/,
  );
  await session.editPages((pdf) => removePaperPage(pdf, 1));
  assert.equal(session.snapshot.pages.length, 3);
  assert.deepEqual(session.snapshot.paperPages, [3]);
  assert.equal(
    session.snapshot.fields.some((item) => item.name === field.name),
    false,
  );
  const saved = await PDFDocument.load(bytes());
  assert.equal(saved.getForm().getFields().length, 0);
  assert.equal(saved.getPage(2).node.get(PDFName.of('PFSPaper'))?.toString(), '/squared');
});

test('pages can be added to encrypted PDFs, which stay encrypted', async () => {
  const { session, bytes } = await open(encryptedPdfs['aes-256']);
  await session.editPages((pdf) => insertPaperPage(pdf, 1, 'dotted', pdf.getPage(0)));
  assert.equal(session.snapshot.pages.length, 2);
  assert.match(new TextDecoder('latin1').decode(bytes()), /\/Encrypt \d+ 0 R/);
  const pdf = await getDocument({ data: bytes().slice() }).promise;
  assert.equal(pdf.numPages, 2);
  await pdf.destroy();
});
