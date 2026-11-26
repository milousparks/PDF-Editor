# PDF Editor

Write, fill answers, highlight and draw on PDFs without leaving Obsidian. Edit in PDF tabs, notes and pop-out windows.

> **Extended personal build** of [holtsdav/PDF-Editor](https://github.com/holtsdav/PDF-Editor). It adds checkboxes, radio buttons and dropdowns, text highlights and comments (also for annotations made in other apps), a highlights sidebar with export to a note, bulleted and numbered lists, shapes, arrow-key page turning and faster saving. PDFs open in Obsidian's own viewer by default; switch editing on with the pencil button in the PDF tab. Automated tests pass; the additions have not yet been checked in the Obsidian app itself, so keep backups.

### Write and fill answers

<img src="assets/demos/text-and-answers.gif" alt="Add text and fill detected answer lines" width="480">

Click an editable form field to type, or add your own text box. Adjust font, size, color and alignment. Added text boxes also support letter and line spacing: drag a spacing value to adjust it, or click to type a number.

Use **Detect answer lines** to find places to type on worksheets. Longer answers can wrap across consecutive lines.

### Draw and highlight

<img src="assets/demos/ink-and-shapes.gif" alt="Draw, highlight and hold for shapes" width="480">

Draw with the pen or highlighter, then select a mark to move or resize it. Hold **Shift** while dragging a corner to keep its proportions. Press **Escape** to cancel a drag.

Enable **Snap to text** in the highlighter options to follow printed text. When text is unavailable, highlighting falls back to freehand. Optional drawing assistance smooths strokes and snaps held lines and shapes.

### Edit inside your notes

<img src="assets/demos/embeds-and-popouts.gif" alt="Edit PDFs in notes and pop-out windows" width="480">

Work in Reading view, Live Preview or a separate PDF window. Scrolling continues into the surrounding note when you reach the PDF's edge.

Select printed text to copy it. Zoom with the viewer controls or **Cmd/Ctrl + wheel**, and use **Fit width** to reset. Undo and redo are shared across views of the same PDF.

## Get started

**This extended build:** install [BRAT](https://github.com/TfTHacker/obsidian42-brat), choose **Add beta plugin** and enter `milousparks/PDF-Editor`. BRAT installs and updates the latest release from this fork. The version number is set high so that an update of the original plugin does not replace it.

**Original plugin:**

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/holtsdav/PDF-Editor/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/pdf-editor/`.
3. Enable **PDF Editor** under **Settings → Community plugins**.

Requires **Obsidian 1.13.7+**, desktop only. Windows support is unverified.

**Beta:** Keep backups, edit each PDF in only one app or device at a time, and wait for **Saved** and sync before switching. Existing printed text cannot be rewritten. Encrypted PDFs, XFA forms and documents containing signature fields are not supported for editing.

[MIT license](LICENSE) · [Third-party credits and licenses](THIRD_PARTY_NOTICES.txt)

## Changelog

### 1000.8.10

- Typing stays smooth while autosave runs: loading and checking the PDF now pause regularly for input, so the longest hitch on large PDFs drops from 100–270 ms to about 30 ms.

### 1000.8.9

- Large PDFs open faster: the background copy under the editor is built by appending to the original instead of rewriting the whole file (about 2.5× faster for a 185-page, 9 MB document), or is the file itself when there is nothing to hide.

### 1000.8.8

- Incremental saving: the original PDF bytes stay untouched and each save appends only the changed objects (like Acrobat). Repeated saves in one session replace their own update instead of stacking; after 12 editing sessions, or when updates exceed 15 % of the file, the PDF is rewritten once to stay compact.

### 1000.8.7

- Smoother: drawing and dragging shapes only redraws the shape being moved; autosave no longer freezes the editor on large PDFs (it pauses for input while it works and is about a third faster); pasted pictures are not re-encoded on every save; the right-click menu opens immediately.

### 1000.8.6

- Pictures: take a screenshot with your system tool (or copy an image anywhere), then press Ctrl+V in the PDF. The picture lands under the pointer or in the middle of the visible page. You can also insert a file from the toolbar (picture button) or the right-click menu. Drag to move, corner handles to resize in proportion (Shift for free resizing), right-click to turn by 90°, lock, copy, duplicate or delete. Copied pictures paste into other apps as PNG. Pictures are saved as standard stamp annotations that other PDF readers show.

### 1000.8.5

- Right-click menu in the editor: cut, copy, paste at the clicked spot, duplicate and delete text boxes, drawings and shapes; turn shapes by 90°, flip and lock them; recolour, comment or delete highlights and notes; add a text box or note where you clicked. Ctrl+C/X/V/D work for a selected shape. Selected PDF text keeps Obsidian's own menu.

### 1000.8.4

- Zooming keeps pages centred: pages narrower than the view are centred, and the zoom buttons zoom about the middle of the view.

### 1000.8.3

- Rotate rectangles and ellipses with the round handle above a selected shape (Shift snaps to 15°). Other PDF readers show the turned shape; editing it there may straighten it.

### 1000.8.2

Extended personal build on top of 0.8.2:

- Fill checkboxes, radio buttons, dropdowns and single-select list boxes.
- Highlight selected PDF text (toolbar button or the bar next to the selection; pressing again removes it) and add comments or sticky notes, saved as standard PDF annotations. Highlights and notes made in other apps can be edited too.
- Highlights sidebar listing highlights and comments by page, with export to a note that links back to each page.
- Bulleted and numbered lists with indentation in text boxes (toolbar buttons, Enter, Tab and Shift+Tab).
- Rectangles, ellipses, lines and arrows, outlined or filled.
- Left and right arrow keys turn whole pages.
- PDFs open in Obsidian's viewer (keeping plugins such as PDF++) until editing is switched on per PDF.
- Bullets pasted from Word or other PDFs are replaced instead of blocking the save.
- Faster saving on large forms and lighter refreshes while typing.

### 0.8.2

- Text alignment, letter spacing and line spacing with compact controls.
- Resizable drawings and optional highlighter snapping to text.
- Improved zoom, scrolling, printed-text selection and shared undo/redo.
- Better handling of large PDFs.
- Loading fixes for PDFs saved by Apple Preview and other editors, including incremental updates and empty object indexes.
- Optional Trash cleanup for imported originals, off by default.
