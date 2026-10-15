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
| **D1** (one shared database; every table except `organizations` has `organization_id`) | HOAs, document and file records, provisions, page kinds, jobs, rulebooks and their rules, terms and questions, project types, applications, review summaries |
| **R2** (one bucket per environment) | Original files, raw OCR responses, page records, figure images and descriptions, published rules files, per-job step outputs, full review records, the content caches |
| **Langfuse** | Traces, prompts, datasets and scores ([evaluation.md](evaluation.md)) |

D1 tables, defined with Drizzle in `src/db/schema.ts` with migrations in `apps/hoa/migrations`:

| Table | One row per | Notes |
| --- | --- | --- |
| `organizations` | HOA | `settings_json` holds `OrganizationSettings` |
| `governing_documents` | Uploaded version of a document, or a document the rules name that nobody uploaded | `UNIQUE(lineage_id, version)`. `key` is unique per HOA and `document_json` holds the rules schema's `GoverningDocument`, both set once a build or the sample seed keys the document. A referenced document (status `referenced`) has no file columns. `structure_json` holds how a build structures the upload; `removed_at` and `removed_by` are set when an administrator removes the document. The upload list shows only rows with a file that aren't removed |
| `provisions` | Provision of a keyed document | Primary key `(organization_id, key)`; `document_id`, `label`, `parent_key`, `kind` and `ordinal` for lookups and order; the whole `Provision` in `provision_json` |
| `jobs` | Workflow instance | `id` is the Workflow instance id; stage, counts, errors, and the step list in `progress_json` |
| `rulebooks` | Rulebook | `UNIQUE(organization_id, version)`; partial unique indexes allow one `building` and one `draft` per HOA. `settings_json` and `coverage_json` once the build saves the draft; `file_key` and `file_sha256` once it's published |
| `rulebook_rules` | Rule in a rulebook | Primary key `(rulebook_id, rule_key)`; `kind`, `request_types`, `applies_to` and `review_status` for filtering, `content_hash` for carrying approvals forward; the whole `Rule` in `rule_json` |
| `rulebook_terms` | Organization term, or proposed core term, in a rulebook | Primary key `(rulebook_id, term_key)`; `kind`, `review_status`, `content_hash`; the whole `Term` in `term_json` |
| `rulebook_questions` | Interpretation or conflict question | Primary key `(rulebook_id, id)`; `question_json` and `answer_json` |
| `project_types` | An organization's project type | `status` active or archived; `rulebook_id` it was built against; the `ProjectTypeDefinition` (fields and documents) in `definition_json`; `created_by`, the administrator who added it |
| `applications` | Application | `project_type_id` and the form's answers in `answers_json` |
| `application_files` | Uploaded or derived file | |
| `application_pages` | Page of an application file | `(file_id, page_index)` and the page's `kind` from classification |
| `reviews` | Review run | Recommendation, cost and session, and `rules_file_sha256`, the rules file it read; the full record is in R2 |

Legacy tables and columns awaiting removal ([implementation-plan.md](implementation-plan.md), task 9.6): the `sections`
and `rules` tables, `rulebooks.catalog_version`, and `applications.project_type` and `project_kind`.

Migrations only add tables and nullable columns, because every pull request preview shares one preview database: a
preview may run its branch's code against a schema another branch has already migrated. A migration that drops
something waits until `main` no longer reads it.

D1 has no interactive transactions. Changes that must land together (publishing a rulebook, saving a draft, starting a
job) are one `batch()` call, which D1 runs atomically.

## Records

