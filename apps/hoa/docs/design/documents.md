# Documents and storage

Two kinds of documents flow through the app, with different owners, sensitivity and lifetimes:

| | Governing documents | Application files |
| --- | --- | --- |
| Examples | CC&Rs, design guidelines, amendments, the HOA's blank application form | A homeowner's form, letters, plot plans, photos, product sheets |
| Uploaded by | HOA administrator | Homeowner |
| Sensitivity | Shared with all members | Personal details: names, addresses, signatures |
| Lifetime | Kept while any rulebook version cites them | The HOA's retention setting |
| Used for | Building rulebooks, showing citations | The application's reviews |

## What lives where

| Store | Holds |
| --- | --- |
| **D1** (one shared database; every table except `hoas` has `hoa_id`) | HOAs, document and file records, page kinds, section metadata, jobs, rulebooks, rules, applications, review summaries |
| **R2** (one bucket per environment) | Original files, raw OCR responses, page records, figure images and descriptions, section text, per-job stage outputs, full review records, the content caches |
| **Langfuse** | Traces, prompts, datasets and scores ([evaluation.md](evaluation.md)) |

D1 tables, defined with Drizzle in `src/db/schema.ts` with migrations in `apps/hoa/migrations`:

| Table | One row per | Notes |
| --- | --- | --- |
| `hoas` | HOA | `settings_json` holds `HoaSettings` |
| `governing_documents` | Uploaded version of a document | `UNIQUE(lineage_id, version)` |
| `sections` | Section of a document version | Written once per version; `id` is `{documentId}:{ordinal}`. Metadata and latest routing only; text is in R2 |
| `jobs` | Workflow instance | `id` is the Workflow instance id; progress and errors |
| `rulebooks` | Rulebook | `UNIQUE(hoa_id, version)`; partial unique indexes allow one `building` and one `draft` per HOA |
| `rules` | Rule in a rulebook | `rule_key` and `rulebook_id` columns for lookups and the `UNIQUE(rulebook_id, rule_key)` constraint; the whole `Rule` in `rule_json` |
| `applications` | Application | |
| `application_files` | Uploaded or derived file | |
| `application_pages` | Page of an application file | `(file_id, page_index)` and the page's `kind` from classification |
| `reviews` | Review run | Recommendation, cost and session; the full record is in R2 |

D1 has no interactive transactions. Changes that must land together (publishing a rulebook, saving a draft, starting a
job) are one `batch()` call, which D1 runs atomically.

## Records

The TypeScript shapes below are the domain types; repositories map them to the tables above. Rulebooks and rules are
defined in [rules.md](rules.md), reviews in [review.md](review.md).

```ts
type Hoa = { id: string; name: string; slug: string; settings: HoaSettings }

type HoaSettings = {
  curableOutcome: "approve-with-conditions" | "reject" // when every unmet rule is curable; default approve-with-conditions
  retentionDays: number // days after the committee's last decision; default 365
  draftRetentionDays: number // days after the last change to an application that was never submitted; default 30
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
  pageCount: number | null // set when OCR finishes
  status: "uploading" | "processing" | "ready" | "failed"
  error: ErrorInfo | null
  uploadedBy: string
  uploadedAt: string
}
```

