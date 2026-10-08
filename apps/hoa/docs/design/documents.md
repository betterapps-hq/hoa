# Documents and storage

Two kinds of documents flow through the app, with different owners, sensitivity and lifetimes:

| | Governing documents | Application files |
| --- | --- | --- |
| Examples | CC&Rs, design guidelines, amendments, the HOA's blank application form | A homeowner's form, letters, plot plans, photos, product sheets |
| Uploaded by | HOA administrator | Homeowner |
| Sensitivity | Shared with all members | Personal details: names, addresses, signatures |
| Lifetime | Kept while any rulebook version cites them | The HOA's retention setting after a decision |
| Used for | Building rulebooks, showing citations | One review |

## What lives where

| Store | Holds |
| --- | --- |
| **D1** (one shared database; every table except `hoas` has `hoa_id`) | HOAs, document and file records, section metadata, jobs, rulebooks, rules, applications, review summaries |
| **R2** (one bucket per environment) | Original files, raw OCR responses, page records, figure images, section text, per-job stage outputs, full review records, the content cache |
| **Langfuse** | Traces, prompts, datasets and scores ([evaluation.md](evaluation.md)) |

D1 tables, defined with Drizzle in `src/db/schema.ts` with migrations in `apps/hoa/migrations`:

| Table | One row per | Notes |
| --- | --- | --- |
| `hoas` | HOA | `settings_json` holds `HoaSettings` |
| `governing_documents` | Uploaded version of a document | `UNIQUE(lineage_id, version)` |
| `sections` | Section of a document version | Metadata and routing only; text is in R2. `UNIQUE(document_id, ordinal)` |
| `jobs` | Workflow instance | `id` is the Workflow instance id; progress and errors |
| `rulebooks` | Rulebook version | `UNIQUE(hoa_id, version)` |
| `rules` | Rule in a rulebook | Scalar columns, plus JSON columns for `appliesWhen`, `check`, `exceptions`, `citations`, `issues`, `provenance`. `UNIQUE(rulebook_id, rule_key)` |
| `applications` | Application | |
| `application_files` | Uploaded or derived file | |
| `reviews` | Review | Recommendation, cost and session; the full record is in R2 |

D1 has no interactive transactions. Changes that must land together (publishing a rulebook, saving a draft) are one
`batch()` call, which D1 runs atomically.

## Records

The TypeScript shapes below are the domain types; repositories map them to the tables above. Rulebooks and rules are
defined in [rules.md](rules.md), reviews in [review.md](review.md).

```ts
type Hoa = { id: string; name: string; slug: string; settings: HoaSettings }

type HoaSettings = {
  curableOutcome: "approve-with-conditions" | "reject" // when every unmet rule is curable; default approve-with-conditions
  retentionDays: number // days after the committee's decision; default 365
}

type ErrorInfo = { stage: string; message: string; isRetryable: boolean }

type GoverningDocument = {
  id: string // one id per uploaded version; pages, sections and citations use it
  lineageId: string // shared by every version of the same document
  version: number // 1, 2, 3 ... within the lineage
  hoaId: string
  kind: "declaration" | "bylaws" | "rules-and-regulations" | "design-guidelines" | "amendment" | "form"
  amends: string | null // lineageId of the amended document, for amendments
  title: string
  effectiveDate: string | null
  fileName: string
  mediaType: string
  sizeBytes: number
  sha256: string | null // computed by DocumentIngest
  pageCount: number | null
  status: "uploading" | "processing" | "ready" | "failed"
  error: ErrorInfo | null
  uploadedBy: string
  uploadedAt: string
}
```

