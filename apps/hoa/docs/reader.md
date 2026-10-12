# The document reader

Every citation opens a governing document in the reader, at the cited passage. It is one component, `DocumentReader`
(`src/features/documents/DocumentReader`), used as a page and wherever a document is read beside other work.

## The URL

`/documents/$documentId?provision=<provisionKey>&cites=<key>,<key>`

- `$documentId` is the upload's id, the same one `/files/governing/$documentId` serves. A document whose text came from
  a rules file, with no upload, is read by its document key instead.
- `provision` opens the reader at that provision, highlighted, with focus on it. Without it the reader opens at the top.
- `cites` lists a rule's citations in order, so the reader steps through them ("Citation 2 of 5"); a citation in
  another document moves to that document. Stepping replaces the history entry, so Back returns to where the person was.

Build links with `citationHref(documentId, provisionKey?, cites?)` or `citedProvisionHref(citation, cites?)` from
`src/features/documents/citationLink.ts`, and render them with `ReaderLink`, a real link (middle-click and new tab
work) that moves within the app on a plain click. The server function behind the reader checks the document belongs to
the reader's organization; both roles can read every governing document.

## Text

The whole document, in one continuous scroll, from its provisions: articles and sections as headings with their
numbers, points with the number hanging in the margin, indented by level, counted paragraphs at their parent's indent.
The text is the provisions' cleaned text; page text no provision holds (`textOutsideProvisions`) is filled in where it
falls, and pages cleaning skipped as front matter come first, so nothing is hidden. A document no build has structured
shows its pages' OCR text as Markdown. Page markers ("Page 15, printed 9") sit in the flow so a reader can match the
paper.

- **The cited passage** is one tinted region with a rule on its left (amber; other citations and extra highlights are
  quieter), covering the provision and everything under it, named "Cited passage" for screen readers, focused when the
  reader opens or steps to it, and placed near the top third of the screen.
- **Where you are:** a line at the top names the current article and section once you scroll past them.
- **Outline and search** share a column on wide containers and a sheet on narrow ones. The outline lists articles and
  sections by their headings; a document of numbered paragraphs with no headings (`outlineOf`) lists each paragraph by
  its number and first words instead. Search uses the shared MiniSearch helper over the document's passages; choosing
  a result goes to it and marks the words that matched.
- Long documents stay fast: each article is a section the browser skips laying out while it's off screen
  (`content-visibility`), and jumps settle once the text above them has been laid out.

## Original

Where the upload is a PDF that's still stored, a **Text / Original** switch shows the PDF itself, drawn with pdf.js
(`pdfjs-dist`, loaded only with this view). Pages render as they come near the screen and release their canvas when
they're far; the file is read in byte ranges, so large PDFs start with the pages shown. Zoom is fit to width by default,
with zoom out and in.

Highlights are drawn on the real page from the OCR's word boxes: `getPageGeometry` reads the Layout results kept at
ingest (`ocr/azure-layout/<range>.json`) and aligns each word to the page text the way page records do, so a
provision's anchors, or any other character range, map to the words they cover (`rangeRects`, merged into one box per
line). The boxes are a tint with an outline, in a layer that scales with the page. pdf.js's text layer makes the page's
text selectable. Search matches are marked word by word on the page too. The outline, search, citation stepping and
"Open the original" work the same in both views, and switching keeps the place: the same passage, or the same page.

The view a reader opens in is the person's last choice (kept in local storage). Without one, it's the original on wide
screens when passages can be marked on it, and the text on phones and for documents without word boxes. A document
without a stored PDF (a referenced document, one read from a rules file) has text only, with no switch.

## In forms and editors

A form or an editor with unsaved work wraps itself in `CitationsOpenInSheet`
(`src/features/documents/ReaderSheet`). Every `ReaderLink` inside it then opens the reader in a large sheet over the
page on a plain click, keeping the form mounted underneath, with "Open in new tab" in the sheet's header; a
middle-click or a modifier still opens the route in a new tab. The homeowner's application form, the project type
editor and the draft rulebook's review do this. The application form also keeps a draft of its answers (not its files) in session storage, restored
after a reload with a dismissible "We restored your answers".

## Embedding

```tsx
<DocumentReader documentId={id} provision={key} cites={keys} highlights={coveredKeys} onNavigate={setTarget} />
```

It fills its container's height and lays itself out by its container's width (container queries), so it works as the
page, in a large sheet or dialog beside other work, and on a phone. With `onNavigate`, the parent owns the target (the
route keeps it in the URL); without it, the reader steps through citations on its own. Prefer linking to the route;
embed it only where leaving the page would lose the person's work.
