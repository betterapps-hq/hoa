# UX guidelines

The app is quiet: each view shows what the person needs to act, and nothing else. These rules come from review
feedback; follow them everywhere, and fix a violation when you touch the code around it.

## Show less

- **One primary action per view.** Secondary actions are quieter buttons or live in a menu.
- **Say the state in a sentence, not in counters.** "3 questions need your answer before you can publish", not a row of
  badges with numbers.
- **Details on demand.** Evidence, history, explanations and long lists go behind a disclosure, a sheet or a popover.
- **No redundant labels.** Don't label the default state. Don't repeat what the layout already says.
- **Never use a dot glyph (`·`, `•`) as a separator.** Use layout or a worded phrase.
- **Sentence case for everything shown**: labels, options, headings, buttons, menu items, table headers. Vocabulary and
  rulebook labels are stored as written (often lowercase); capitalize the first letter when rendering, through the shared
  display helper, and leave the rest as written so names and acronyms (CC&Rs, HOA) survive. Never change stored data to
  fix display case.

## Forms

- **Mark required fields only**, with a red asterisk after the label (`text-destructive`, `aria-hidden`; the input's
  `required` carries the meaning to screen readers). Optional fields show nothing: no "Optional" text.
- **At most one help affordance per field**: a field description, or one info tooltip. Never two icons.
- **Quantities use the shared quantity inputs**, chosen by the property's dimension (feet and inches, meters, area,
  duration, time, count, money), never free text a person has to format.
- **Files use the shared drop zone** (react-dropzone), never a bare file input.
- **Never expose internal concepts** (bindings, keys, kinds) in the UI; if an edit has a consequence, say it in plain
  words at the moment it happens.
- **Validate inline and kindly**: errors appear on submit or after a field is left, next to the field, saying how to fix
  it.

## Menus and lists

- **Row actions live in an ellipsis menu** with an icon on each item. Destructive items come last and confirm or offer
  undo.
- **Reorder by dragging a handle** on the left (dnd-kit, with its keyboard sensor). Don't add Move up and Move down
  items.
- **A list with columns people compare or sort is a table** on the shared data table (TanStack Table); otherwise it's a
  list of rows or cards.
- **Search uses the shared MiniSearch helper**, so every search box tolerates typos and ranks by relevance.
- **An uploaded file is an attachment** (shadcn's `Attachment`, its media `FileTypeMedia`: the extension on a tile
  tinted by kind), with its name, what became of it, and its actions (open, download, remove).
- **A photo opens in the image viewer** (`ImageViewer`, a dialog with the file's name), from its thumbnail or its
  attachment, never in place of the page.

## Citations

- A citation is a link (`citationHref`) that opens the [document reader](reader.md) at the passage, highlighted; a
  rule's citation carries its other citations to step through.
- Several citations open a designed picker (grouped by document, with label, heading and a snippet), never a plain text
  dropdown.
- A rule named in running text is its title as the link to its citation; a term is its label. Never show a rule or term
  key: one the page has no record of reads as its key in words, and isn't linked, since a guessed link can lead nowhere.
- On a page someone works through (a form, an editor, an application under review), a citation opens the reader in a
  sheet over the page (`CitationsOpenInSheet`), so nothing is lost; a middle-click still opens it in a new tab.

## Checking

Verify every UX change in the integrated browser at desktop and phone widths, in light and dark, and from the keyboard
(see `.github/copilot-instructions.md`).
