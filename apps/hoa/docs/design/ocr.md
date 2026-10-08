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
| Application file | The first steps of `ApplicationReview(applicationId)` | Submitting the application |

A rulebook build only uses documents that are already `ready`, so building or rebuilding a rulebook never re-runs OCR.
See [platform.md](platform.md#workflows) for the steps.

## Flow

```text
Upload ──> R2 ──presigned GET──> Layout (per page range) ──> raw response ──> R2
                                                                 │
                                       page records <────────────┤
                                       figure PNGs  <── figures API ──> vision model ──> descriptions on the page record
```

1. **Hash.** The file is hashed by streaming it from R2. A governing document matching one the HOA already has is
   refused as a duplicate ([documents.md](documents.md#object-layout)).
2. **Submit.** One step per page range (`pages=1-50`, `51-100`, ...) calls Layout with a presigned `GET` URL to the file
   (`urlSource`), so the Worker never holds the file. Requested options: `outputContentFormat=markdown`,
   `output=figures`, API version `2024-11-30`. The step returns the operation URL. Submitting is its own step so a retry
   of the polling never analyzes (and bills) the range twice.
3. **Poll.** A separate step checks the operation, with `step.sleep` between checks. When it succeeds, the response body
   is streamed to R2 (`ocr/{engine}/{pageRange}.json`) and the step returns only the key.
4. **Pages.** One step per range reads its raw response from R2 and writes one [page record](documents.md#pages) per
   page: Markdown text, normalized text, header and footer, headings, checkboxes, figures, printed label and
   low-confidence spans. Ranges are parsed one at a time to stay well inside a Worker's memory.
5. **Figures.** For each figure Layout reports, a step fetches its cropped PNG from
   `/analyzeResults/{resultId}/figures/{figureId}`, stores it at `figures/{figureId}.png`, and sends it to the vision
   model. Uploaded images are sent as they are. The description is stored on the page record **next to** the OCR text,
   never merged into it, so quotes stay verbatim.

Images (JPEG, PNG, TIFF, BMP, HEIF) go through Layout like PDFs and yield one page record each.

### Word files

Layout reads a Word file's text and headings, but it ignores embedded images and has no real pages (it counts every
3,000 characters as a page for billing). So for a `.docx`:

- The Layout text is stored as one page record, page 1, with no printed label. Citations into Word files name the
  heading or section instead of a page.
- A step unzips `word/media/*`, stores each image as a derived application file (`parentFileId` set), and processes it
  like an uploaded image. The sample application's Word appendix holds four images this way: the product photo, the
  gate, and the current fence.

## Why Layout

The design treats OCR text as ground truth: every rule's quote is checked against it. Layout is traditional OCR, not a
generative model, so it reports what's on the page, with a confidence score per word, and doesn't rewrite or invent
text. On top of the text it provides exactly the structure the pipeline needs:

| Layout output | Used for |
| --- | --- |
| Paragraph roles: `title`, `sectionHeading`, `pageHeader`, `pageFooter`, `pageNumber`, `footnote` | Section outline, printed page labels, removing running heads and watermarks |
| `sections`, a hierarchy of sections and subsections | The structure stage of [extraction.md](extraction.md) |
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
| `hoa-visual-description` | `visual-description` | `OPENROUTER_MODEL` | `fileKind`, `ocrText` (the page's OCR text, as context), plus the image | `{ description: string; measurements: { label: string; value: string }[] }` |

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

- the full documents, and peak Worker memory while parsing the 81-page CC&Rs in 50-page ranges;
- the application form's checkboxes and the Word appendix's images;
- whether the hand-marked plot plan page is reported as a figure (if not, the whole page image is needed, which Layout
  doesn't return, so the plot plan would be sent to the vision model as the original image when the file is an image,
  or flagged when it's a PDF page).

The OCR client sits behind one small interface (file in, raw responses out), so the engine can change without touching
the rest of the pipeline.
