# Rule extraction

How an HOA's governing documents become a published rulebook. The pipeline replaces "send every PDF to the model in one
call", which can't cite reliably, can't scale past a context window, re-pays for every page on every run, and gives one
failure point for a multi-minute job.

## Stages

Documents are OCR'd when they're uploaded ([ocr.md](ocr.md)), so a build starts from page records. The build is the
`RulebookBuild` workflow; review and publishing are server functions ([platform.md](platform.md#workflows)). Stage ids
below are also the Workflow step names and the job's `stage` values.

| # | Stage id | Input | Output | Who does it |
| --- | --- | --- | --- | --- |
| 1 | `resolve-prompts` | Prompt labels | Prompt versions stored on the job | Code |
| 2 | `structure` | Page records of each `ready` document | Sections in D1, section text in R2 | Code first, model for messy scans |
| 3 | `route` | Sections | Project types and topics per section, or not relevant | Small model |
| 4 | `extract` | One relevant section plus context | `CandidateRule[]` | Model, one call per section |
| 5 | `verify` | Candidate rules | Citation matches and issues per candidate | Code |
| 6 | `consolidate` | All candidates for a project type | Merged rules, conflicts, exception links, rule keys | Model, then code |
| 7 | `save-draft` | Consolidated rules | Draft rulebook in D1 | Code |
| 8 | Review | Draft rulebook | Approved, edited and rejected rules | HOA administrator |
| 9 | Publish | Approved rules | Immutable rulebook version | Code, in a server function |

A build caches its model results ([platform.md](platform.md#caching)): rebuilding after one document changes re-runs
the model only for sections whose text changed.

One draft exists per HOA at a time. Starting a build while a draft exists replaces it, and approvals carry forward (see
[Review](#8-review)).

### 1. Resolve prompts

Each prompt's `production` label (or `LANGFUSE_PROMPT_LABEL`) is resolved to a version once, at the start, and stored on
the job. Later steps fetch prompts by name and version, so moving a label mid-build can't mix prompt versions in one
rulebook.

### 2. Structure

Rules are extracted and cited per **section**, not per page or per document. The outline comes from Layout's `sections`
and `sectionHeading` paragraphs. Code repairs numbering from the surrounding outline (a scanned "43" between 4.2 and 4.4
is 4.3). When a page's headings are still too noisy, a small model labels headings on that page only.

Each section records its kind (`body`, `definitions` or `exhibit`), its page range and offsets, and the sections it
refers to ("see Exhibit K"). Its text, with page markers, is written to R2 ([documents.md](documents.md#sections)).
Exhibits (drawings such as the fence styles in Exhibits K to N) become their own sections, with their figures' vision
descriptions.

### 3. Route

Most of a declaration has nothing to do with fences: assessments, voting, insurance. A cheap classification call per
section tags the project types and topics it covers. Only relevant sections go to extraction, which cuts cost and noise.
Routing tags are stored, so adding a project type later re-routes without re-reading the documents.

### 4. Extract

One call per relevant section, using the generic `hoa-section-rule-extraction` prompt. The call receives:

- the section's text, with page markers, and its number and heading;
- the document's definitions section and any sections or exhibits it references;
- the project-type catalog for the routed project types, with each attribute's unit and allowed enum values;
- the document's kind and authority rank.

The prompt asks for atomic rules, keeps qualifiers tied to their values (colors per manufacturer, as one keyed check),
converts units to the catalog's, records conditions and exceptions, and maps "shall", "shall not", "may", "should" and
"case by case" onto `obligation` and `discretion`. It returns a smaller shape than the stored rule; code adds everything
else:

```ts
type CandidateRule = Pick<
  Rule,
  | "title" | "statement" | "projectTypes" | "appliesTo" | "topic" | "obligation" | "discretion" | "isCurable"
  | "appliesWhen" | "check" | "exceptions"
> & {
  citations: { section: string; pageIndex: number; quote: string }[]
}
```

Sections run in parallel. A section that fails after its retries is recorded on the job (`failures`) and the build
continues; it ends as `completed-with-errors`, and the editor lists the failed sections with **Rebuild**, which re-runs
the build with every successful section answered from the cache.

### 5. Verify

Deterministic checks, run on every candidate and again whenever an administrator edits a rule:

- **Citation:** the quote is matched against the cited page's `normalizedText`. `exact` when it's a substring after
  normalizing; `fuzzy` when the best window's word similarity is at least 0.9 (tuned in phase 2); otherwise
  `not-found`, which adds a `citation-not-found` issue rather than dropping the rule. A match that overlaps a
  low-confidence span sets `touchesLowConfidence` and adds a `low-confidence` issue.
- **Catalog:** every attribute exists for the project type and scope, enum values are valid, and numbers fit the
  attribute's unit (`unknown-attribute`, `invalid-value`).
- **Sanity:** ranges have `min <= max`; numbers are plausible for the attribute; a rule has at least one citation
  (`sanity`).

Results are stored on the rule (`citations[].match`, `issues`) and sent to Langfuse as scores, so extraction quality is
measurable per build.

### 6. Consolidate

A per-project-type pass over all verified candidates. The model proposes, using the `hoa-rule-consolidation` prompt:

```ts
type ConsolidationResult = {
  duplicates: { keep: string; merge: string[] }[] // candidate ids
  conflicts: { candidateIds: string[]; description: string }[]
  exceptions: { exceptionId: string; modifiesId: string }[]
}
```

Code then applies it:

- merges duplicates (the same requirement in the guidelines and in the blank application form) and keeps every
  citation;
- applies authority ([rules.md](rules.md#authority-and-conflicts)): sections replaced by an amendment or a newer
  version are dropped, real conflicts get a `conflict` issue on each rule, and references to documents that weren't
  uploaded get an `unresolved-reference` issue;
- links exceptions through `modifies`;
- generates `id`s and `ruleKey`s ([rules.md](rules.md#rule-keys)) and sets `change` by comparing with the previous
  published version.

### 7. Save draft

One D1 batch writes the draft rulebook and its rules, replacing any existing draft.

### 8. Review

The administrator works in the rulebook editor: rules grouped by topic, each showing its citation (with the page text
one click away), its issues and, for a rebuild, what changed since the last published version. A rule whose citation is
`not-found` can't be approved until the administrator corrects the quote or the citation. Every edit re-runs Verify.
Administrators can add rules by hand (`provenance.source: "administrator"`); they need a citation like any other rule.

Approvals carry forward by `ruleKey` from the published version and from a replaced draft, for rules whose content
didn't change.

### 9. Publish

`publishRulebook` is blocked while any rule is pending or any `conflict` issue is unresolved (one of the conflicting
rules rejected, or the issue dismissed with a note). Publishing is one D1 batch that marks the draft `published` and the
previous version `superseded`. Homeowners' reviews use the latest published version.

## Prompts and models

| Prompt | Trace name | Model setting | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-section-structure` | `section-structure` | `OPENROUTER_SMALL_MODEL` | `pageText`, `outlineSoFar` | `{ headings: { text: string; number: string \| null; level: number }[] }` |
| `hoa-section-routing` | `section-routing` | `OPENROUTER_SMALL_MODEL` | `sectionText`, `heading`, `projectTypes`, `topics` | `{ projectTypes: string[]; topics: string[]; isRelevant: boolean }` |
| `hoa-section-rule-extraction` | `rule-extraction` | `OPENROUTER_MODEL` | `sectionText`, `heading`, `definitions`, `references`, `catalog`, `documentKind` | `{ rules: CandidateRule[] }` |
| `hoa-rule-consolidation` | `rule-consolidation` | `OPENROUTER_MODEL` | `projectType`, `candidates` (with ids) | `ConsolidationResult` |

Every prompt is generic and managed in Langfuse. Each call is traced with the job id as its session, so a whole build
reads as one session in Langfuse. Model settings are fallbacks; a prompt version's `config.model` takes precedence
([ai.md](../ai.md)).

The prototype's whole-document prompt, `hoa-rule-extraction`, and its fallback text are removed from
`src/ai/prompts.ts` when this pipeline ships, and the Langfuse prompt is archived. The new prompt has a new name so the
two contracts never share a label.

## Cost and scale

- Each file is OCR'd once, at upload; a re-upload of the same file is caught by its hash.
- Routing skips most declaration pages; extraction sees a few dozen sections per project type, not hundreds of pages.
- Model results are cached by content, so a rebuild pays only for sections whose text, prompt, model or catalog changed.
- A build is a background job. The editor shows its progress from the job row in units the pipeline knows: "Finding
  sections: 1 of 2 documents", "Extracting rules: 12 of 40 sections".
- Adding a project type reuses page text, structure and routing, and only runs extraction and consolidation for the new
  type.
