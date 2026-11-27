import { App, Modal } from 'obsidian';
import { PAPER_LABELS } from '../pdf/paper';
import { PAPER_STYLES } from '../pdf/tool-preferences';
import type { PaperStyle } from '../pdf/tool-preferences';

export type PagePosition = 'before' | 'after' | 'end';

/** Small drawing of each paper style for the picker. */
function preview(parent: HTMLElement, style: PaperStyle): void {
  const svg = parent.createSvg('svg', {
    cls: 'pfs-paper-preview',
    attr: { viewBox: '0 0 42 56', 'aria-hidden': 'true' },
  });
  svg.createSvg('rect', {
    attr: { x: '0.5', y: '0.5', width: '41', height: '55', rx: '2', class: 'pfs-paper-sheet' },
  });
  const line = (x1: number, y1: number, x2: number, y2: number, cls = 'pfs-paper-line') =>
    svg.createSvg('line', {
      attr: { x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), class: cls },
    });
  if (style === 'lined' || style === 'ruled') {
    for (let y = 10; y < 54; y += 4) {
      line(1, y, 41, y);
    }
    if (style === 'ruled') {
      line(8, 1, 8, 55, 'pfs-paper-margin');
    }
  } else if (style === 'squared') {
    for (let v = 4; v < 56; v += 4) {
      line(1, v, 41, v);
      if (v < 42) {
        line(v, 1, v, 55);
      }
    }
  } else if (style === 'dotted') {
    for (let x = 4; x < 42; x += 4) {
      for (let y = 4; y < 56; y += 4) {
        svg.createSvg('circle', {
          attr: { cx: String(x), cy: String(y), r: '0.6', class: 'pfs-paper-dot' },
        });
      }
    }
  }
}

/** Choose a writing paper style and where to put the new page. */
export class InsertPageModal extends Modal {
  private style: PaperStyle;
  private position: PagePosition = 'after';
  constructor(
    app: App,
    private page: number,
    style: PaperStyle,
    private insert: (style: PaperStyle, position: PagePosition) => void,
  ) {
    super(app);
    this.style = style;
  }
  onOpen(): void {
    this.setTitle('Insert page');
    const el = this.contentEl;
    el.addClass('pfs-insert-page');
    el.createDiv({ cls: 'pfs-property-label', text: 'Paper' });
    const styles = el.createDiv({
      cls: 'pfs-paper-styles',
      attr: { role: 'group', 'aria-label': 'Paper' },
    });
    for (const style of PAPER_STYLES) {
      const button = styles.createEl('button', {
        cls: 'pfs-paper-style',
        attr: { 'aria-pressed': String(style === this.style), 'data-paper': style },
      });
      preview(button, style);
      button.createSpan({ text: PAPER_LABELS[style] });
      button.addEventListener('click', () => {
        this.style = style;
        for (const item of styles.querySelectorAll('button')) {
          item.setAttribute('aria-pressed', String(item === button));
        }
      });
      button.addEventListener('dblclick', () => this.done());
    }
    el.createDiv({ cls: 'pfs-property-label', text: 'Position' });
    const positions = el.createDiv({
      cls: 'pfs-page-positions',
      attr: { role: 'group', 'aria-label': 'Position' },
    });
    for (const [position, label] of [
      ['before', `Before page ${this.page}`],
      ['after', `After page ${this.page}`],
      ['end', 'At the end'],
    ] as const) {
      const button = positions.createEl('button', {
        text: label,
        attr: { 'aria-pressed': String(position === this.position), 'data-position': position },
      });
      button.addEventListener('click', () => {
        this.position = position;
        for (const item of positions.querySelectorAll('button')) {
          item.setAttribute('aria-pressed', String(item === button));
        }
      });
    }
    const footer = el.createDiv({ cls: 'modal-button-container' });
    footer.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    const confirm = footer.createEl('button', { text: 'Insert page', cls: 'mod-cta' });
    confirm.addEventListener('click', () => this.done());
    confirm.focus();
  }
  private done(): void {
    this.close();
    this.insert(this.style, this.position);
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
