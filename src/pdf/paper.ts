import { PDFName } from 'pdf-lib';
import type { PDFDocument, PDFPage } from 'pdf-lib';
import type { PaperStyle } from './tool-preferences.ts';

/**
 * Writing paper pages, after Xournal++'s page backgrounds: plain, lined (24 pt rules
 * below an 80 pt header), lined with a red margin, 5 mm squares and 5 mm dots. The
 * background is part of the page content; the page is tagged so it can be removed again.
 */

export const PAPER_LABELS: Record<PaperStyle, string> = {
  plain: 'Plain',
  lined: 'Lined',
  ruled: 'Lined with margin',
  squared: 'Squared (5 mm)',
  dotted: 'Dotted (5 mm)',
};

const RULE = 24;
const HEADER = 80;
const MARGIN = 72;
const GRID = 14.1732; // 5 mm
const BLUE = '0.6 0.77 0.95 RG';
const RED = '0.95 0.45 0.6 RG';

const n = (value: number) => String(Math.round(value * 1000) / 1000);

export function paperContent(style: PaperStyle, width: number, height: number): string {
  const ops: string[] = [];
  if (style === 'lined' || style === 'ruled') {
    ops.push('q', BLUE, '0.6 w');
    for (let y = height - HEADER; y > RULE / 2; y -= RULE) {
      ops.push(`0 ${n(y)} m ${n(width)} ${n(y)} l`);
    }
    ops.push('S', 'Q');
    if (style === 'ruled') {
      ops.push('q', RED, '0.8 w', `${MARGIN} 0 m ${MARGIN} ${n(height)} l S`, 'Q');
    }
  } else if (style === 'squared') {
    ops.push('q', '0.75 0.85 0.95 RG', '0.4 w');
    for (let x = GRID; x < width; x += GRID) {
      ops.push(`${n(x)} 0 m ${n(x)} ${n(height)} l`);
    }
    for (let y = height - GRID; y > 0; y -= GRID) {
      ops.push(`0 ${n(y)} m ${n(width)} ${n(y)} l`);
    }
    ops.push('S', 'Q');
  } else if (style === 'dotted') {
    // Zero-length round-capped lines are dots in every viewer.
    ops.push('q', '0.55 0.6 0.68 RG', '1.4 w 1 J');
    for (let x = GRID; x < width; x += GRID) {
      for (let y = height - GRID; y > 0; y -= GRID) {
        ops.push(`${n(x)} ${n(y)} m ${n(x)} ${n(y)} l`);
      }
    }
    ops.push('S', 'Q');
  }
  return ops.join('\n');
}

/** Insert a writing paper page at `index` (0-based), sized and turned like `like`. */
export function insertPaperPage(
  pdf: PDFDocument,
  index: number,
  style: PaperStyle,
  like: PDFPage,
): PDFPage {
  const box = like.getCropBox();
  const page = pdf.insertPage(index, [box.width, box.height]);
  const rotation = like.getRotation().angle;
  if (rotation) {
    page.setRotation(like.getRotation());
  }
  if (style !== 'plain') {
    page.node.set(
      PDFName.of('Contents'),
      pdf.context.register(pdf.context.flateStream(paperContent(style, box.width, box.height))),
    );
  }
  page.node.set(PDFName.of('PFSPaper'), PDFName.of(style));
  return page;
}

export function isPaperPage(page: PDFPage): boolean {
  return page.node.get(PDFName.of('PFSPaper')) instanceof PDFName;
}

/**
 * Remove a page this editor inserted, with the form fields that only live on it
 * (fields elsewhere keep their other widgets).
 */
export function removePaperPage(pdf: PDFDocument, index: number): void {
  const page = pdf.getPage(index);
  if (!isPaperPage(page)) {
    throw new Error('Only pages inserted as writing paper can be removed.');
  }
  if (pdf.getPageCount() < 2) {
    throw new Error('A PDF needs at least one page.');
  }
  const annots = new Set(page.node.Annots()?.asArray() ?? []);
  const form = pdf.getForm();
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    const here = widgets.filter(
      (widget) =>
        widget.P() === page.ref ||
        [...annots].some((ref) => pdf.context.lookup(ref) === widget.dict),
    );
    if (here.length && here.length === widgets.length) {
      form.removeField(field);
    }
  }
  pdf.removePage(index);
}