Authority comes from `kind` (see [rules.md](rules.md#authority-and-conflicts)), not from a stored number.

### Pages

One page record per page, written by DocumentIngest ([ocr.md](ocr.md)). This is the only definition of a page.

```ts
type Page = {
  documentId: string // a governing document version or an application file
  pageIndex: number // 1-based page in the analyzed file; an image or a Word file's text is page 1
  pageLabel: string | null // printed page number
  labelSource: "page-number" | "offset" | null
  engine: string // "azure-layout@2024-11-30"
  optionsHash: string // hash of the analyze options
  text: string // Markdown, tables as HTML
  normalizedText: string // lowercased; whitespace, hyphenation, quotes and punctuation normalized; for citation matching
  header: string | null // running heads, recording stamps
  footer: string | null
  headings: { level: number; text: string; offset: number }[] // offset into `text`
  sectionAtTop: string | null // number or heading of the section in effect at the top of the page
  checkboxes: { label: string; state: "selected" | "unselected" }[]
  figures: { id: string; caption: string | null; imageKey: string }[] // imageKey is the PNG in R2
  minConfidence: number | null
  lowConfidenceSpans: { start: number; end: number }[] // offsets into `text` of words below 0.8 confidence
  visualDescriptions: { figureId: string | null; text: string }[] // from the vision model; null figureId is the whole image
  kind: ApplicationFileKind | null // application pages only, set by classification
}
```

### Sections

Governing documents only. The structure stage ([extraction.md](extraction.md)) writes each section's text, with page
markers, to R2.

```ts
type Section = {
  id: string
  documentId: string // a governing document version
  ordinal: number // order within the document
  number: string | null // "5.4.2"
  heading: string
  kind: "body" | "definitions" | "exhibit"
  parentId: string | null
  pageStart: number
  pageEnd: number
  startOffset: number // into the text of page pageStart
  endOffset: number // into the text of page pageEnd
  references: string[] // ids of sections this one refers to ("see Exhibit K", "as defined in Article 1")
  routing: { projectTypes: ProjectTypeId[]; topics: Rule["topic"][]; isRelevant: boolean } | null
}
```

Page markers are lines of the form `<<page 23 | label 17>>` (or `<<page 23>>` with no printed label) placed before each
page's text. A citation's quote lies on one page; a requirement that crosses a page break gets one citation per page.

### Applications

```ts
type Application = {
  id: string
  hoaId: string
  projectType: ProjectTypeId
  description: string | null // typed by the homeowner on the submit page; a fact source
  submittedBy: string
  submittedAt: string | null
  rulebookId: string | null // the published rulebook the review used
  status: "draft" | "submitted" | "reviewing" | "reviewed" | "decided" | "failed"
  error: ErrorInfo | null
  reviewId: string | null
  decision: {
    outcome: "approved" | "approved-with-conditions" | "approved-in-part" | "disapproved"
    note: string | null
    decidedBy: string
    decidedAt: string
  } | null
  deleteAfter: string | null // decidedAt + retentionDays, set when the decision is recorded
}

type ApplicationFile = {
  id: string
  applicationId: string
  parentFileId: string | null // set for images extracted from a Word file
  fileName: string
  mediaType: string
  sizeBytes: number
  sha256: string | null
  pageCount: number | null
  kind: ApplicationFileKind | null // see rules.md; set by classification
  status: "uploading" | "processing" | "ready" | "unreadable"
  error: ErrorInfo | null
}

type Job = {
  id: string // the Workflow instance id; also the Langfuse session id
  hoaId: string
  kind: "document-ingest" | "rulebook-build" | "application-review"
  subjectId: string // document, rulebook or application id
  status: "running" | "completed" | "completed-with-errors" | "failed"
  stage: string | null // current step, using extraction.md and review.md stage names
  done: number
  total: number
  promptVersions: Record<string, number> // resolved once when the job starts
  failures: { stage: string; itemId: string; message: string }[] // items that failed without failing the job
  error: ErrorInfo | null
  createdAt: string
  updatedAt: string
}
```

## Object layout

Keys are built from record ids. Each record stores its file's SHA-256, and every write goes to a new key.

```text
hoas/{hoaId}/governing/{documentId}/source.{ext}
hoas/{hoaId}/governing/{documentId}/ocr/{engine}/{pageRange}.json        raw Layout response, one per analyzed range
hoas/{hoaId}/governing/{documentId}/pages/{pageIndex}.json               Page record
hoas/{hoaId}/governing/{documentId}/figures/{figureId}.png
hoas/{hoaId}/governing/{documentId}/sections/{sectionId}.md              section text with page markers
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/source.{ext}
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/ocr/{engine}/{pageRange}.json
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/pages/{pageIndex}.json
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/figures/{figureId}.png
hoas/{hoaId}/applications/{applicationId}/reviews/{reviewId}.json        full Review record
hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json                          per-job stage outputs
hoas/{hoaId}/cache/{stage}/{key}.json                                    content cache (platform.md)
```

Duplicates are caught by hash instead of being cached:

- A governing document whose SHA-256 matches a document already in the HOA is marked failed with "already uploaded as
  {title}, version {n}"; the existing pages stand.
- A file uploaded twice to the same application is stored once. Application files are never reused across applications,
  so one packet's pages can't outlive its own retention.

## Uploads

Browsers upload directly to R2 with presigned `PUT` URLs, so large files never pass through a Worker:

1. The page calls `createUpload` with the file name, size and type. The server checks the type and size, creates the
   record with status `uploading`, and returns a presigned URL signed with `aws4fetch` against R2's S3 API. The URL
   expires after 15 minutes and is bound to the content type and length.
2. The browser `PUT`s the file. The bucket's CORS rule allows `PUT` from `http://localhost:3000`, the demo origin and the
   preview origin pattern.
3. The page calls `completeUpload`. The server checks the object exists with the expected size and starts DocumentIngest
   (governing documents) or, on submit, ApplicationReview (application files), which hash the file by streaming it
   through `crypto.DigestStream`.

Accepted types match what Layout reads: PDF, JPEG, PNG, TIFF, BMP, HEIF and DOCX. WebP and GIF are refused. Limits: 50 MB
and 300 pages per governing document (the page limit is confirmed by measuring memory on the 81-page CC&Rs, see
[platform.md](platform.md#limits-that-shape-the-design)), 25 MB per application file, 20 files per application. The
prototype's `src/documents/uploads.ts` (which allows WebP, GIF and 30 MB) changes in the same pull request as the upload
flow.

## Access

- Governing documents, their pages and the published rulebook are readable by every member of the HOA.
- Application files, their pages and reviews are readable only by the homeowner who submitted them and by the HOA's
  administrators (in phase 1, the Administrator role).
- Files are never public. A server function checks access, then returns a presigned `GET` URL that expires after
  5 minutes.

## Privacy and retention

- **Retention.** A daily Cron Trigger deletes, for every application past `deleteAfter`: its files, page records,
  figures and stage outputs in R2; the evidence quotes in its review (facts and findings stay); and its Langfuse traces,
  found by the job's session id. Until the committee records a decision, `deleteAfter` is null and nothing is deleted.
- **Model providers.** Every model call denies data collection, so OpenRouter never routes to providers that train on
  prompts ([ai.md](../ai.md)).
- **What reaches Langfuse.** Governing-document stages record full inputs and outputs on the app's spans. Application
  stages record summaries only: variable names and sizes, file ids instead of file names, and facts and findings
  without personal quotes. OpenRouter Broadcast would also send prompt and completion text, so the demo uses its own
  OpenRouter workspace with Broadcast's privacy mode on: cost, usage and timing still arrive, content doesn't. In the
  demo, governing-document content reaches Langfuse only through the app's spans. Development keeps Broadcast content
  for debugging.
- **The sample packet.** Every environment, including development, uses the redacted copy of the sample application.
  The original in `.fixtures/` is never uploaded, committed or added to a dataset.

## Phase 1 assumptions

- **One HOA.** A seed migration creates one `Hoa` row with default settings. The HOA name moves from the prototype's
  upload form to that record.
- **Request context.** A `getRequestContext()` server helper returns `{ hoaId, user, role }`. The user comes from the
  Cloudflare Access identity when one is present, otherwise a fixed demo user per role. The role comes from a cookie
  written by the demo role switcher, which moves from `localStorage` to that cookie.
- **No client-supplied identity.** Repositories take `hoaId` and the user only from the request context, never from
  server-function input. Administrator-only server functions check the role.
