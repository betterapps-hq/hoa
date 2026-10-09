# Page text and OCR

OCR runs **when a document is uploaded**, as a processing step of its own, separate from every AI model call. Each
uploaded file is sent to **Azure AI Document Intelligence** (the prebuilt **Layout** model) once, and its page text and
structure are stored as page records. Every later stage (finding sections, extracting rules, checking citations,
reviewing applications) works on those records, never on the original file. Model calls receive page text with page
markers instead of PDFs, which keeps them cheap, keeps citations exact, and avoids paying to re-read the same pages.

Research for this page was done on 2026-10-08; prices and API versions change, so re-check before relying on them.

## Where it runs

| File | Workflow | Started by |
| --- | --- | --- |
| Governing document | `DocumentIngest(documentId)`, which sets the document `ready` or `failed` | `completeUpload` |
| Application file | The `ocr` and `visuals` stages of `ApplicationReview(applicationId)` | `runReview` |

A rulebook build only uses documents that are already `ready`, so building or rebuilding a rulebook never re-runs OCR.

DocumentIngest's stages, which are also the job's `stage` values (every step name starts with its stage id):

| Stage id | Steps |
| --- | --- |
| `resolve-prompts` | `resolve-prompts` |
| `ocr` | `ocr:hash`, then per range `ocr:submit:{range}`, `ocr:poll:{range}`, `ocr:pages:{range}`, then `ocr:labels` |
| `visuals` | `visuals:{figureId}` |