Authority comes from `kind` (see [rules.md](rules.md#authority-and-conflicts)), not from a stored number. An upload
starts a new lineage, or names an existing `lineageId` to become its next version; amendments name the lineage they
amend.

### Pages

One page record per page, written once by the `pages` steps of DocumentIngest and ApplicationReview ([ocr.md](ocr.md)).
Nothing rewrites a page record: descriptions and kinds are stored beside it and joined when read.

```ts
type Page = {
  documentId: string // a governing document version or an application file
  pageIndex: number // 1-based page in the analyzed file; an image or a Word file's text is page 1
  pageLabel: string | null // printed page number from a pageNumber paragraph; layout.json fills the rest
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
}

type VisualDescription = {
  figureId: string // a Layout figure id, or "image" for an uploaded or extracted image
  pageIndex: number
  description: string
  measurements: { label: string; value: string }[]
  promptVersion: PromptVersion
}
```

`getPage` returns the page with its visual descriptions and, for application pages, its kind.

### Sections

Governing documents only. Sections are written once per document version, by the first build that needs them, with
deterministic ids, so later builds and published rules' `provenance.sectionId` always point at the same rows.
Re-structuring a document is an explicit administrator action that replaces its sections in one batch. The structure
stage ([extraction.md](extraction.md)) writes each section's text, with page markers, to R2.

```ts
type Section = {
  id: string // "{documentId}:{ordinal}"
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
  routing: { projectTypes: ProjectTypeId[]; topics: Rule["topic"][]; isRelevant: boolean } | null // latest result
}
```

Routing is recomputed per build through the content cache; the column holds the latest result for display, and nothing
published depends on it.

Page markers are lines of the form `<<page 23 | label 17>>` (or `<<page 23>>` with no printed label) placed before each
page's text. A citation's quote lies on one page; a requirement that crosses a page break gets one citation per page.

### Applications

```ts
type Application = {
  id: string
  hoaId: string
  projectType: ProjectTypeId
  description: string | null // typed by the homeowner; a fact source
  createdBy: string
  createdAt: string
  updatedAt: string
  status: "draft" | "reviewing" | "reviewed" | "submitted" | "information-requested" | "decided"
  reviewId: string | null // the latest review
  submittedReviewId: string | null // the review the committee sees, fixed at submission
  submittedAt: string | null
  decision: {
    outcome: "approved" | "approved-with-conditions" | "approved-in-part" | "disapproved" | "information-requested"
    note: string | null
    decidedBy: string
    decidedAt: string
  } | null
  deleteAfter: string | null
}
```

| Status | Means | Homeowner can |
| --- | --- | --- |
| `draft` | Created, files being added | Upload files, run the review |
| `reviewing` | A review is running | Wait |
| `reviewed` | The latest review is ready | Change files and run it again, or submit, even with open requests |
| `submitted` | With the committee | Nothing until the committee decides |
| `information-requested` | The committee asked for more | Change files, run the review again, resubmit |
| `decided` | Approved, approved in part or disapproved | Nothing; a new project is a new application |

A failed review doesn't change the status: the job holds the error, and the homeowner can run the review again.

`deleteAfter` is set to `updatedAt + draftRetentionDays` while the application has never been submitted, and to
`decidedAt + retentionDays` once the committee records any decision. It's cleared while the application is submitted
and reset when the homeowner resubmits.

```ts
type ApplicationFile = {
  id: string
  applicationId: string
  parentFileId: string | null // set for images extracted from a Word file
  ordinal: number | null // position of an extracted image in its Word file
  contextText: string | null // the paragraph before an extracted image
  fileName: string
  mediaType: string
  sizeBytes: number
  sha256: string | null
  pageCount: number | null
  kind: ApplicationFileKind | null // the shared kind when every page agrees, otherwise null
  status: "uploading" | "processing" | "ready" | "unreadable"
  error: ErrorInfo | null
}

type Job = {
  id: string // the Workflow instance id; also the Langfuse session id
  hoaId: string
  kind: "document-ingest" | "rulebook-build" | "application-review"
  subjectId: string // document, rulebook or application id
  status: "running" | "completed" | "completed-with-errors" | "failed"
  stage: string | null // a stage id from ocr.md, extraction.md or review.md
  done: number // set from a count of finished items, never incremented
  total: number
  promptVersions: Record<string, PromptVersion> // resolved once when the job starts
  failures: { stage: string; itemId: string; message: string }[] // items that failed without failing the job
  error: ErrorInfo | null
  createdAt: string
  updatedAt: string
}
```

## Object layout

Keys are built from record ids. Each record stores its file's SHA-256. Page records, figures and descriptions are
written once each.

```text
hoas/{hoaId}/governing/{documentId}/source.{ext}
hoas/{hoaId}/governing/{documentId}/ocr/{engine}/{pageRange}.json        raw Layout response, one per analyzed range
hoas/{hoaId}/governing/{documentId}/pages/{pageIndex}.json               Page record
hoas/{hoaId}/governing/{documentId}/layout.json                          offset labels and repeated text, from ocr:labels
hoas/{hoaId}/governing/{documentId}/figures/{figureId}.png
hoas/{hoaId}/governing/{documentId}/figures/{figureId}.json              VisualDescription
hoas/{hoaId}/governing/{documentId}/sections/{sectionId}.md              section text with page markers
hoas/{hoaId}/cache/{stage}/{key}.json                                    content cache for governing-document stages
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/source.{ext}
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/ocr/{engine}/{pageRange}.json
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/pages/{pageIndex}.json
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/figures/{figureId}.png
hoas/{hoaId}/applications/{applicationId}/files/{fileId}/figures/{figureId}.json
hoas/{hoaId}/applications/{applicationId}/cache/{stage}/{key}.json        content cache for this application's stages
hoas/{hoaId}/applications/{applicationId}/reviews/{reviewId}.json        full Review record
hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json                          per-job stage outputs
```

Duplicates are caught by hash instead of being cached:

- A governing document whose SHA-256 matches a document already in the HOA is marked failed with "already uploaded as
  {title}, version {n}"; the existing pages stand.
- A file uploaded twice to the same application is stored once. Application files and their cache are never shared
  across applications, so one packet's data can't outlive its own retention.

## Uploads

Browsers upload directly to R2 with presigned `PUT` URLs, so large files never pass through a Worker:

1. The page calls `createUpload` with the file name, size and type. The server checks the type and size, creates the
   record with status `uploading`, and returns a presigned URL signed with `aws4fetch` against R2's S3 API. The URL
   expires after 15 minutes and is bound to the content type and length.
2. The browser `PUT`s the file. The bucket's CORS rule allows `PUT` with the `Content-Type` header from
   `http://localhost:3000`, the demo origin and the preview origin pattern.
3. The page calls `completeUpload`. The server checks the object exists with the expected size. For a governing
   document it starts DocumentIngest; application files wait for `runReview`.

Accepted types: PDF and DOCX for every upload, and JPEG and PNG for application files. HEIF, TIFF, BMP, WebP and GIF are
refused with a message asking for JPEG or PNG, because the review model can't read them. Limits: 50 MB and 300 pages per governing document (OCR reads PDFs in 50-page ranges, see
[ocr.md](ocr.md#flow); peak memory per range is measured on the 81-page CC&Rs), 25 MB per application PDF or Word file,
5 MB per image, 20 files per application. The prototype's `src/documents/uploads.ts` (which allows WebP, GIF and 30 MB) changes in the
same pull request as the upload flow.

## Access

- Governing documents, their pages and the published rulebook are readable by every member of the HOA.
- Application files, their pages and reviews are readable only by the homeowner who created the application and by the
  HOA's administrators (in phase 1, the Administrator role).
- Files are never public. A server function checks access, then returns a presigned `GET` URL that expires after
  5 minutes.

## Privacy and retention

The demo doesn't apply privacy controls to homeowner data beyond access and retention: model inputs and outputs,
including page text from application packets, reach Langfuse in full through the app's spans and OpenRouter Broadcast.

- **Retention.** A daily Cron Trigger finds applications past `deleteAfter` and, for each one: deletes everything under
  `applications/{applicationId}/` except the review records, which it rewrites without evidence quotes or raw values;
  deletes `jobs/{jobId}/` and the Langfuse traces for every job whose subject is the application (listing them by
  session id through Langfuse's API, then deleting them); deletes the application's file and page rows; and clears
  `applications.description`. Azure keeps each analyze result for up to 24 hours after OCR, then deletes it.
- **Model providers.** Every model call denies data collection, so OpenRouter never routes to providers that train on
  prompts ([ai.md](../ai.md)). That doesn't limit how long a provider retains requests.
- **Before real HOAs onboard:** application stages record summaries instead of content, and the hosted OpenRouter
  workspace uses Broadcast's privacy mode. Not needed for the demo.

## Phase 1 assumptions

- **One HOA.** A seed script, `db:seed`, creates one `Hoa` row with default settings in each environment's database;
  it's idempotent and runs once after the first migration. The HOA name moves from the prototype's upload form to that
  record.
- **Request context.** A `getRequestContext()` server helper returns `{ hoaId, user, role }`. The user comes from the
  Cloudflare Access identity when one is present, otherwise a fixed demo user per role. The role comes from a cookie
  written by the demo role switcher, which moves from `localStorage` to that cookie.
- **Tenancy.** Repositories take `hoaId` as a required argument. Server functions pass it only from the request
  context, never from their input; Workflow steps pass it from the job row they were started with; the retention sweep
  passes it from the application row it's deleting. Administrator-only server functions check the role.