The TypeScript shapes below are the domain types; repositories map them to the tables above. Rulebooks and rules are
defined in [schema.md](schema.md) and stored as [encoding.md](encoding.md#storage) describes; reviews in
[application-review.md](application-review.md).

```ts
type Organization = { id: string; name: string; slug: string; settings: OrganizationSettings }

type OrganizationSettings = {
  retentionDays: number // days after the committee's last decision; default 365
  draftRetentionDays: number // days after the last change to an application that was never submitted; default 30
  unitSystem: "imperial" | "metric" // the units forms offer for amounts; default imperial
}

type ErrorInfo = { stage: string; message: string; isRetryable: boolean }

type GoverningDocument = {
  id: string // one id per uploaded version; pages and citations use it
  lineageId: string // shared by every version of the same document
  version: number // 1, 2, 3 ... within the lineage
  organizationId: string
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

The row also carries what this type leaves out: `key` and `document_json` (the rules schema's document) once a build
keys it, `structure_json`, and `removed_at` and `removed_by`. Rows for referenced documents have status `referenced` and no file;
`listGoverningDocuments` returns only uploads that aren't removed. A removed document drops out of builds and the
documents list, while what already cites its pages still opens them.

Authority comes from `kind` and the organization's precedence clause (see [schema.md](schema.md#rank-and-conflicts)), not from a stored number. An upload
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

`getDocumentPage` returns one page of a governing document, with its text and printed label, for the viewer that shows
a citation.

Page markers are lines of the form `<<page 23 | label 17>>` (or `<<page 23>>` with no printed label) placed before each
page's text. A citation's quote lies on one page; a requirement that crosses a page break gets one citation per page.

### Applications

```ts
type Application = {
  id: string
  organizationId: string
  projectTypeId: string | null // the organization's project type; null for "Something else"
  answers: ProjectAnswers | null // the homeowner's answers to the project type's form
  description: string | null // typed by the homeowner; a fact source
  createdBy: string
  createdAt: string
  updatedAt: string
  revisedAt: string | null // when the homeowner last changed the description, answers or files
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
| `draft` | Started, not reviewed yet | Change the description, answers and files; run the review; delete it |
| `reviewing` | A review is running | Wait |
| `reviewed` | The latest review is ready | Change it and run the review again, or submit, even with open requests; delete it |
| `submitted` | With the committee | Nothing until the committee decides |
| `information-requested` | The committee asked for more | Change files, run the review again, resubmit |
| `decided` | Approved, approved in part or disapproved | Nothing; a new project is a new application |

A failed review doesn't change the status: the job holds the error, and the homeowner can run the review again.

The homeowner sees `draft` and `reviewed` alike as a draft, and the committee sees neither: an application reaches the
committee once it's submitted (`canSee`). A review covers the application while nothing changed after it
(`reviewCoversLatest`: `revisedAt` before the review's `createdAt`, since nothing changes while one runs); one that
doesn't can't be submitted.

`deleteAfter` is set to `updatedAt + draftRetentionDays` while the application has never been submitted, and to
`decidedAt + retentionDays` once the committee records any decision. It's cleared while the application is submitted
and reset when the homeowner resubmits.

```ts
type ApplicationFile = {
  id: string
  applicationId: string
  parentFileId: string | null // set for images extracted from a Word file
  ordinal: number | null // position of an extracted image in its Word file
  contextText: string | null // the paragraph before an extracted image, or the document an uploaded file is
  uploadedAs: string | null // what the homeowner said it is: one of the project type's documents, or "(other)"
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
  organizationId: string
  kind: "document-ingest" | "rulebook-build" | "application-review"
  subjectId: string // document, rulebook or application id
  status: "running" | "completed" | "completed-with-errors" | "failed" | "cancelled" // cancelled: an administrator stopped it
  stage: string | null // a stage id from ocr.md, encoding.md or application-review.md
  done: number // set from a count of finished items, never incremented
  total: number
  promptVersions: Record<string, PromptVersion> // resolved once when the job starts
  failures: { stage: string; itemId: string; message: string }[] // items that failed without failing the job
  error: ErrorInfo | null
  progress: JobProgress | null // every step the job works through, with counts and times (src/jobs/progress.ts)
  createdAt: string
  updatedAt: string
}
```

## Object layout

Keys are built from record ids. Each record stores its file's SHA-256. Page records, figures and descriptions are
written once each.

```text
hoas/{organizationId}/governing/{documentId}/source.{ext}
hoas/{organizationId}/governing/{documentId}/ocr/{engine}/{pageRange}.json        raw Layout response, one per analyzed range
hoas/{organizationId}/governing/{documentId}/pages/{pageIndex}.json               Page record
hoas/{organizationId}/governing/{documentId}/layout.json                          offset labels and repeated text, from ocr:labels
hoas/{organizationId}/governing/{documentId}/figures/{figureId}.png
hoas/{organizationId}/governing/{documentId}/figures/{figureId}.json              VisualDescription
hoas/{organizationId}/cache/{stage}/{key}.json                                    content cache for governing-document stages
hoas/{organizationId}/rulebooks/{rulebookId}/rules.json                           published rules file, canonical JSON; its SHA-256 is on the rulebook
hoas/{organizationId}/applications/{applicationId}/files/{fileId}/source.{ext}
hoas/{organizationId}/applications/{applicationId}/files/{fileId}/ocr/{engine}/{pageRange}.json
hoas/{organizationId}/applications/{applicationId}/files/{fileId}/pages/{pageIndex}.json
hoas/{organizationId}/applications/{applicationId}/files/{fileId}/figures/{figureId}.png
hoas/{organizationId}/applications/{applicationId}/files/{fileId}/figures/{figureId}.json
hoas/{organizationId}/applications/{applicationId}/cache/{stage}/{key}.json        content cache for this application's stages
hoas/{organizationId}/applications/{applicationId}/reviews/{reviewId}.json        full Review record
hoas/{organizationId}/project-types/{projectTypeId}/templates/{templateId}.{ext}  a document's template, named in the type's form
hoas/{organizationId}/jobs/{jobId}/{stage}/{itemId}.json                          per-job step outputs
```

A build or review step's output is keyed by its step name: the part before the first colon is the stage and the rest
the item, so `find-rules:{unitId}` is `find-rules/{unitId}.json`, and a step without an item, such as `merge`, is
`merge/result.json` (`jobStepKey` and `rulebookBuildKeys` in `src/storage/keys.ts`).

Duplicates are caught by hash instead of being cached:

- A governing document whose SHA-256 matches a document already in the HOA is marked failed with "already uploaded as
  {title}, version {n}"; the existing pages stand.
- A file uploaded twice to the same application is stored once. Application files and their cache are never shared
  across applications, so one packet's data can't outlive its own retention.

## Uploads

Pages choose and upload files with [UploadCN](https://uploadcn.dev) (`src/components/ui/upload.tsx`, added with the
shadcn CLI from the `@uploadcn` registry). `FileUpload` (`src/components/FileUpload`) is the app's one drop zone and
file list on it: it checks each file against the target's rules below and words every status and problem itself. Each
kind of file has an UploadCN adapter built by `serverUploadAdapter` (`src/storage/serverUpload.ts`) around the steps
below, so UploadCN runs the queue: progress, retries, cancelling and removing.

Browsers upload directly to R2 with presigned `PUT` URLs, so large files never pass through a Worker:

1. The page calls `createDocumentUpload` or `createApplicationUpload` with the file name, size and type (and for an
   application file, what it is). The server checks the type and size, creates the
   record with status `uploading`, and returns a presigned URL signed with `aws4fetch` against R2's S3 API. The URL
   expires after 15 minutes; the complete call then checks the stored object's size, since the URL can't bind it.
2. The browser `PUT`s the file. The bucket's CORS rule allows `PUT` with the `Content-Type` header from
   `http://localhost:3000`, the demo origin and the preview origin pattern.
3. The page calls `completeDocumentUpload` or `completeApplicationUpload`. The server checks the object exists with the
   expected size. For a governing document it starts DocumentIngest; application files wait for `runReview`.

A document's template (application-review.md, Project types) has no record of its own: `createTemplateUpload` names it
(a new id per file) and presigns its key, the browser `PUT`s it when the administrator saves the document, and the
template is kept in the type's form, whose save checks every new template is stored with its size. Without a token it
goes through `uploadTemplateFile`. Deleting the type deletes its templates.

**Without an R2 API token** (`R2_*` settings unset), the create call returns no URL and the page uploads through
`uploadDocumentFile` or `uploadApplicationFile`, which stream the file into R2, and OCR sends Layout the file inline (`base64Source`) instead of a
presigned URL. That works at demo sizes (the largest sample is 14 MB); with a token, uploads and OCR skip the Worker.

Accepted types: PDF and DOCX for every upload, and JPEG and PNG for application files. HEIF, TIFF, BMP, WebP and GIF are
refused with a message asking for JPEG or PNG, because the review model can't read them; where images aren't taken at
all, an image is refused with a message asking for a PDF. Limits: 50 MB and 300 pages per governing document (OCR reads PDFs in 50-page ranges, see
[ocr.md](ocr.md#flow); peak memory per range is measured on the 81-page CC&Rs), 25 MB per application PDF or Word file,
and 5 MB per image; a template is PDF or Word up to 10 MB. `src/storage/uploadRules.ts` holds these rules.

## Access

- Governing documents, their pages and the published rulebook are readable by every member of the HOA.
- Application files, their pages and reviews are readable only by the homeowner who created the application and, once
  it's submitted, by the HOA's administrators (the Administrator role). A draft is the homeowner's own.
- Files are never public. A server function checks access, then returns a presigned `GET` URL that expires after
  5 minutes, or the file inline where the environment has no R2 token (`getPacketImage`, for a packet's photos). A governing document's original file is served through the app instead, at
  `/files/governing/{documentId}`, which finds the document only in the requester's organization
  ([encoding.md, UX](encoding.md#ux)).

## Privacy and retention

The demo doesn't apply privacy controls to homeowner data beyond access and retention: model inputs and outputs,
including page text from application packets, reach Langfuse in full through the app's spans and OpenRouter Broadcast.

- **Retention.** Every application gets a `deleteAfter`; the sweep that acts on it isn't built. The design is a
  daily Cron Trigger that finds applications past `deleteAfter` and, for each one: deletes everything under
  `applications/{applicationId}/` except the review records, which it rewrites without evidence quotes or raw values;
  deletes `jobs/{jobId}/` and the Langfuse traces for every job whose subject is the application (listing them by
  session id through Langfuse's API, then deleting them); deletes the application's file and page rows; and clears
  `applications.description`. Azure keeps each analyze result for up to 24 hours after OCR, then deletes it.
- **Deleting a draft.** The homeowner can delete an application that was never submitted (`deleteApplicationDraft`):
  its row, its files', pages' and reviews' rows, its review jobs, and everything under `applications/{applicationId}/`
  and `jobs/{jobId}/`. Its Langfuse traces stay, as they do until the sweep above is built.
- **Model providers.** Every model call denies data collection, so OpenRouter never routes to providers that train on
  prompts ([ai.md](../ai.md)). That doesn't limit how long a provider retains requests.
- **Before real HOAs onboard:** application stages record summaries instead of content, and the hosted OpenRouter
  workspace uses Broadcast's privacy mode. Not needed for the demo.

## Demo assumptions

- **One HOA.** `seed/hoa.sql` creates one `Organization` row with default settings in each environment's database
  (`db:seed:local`, `db:seed:preview`, `db:seed:demo`); it's idempotent and runs once after the first migration.
- **Request context.** A `getRequestContext()` server helper returns `{ organization, user, role }`. The user comes from the
  Cloudflare Access identity when one is present, otherwise a fixed demo user per role. The role comes from a cookie
  written by the demo role switcher (`setDemoRole`).
- **Tenancy.** Repositories take `organizationId` as a required argument. Server functions pass it only from the request
  context, never from their input; Workflow steps pass it from the job row they were started with. Administrator-only server functions check the role.