ApplicationReview runs the same steps per file, with the file id in each name ([application-review.md](application-review.md#stages)).

## Flow

```text
Upload ──> R2 ──presigned GET──> Layout ──> raw response ──> R2 ──> page records
                                    │
                                    └── figures API ──> figure PNGs ──> vision model ──> descriptions
```

1. **Hash.** The file is hashed by streaming it from R2 through `crypto.DigestStream`. A governing document matching
   one the HOA already has is refused as a duplicate ([documents.md](documents.md#object-layout)).
2. **Submit.** `ocr:submit:{range}` calls Layout with a presigned `GET` URL to the file (`urlSource`), so the Worker
   never holds the file (without an R2 token it sends the file inline, as `base64Source`). Requested options: `outputContentFormat=markdown`, `output=figures`, API version
   `2024-11-30`, and for PDFs `pages={range}`. The step returns the operation URL. Submitting is its own step, so a
   retried poll never analyzes (and bills) a range twice.
3. **Poll.** `ocr:poll:{range}` checks the operation and throws a retryable "not ready" error while Layout is still
   running, with `retries: { limit: 180, delay: "5 seconds", backoff: "constant" }` (15 minutes). A Workflow step name
   is its cache key, so polling must not call the same step name in a loop: that would return the first cached
   "running" result forever. When the operation succeeds, the step streams the response to R2
   (`ocr/{engine}/{range}.json`) and returns only the key.
4. **Pages.** `ocr:pages:{range}` reads that range's raw response and writes one [page record](documents.md#pages) per
   page: Markdown text, normalized text, header and footer, headings, checkboxes, figures, printed labels from
   `pageNumber` paragraphs, and low-confidence spans. It returns how many pages it wrote.

   PDFs are analyzed in **50-page ranges, one after another**, because the Worker can't know a PDF's page count before
   Layout reads it, and parsing one range at a time keeps memory bounded. The workflow submits `1-50`; if that range
   came back with 50 pages, it submits `51-100`, and so on, stopping at the first short range or when Layout reports
   the range is past the end of the file. Past 300 pages the document fails with a `NonRetryableError`. Word files and
   images are always one call with no `pages` option.

   A final `ocr:labels` step runs once all ranges are written, because it needs the whole document: it computes
   printed labels from the most common offset for pages with no `pageNumber` paragraph, finds text repeated on more
   than half the pages (watermarks, recording stamps), and writes both to `layout.json` beside the pages. Page records
   stay write-once; readers apply `layout.json` when they load pages. It also sets `pageCount`.5. **Visuals.** For each figure Layout reports, `visuals:{figureId}` fetches its cropped PNG from
   `/analyzeResults/{resultId}/figures/{figureId}`, stores it at `figures/{figureId}.png`, sends it to the vision model,
   and stores the description at `figures/{figureId}.json`. Uploaded and extracted images (JPEG and PNG only) are sent
   as they are, as figure `image`. Descriptions are stored beside the page record, never merged into its text, so
   quotes stay verbatim. Azure deletes analyze results after 24 hours, so a run that needs a figure image again later
   uses the stored PNG.

### Word files

Layout reads a Word file's text and headings, but it ignores embedded images and has no real pages (it counts every
3,000 characters as a page for billing). So for a `.docx`:

- The Layout text is stored as one page record, page 1, with no printed label. Citations into Word files name the
  heading or section instead of a page.
- A step (`ocr:media:{fileId}`) walks `word/document.xml` for embedded pictures in document order and resolves each
  through `word/_rels/document.xml.rels`. Each JPEG or PNG becomes a derived application file with `parentFileId`, its
  `ordinal` and its `contextText` (the paragraph just before it); other formats, such as EMF drawings, are stored as
  unreadable. The context goes to the vision and facts prompts, because it's what says what each picture shows.
- The sample appendix holds four pictures this way: the current fence ("Here's what the current fence looks like"), the
  proposed product ("Copy of the new fence is attached"), the gate ("Here's a photo of the gate we'll install") and the
  hand-marked plat map, which is the packet's plot plan.
- Governing Word documents get the same treatment, so exhibit drawings embedded in them are described too.

## Why Layout

The design treats OCR text as ground truth: every rule's quote is checked against it. Layout is traditional OCR, not a
generative model, so it reports what's on the page, with a confidence score per word, and doesn't rewrite or invent
text. On top of the text it provides exactly the structure the pipeline needs:

| Layout output | Used for |
| --- | --- |
| Paragraph roles: `title`, `sectionHeading`, `pageHeader`, `pageFooter`, `pageNumber`, `footnote` | Section outline, printed page labels, removing running heads and watermarks |
| `sections`, a hierarchy of sections and subsections | The structure stage of [encoding.md](encoding.md#2-structure) |
| Tables, with merged cells, as HTML in the Markdown | Rules stated in tables (colors per manufacturer) |
| Selection marks (☒ and ☐) | Checkboxes on application forms |
| Figures, with their location, caption and a cropped image (`output=figures`) | Vision descriptions |
| Words with confidence and position on the page | Low-confidence spans, and highlighting a citation on the page later |

## Why OCR every page

Digitally created PDFs already contain their text, and reading it directly would be free. Checking each page first
isn't worth it: it adds code and memory risk inside a Worker (a 15 MB vector PDF can exceed a Worker's memory), and OCR
on a clean digital page is as accurate as its text layer. One path for every document is simpler to build, test and
trust.

## The inputs this handles

| Input | What Layout does |
| --- | --- |
| Scanned PDFs (the sample CC&Rs) | Reads the image, ignoring the noisy embedded text; recording stamps and watermarks become headers, footers or low-confidence lines |
| "Printed to PDF" files whose text is drawn as shapes (the sample guidelines) | Reads the rendered page, so text appears even though the file has none |
| Digitally filled forms | Text, plus checkbox states |
| Word documents | Text and headings; embedded images are extracted by the app (above) |
| Drawings, plot plans, photos | Labels and dimensions as text, figures with cropped images for the vision model |

## Page labels

Citations show both numbers, for example "page 17 (PDF page 23)". The printed label comes from, in order:

1. a paragraph with the `pageNumber` role on that page (`labelSource: "page-number"`);
2. the most common offset between printed and PDF numbers across the document (`labelSource: "offset"`), with pages
   that don't fit flagged.

Reading the PDF's own page-label table would need a PDF parser in the Worker, which the memory limits rule out.

## Cleaning

Paragraphs with the `pageHeader` and `pageFooter` roles go to the page's header and footer, not its body. Text that
still repeats on more than half the pages (watermarks such as "Unofficial copy", recording stamps) is removed from the
body too. Each page records the section in effect at its top, carried over from the previous page, so a rule that
starts mid-section can still be cited correctly.

The raw Layout responses stay in R2 for debugging and re-processing; page records can be rebuilt from them without
calling Layout again.

## Prompts and models

| Prompt | Trace name | Model setting | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-visual-description` | `visual-description` | `OPENROUTER_MODEL` | `documentKind` (the governing document's kind, or null for application files), `contextText`, `ocrText` (the page's OCR text), plus the image | `{ description: string; measurements: { label: string; value: string }[] }` |

The description says what the drawing or photo shows (fence route, board orientation, gate, product) without restating
the OCR text. Model settings are fallbacks; a prompt version's `config.model` takes precedence ([ai.md](../ai.md)).

## Engines considered

| Engine | Verdict |
| --- | --- |
| **Azure AI Document Intelligence, Layout** | **Chosen.** Faithful OCR with word confidence; roles for headings, page numbers, headers and footers; section hierarchy; HTML tables; checkboxes; figure images. About $10 per 1,000 pages. |
| Mistral OCR 4.1 API | Alternative if Layout fails the full-document tests; not a runtime fallback. Generative OCR with per-page Markdown, headers, footers and tables at $4 per 1,000 pages. Handles messy layouts well, but testers report occasional added, dropped or changed words, invented table structure and misread checkboxes, and it leaves section structure to us. |
| Azure AI Document Intelligence, Read | Cheapest (about $1.50 per 1,000 pages) but text and lines only, with no headings, tables or checkboxes. |
| OpenRouter's PDF parser | Rejected: it only runs inside a chat request, while OCR is an upload-time step. No documented page boundaries or confidence. |
| Sending PDFs straight to the review model | Bills every page on every call, can quietly paraphrase, and loses page boundaries. |
| Cloudflare Workers AI `toMarkdown()` | Free, but doesn't OCR: the sample guidelines come back empty. |

## Resource

| | |
| --- | --- |
| Azure resource | `hoa-document-intelligence`, in resource group `hoa`, West US 2, Standard (S0) tier |
| Endpoint | `https://hoa-document-intelligence.cognitiveservices.azure.com/` |
| Settings | `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY` ([setup.md](../setup.md)) |

The free tier analyzes only the first two pages of each document, so the app uses Standard, which bills per page. With a
few HOAs uploading occasionally, OCR costs cents a month. Layout is called with `fetch`; no Azure SDK is needed.

## First test (2026-10-08)

Two pages of the sample documents, through Layout API version 2024-11-30:

| | Guidelines page 17 (no text layer) | CC&Rs PDF page 23 (2001 scan) |
| --- | --- | --- |
| Time | 8 s | 8 s |
| Text | Every word correct; 0 of 391 words below 0.8 confidence | Body text clean; 16 of 493 words below 0.8 confidence |
| Headings | 7 section headings with numbers (5.4, 5.4.1, 5.4.2 ...) and nesting | "4.3 Guidelines and Procedures" read as "43 Guidelines and Procedures" |
| Page label | Printed "17" found | Printed "17" found (PDF page 23, the expected offset of 6) |
| Headers and footers | Approval-date footer separated | Recording stamps and the scanner's watermark separated from the body |
| Qualifiers | Colors stay listed under their manufacturers | Not applicable |

What the pipeline must handle on scans:

- **Dropped decimal points in section numbers** ("43" for "4.3"). The structure stage repairs numbers using the
  surrounding outline: a heading "43" inside Article 4, between 4.2 and 4.4, is 4.3.
- **Dropped punctuation** (sentence-ending periods). Citation matching ignores punctuation and compares words.
- **Low-confidence words** are kept, and a citation whose quote overlaps a low-confidence span is marked for the
  administrator to check.

Still to test, early in phase 1:

- the full guidelines and the 81-page CC&Rs (two ranges), measuring peak Worker memory while parsing a range, and the
  error Layout returns for a range past the end of the file;
- the application form's checkboxes;
- the Word appendix: extracting its four pictures with their context, classifying the plat map as `plot-plan`, and the
  vision model reading the red route and the gate from it;
- for other packets, whether a hand-marked plot plan on a PDF page is reported as a figure (if not, its page has no
  image for the vision model, and the review relies on Layout's text for that page).

The OCR client sits behind one small interface (file in, raw responses out), so the engine can change without touching
the rest of the pipeline.