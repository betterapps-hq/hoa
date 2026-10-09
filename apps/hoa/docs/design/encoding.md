# Encoding governing documents

> **Built: the pipeline through save-draft and publishing (phase 4) and the rules UX (phase 5).** Replaces the first build's rulebook
> pipeline and rule model. The rules it produces follow [schema.md](schema.md). The tasks that build it are in
> [implementation-plan.md](implementation-plan.md).

How an organization's governing documents become a rulebook: a single rules file, validated by the Zod schema, that an
administrator reviews and publishes. The application review ([application-review.md](application-review.md)) reads the
published file.

The pipeline was proved by hand first: the sample Declaration (21 articles and Exhibit C) was encoded by parallel
agents working from the conventions below, then checked by code. That run produced 537 provisions, 559 terms and 307
rules with no checker problems. Every stage here replaces something those agents did with tools (reading files,
searching the vocabulary, running the type checker) with context code assembles and validators code runs.

## What changes from the first build

| First build | This pipeline |
| --- | --- |
| Sections split on headings, routed to the `fence` project type | Provisions parsed from the numbering, every one encoded or given a reason |
| One global, fence-only attribute catalog | Each organization's vocabulary, built first, from its own definitions |
| Candidate rules with free quotes, verified afterwards | Rule drafts that cite provision keys; quotes are always the provision's own text |
| Rule keys generated from check, subject and conditions | `{provision key}#{aspect}` |
| Consolidation over full candidates per project type | Consolidation over one-line summaries of every rule, across the whole rulebook |
| Rulebook versions, edited and republished | A rulebook is one generated rules file; changed documents mean a new build |

## Stages

`RulebookBuild` stays the workflow and `rulebook-build` the job kind. Each stage id is the job's `stage` while it runs,
and every Workflow step name starts with it.

| # | Stage id | Steps | Output | Who does it |
| --- | --- | --- | --- | --- |
| 1 | `resolve-prompts` | `resolve-prompts` | Prompt versions on the job | Code |
| 2 | `structure` | `structure:{documentId}` | Provisions with keys, labels, intro, text, wrap-up and page anchors | Code; a model only for documents the parser can't number |
| 3 | `analyze` | `analyze:{documentId}` | Cross-references and named documents | Code |
| 4 | `vocabulary` | `vocabulary:{documentId}` | The organization's terms from definitions and defined-term usage | Model, one call per document with definitions |
| 5 | `plan` | `plan` | Encoding units: provision subtrees within a token budget, with their context | Code |
| 6 | `encode` | `encode:{unitId}` | An encoding draft per unit | Model, one call per unit, in parallel |
| 7 | `verify` | `audit:{unitId}`, `verify`, `verify:merged` | The audit's values per provision; Zod, checker and audit problems per draft, then per unit in the merged set | Small model (the audit), then code |
| 8 | `repair` | `repair:{unitId}:{round}` | Corrected drafts, at most two rounds | Model, only for units with problems |
| 9 | `merge` | `merge` | One vocabulary, one rule set, settings, questions, coverage | Code |
| 10 | `consolidate` | `consolidate` | Duplicates, cross-unit overrides, conflicts and questions | Model over summaries, then code |
| 11 | `save-draft` | `save-draft`, `save-draft:scores`, `save-draft:finish`, then `follow-up:ids`, `follow-up` | The draft rulebook in D1, with carried-forward review decisions; the build's scores in Langfuse; a further build when the documents changed while this one ran | Code |
| 12 | Review | | Approved, edited and rejected records | Administrator |
| 13 | Publish | | The rules file in R2, with its hash | Code, in a server function |

Model results are cached per organization as today (`hoas/{hoaId}/cache/{stage}/{hash}.json`), so rebuilding after one
document changes only pays for units whose text or context changed.

The stages are one module, `buildRulebook` ([src/encoding/build.ts](../../src/encoding/build.ts)), with its step runner,
models, cache, page records and previous rulebook injected: the `RulebookBuild` Workflow runs each stage step as a
Workflow step whose output goes to R2, and `pnpm eval:encoding` runs the same module in process.

### 1. Resolve prompts

As today: pin every prompt the build uses (`hoa-term-extraction`, `hoa-provision-encoding`, `hoa-encoding-repair`,
`hoa-rulebook-consolidation`, `hoa-structure-repair`, and `hoa-provision-audit` once built) on the job.

### 2. Structure

Page records are already stored by ingest ([ocr.md](ocr.md)). Structure turns one document's pages into provisions
([schema.md, Sources](schema.md#1-sources)), deterministically where it can.

1. **Clean.** Drop the paragraphs Azure Layout tags `pageHeader`, `pageFooter` and `pageNumber`, then any line that
   repeats, after normalizing digits, on at least 30 percent of pages (recording stamps like
   "325743 3 [11/29/01 4 22 PM]", "ClibPDF - www.fastio.com"), which scans often leave untagged. Join
   hyphenated line breaks. Keep a map from cleaned offsets back to page offsets for anchors.
2. **Number.** A numbering grammar recognizes `ARTICLE 4` / `Article IV`, `4.3`, `Section 4.3`, `(a)`, `(i)`,
   `(A)`, `(1)`, and exhibits. The parser keeps a stack of levels and accepts a marker only when it continues a
   sequence (`(b)` after `(a)`, `(ii)` after `(i)`; `(i)` after `(h)` is a letter, not a numeral, when the sibling run
   is letters). A marker that breaks every open sequence is text. Implausible numbers ("5.42" between 5.4.1 and 5.4.3)
   are repaired and marked `inferred`.
3. **Split.** Text between markers belongs to the open provision. Unnumbered paragraphs inside a numbered provision
   become counted paragraphs (`/p2`). A paragraph ending in a colon directly before its children is the parent's
   `intro`; text after the last child that continues the parent is its `wrapUp`.
4. **Key.** `{document key}:{label}`, with labels per the schema's convention. Exhibit C of the sample is its own
   document (`use-restrictions`) when the administrator marks it as one at upload; otherwise it's an `exhibit`. An
   upload's structure (its key, kind, the names its text uses for itself, and its exhibits that are documents of their
   own) is stored in `governing_documents.structure_json`; without one, the upload's kind gives a default key.
5. **Check.** Coverage of the cleaned text (every character belongs to exactly one provision), monotonic sequences,
   and unique keys. A document with more than 2 percent of its text outside any numbered provision, or broken
   sequences, goes to `hoa-structure-repair`, which proposes the outline (markers and their offsets) for the parser to
   apply: a paragraph starts at each proposed marker and the text is parsed again, keeping whichever structure checks
   better. The model never rewrites text.

Each provision stores its `anchors` (file, page, start, end) so the document viewer can highlight it.

### 3. References and analysis

A reference grammar finds "Section 7.4(a)", "Article 4", "subsection (b) above", "Exhibit C", "this Declaration",
"the By-Laws", "the Design Guidelines" and resolves each against the provision index (relative references resolve from
the citing provision's position). Unresolved document names become **referenced documents** (`edition: null`) so rules
can enforce them by key and coverage can list them. References feed each encoding unit's context.

The values each provision states (numbers, durations, parties, conditions) aren't extracted here: the audit in
[Verify](#7-verify) reads them with a model and code checks them ([Recognition](#recognition)).

### 4. Vocabulary

One call per document that has a definitions article or section, using `hoa-term-extraction`. Code prepares:

- the definitions provisions' text;
- **candidates**: defined-term usage found by code: quoted and capitalized definitions (`"Unit" means`), capitalized
  multi-word phrases used at least three times outside sentence starts ("Common Area", "Class \"B\" Control Period"),
  with counts and three sample sentences each;
- the core terms (keys, kinds, labels), so the model refines a core term (`lot` labeled "Unit") instead of duplicating
  it.

It returns term drafts (`EncodedTerm`: things, properties, values, categories, units) with labels from the document's
wording and the provisions that define them. Code merges terms across documents by key. The output is the shared
vocabulary every encoding unit starts from; units add terms of their own.

### 5. Plan

Code divides each document into **encoding units**: a provision and its descendants, sized to at most about 6,000
tokens of provision text. An article that fits is one unit; a larger one splits by section, and a large section by its
items. Every unit gets:

- its provisions (key, label, heading, intro, text, wrap-up, children);
- the intros and wrap-ups of its ancestors, and the headings above it;
- the text of every provision it references (step 3), truncated to 1,500 tokens each;
- the **vocabulary slice**: every term whose labels appear in the unit's text or references (matched on normalized
  labels and plurals, then fuzzily for OCR noise, see [Recognition](#recognition)), every property of those things, and
  the core terms;
- the request types (core request things with their flow);
- the keys of rules already proposed for provisions it references, when they're known from the previous rulebook.

### 6. Encode

One call per unit, in parallel, with `hoa-provision-encoding`. The prompt's static text, kept in Langfuse, is the
encoding conventions (the brief the hand-run used: keys, labels, modality, approval versus discretion, requirements,
selectors, recurring duties, party-valued properties, remedies, sanctions, the no-rule reasons) and the schema's rules
sections. It's identical for every unit, so provider prompt caching covers it.

The answer is an `EncodingDraft`, validated by Zod through the `respond` tool:

```ts
type EncodingDraft = {
  provisions: { key: ProvisionKey; noRule: { reason: NoRuleReason; note: string | null } | null }[] // every provision in the unit
  terms: EncodedTerm[] // new organization terms and refinements of core terms
  rules: RuleDraft[] // schema.zod.ts ruleDraft
  questions: { kind: "interpretation" | "conflict"; question: string; citations: Citation[]; about: {...}; options: {...}[] }[]
  clauses: Partial<Settings["clauses"]> // precedence, time, liability, cure, sanctionPreconditions found here
  referencedDocuments: { key: string; kind: DocumentKind; title: string }[]
  notes: string[] // judgment calls, and "SCHEMA GAP:" notes
}
```

The model doesn't return provision text: it returns keys, and code attaches the stored text. So a citation's quote is
always the provision itself.

### 7. Verify

Code, run on every draft and again whenever an administrator edits a record:

- **Zod** on the draft schema (`ruleDraft`, the term and question schemas).
- **References:** every term key resolves (the vocabulary, the unit's new terms, core); every rule key in `overrides`,
  `enforces`, `limits` and `except` resolves; every provision key cited exists; every document key resolves.
- **Invariants** from [schema.md, Invariants](schema.md#invariants): keys start with the main citation, modality and
  check agree, remedies exactly where required, sanctions enforce obligations or prohibitions in a shared request
  type, parties where parties are required, approval checks and `approved` conditions name parties, `recurs` only with
  `compliance-period`, clause `except` lists name sanctions.
- **Coverage:** every provision in the unit has a rule, a term or clause citing it, or a no-rule reason; a cited
  provision with a no-rule reason is a problem.
- **Audit:** every number, duration, party and condition the audit read from a provision appears in a record citing it,
  or the provision's no-rule note explains it (`unencoded-value`, `unencoded-party`, `unencoded-condition`;
  [Recognition](#recognition)).
- **Typing:** path steps are properties of the thing before them; comparisons and arithmetic follow the typing rules;
  values belong to their sets.

These are the checks in the hand-run's `check-ccrs.ts`, moved into the app as `validateRulebook` (one function used by
the build, the editor and the tests).

### 8. Repair

A unit with problems goes back to the model with `hoa-encoding-repair`: the draft, the problem list (each with its
path in the draft), and the vocabulary slice. The model returns the whole corrected draft. Two rounds at most; a
problem left after that becomes an issue on the record it belongs to, which blocks approval until an administrator
fixes it. A unit whose problems are only unresolved references to terms or rules another unit defines is re-verified
after [merge](#9-merge) before it's repaired. Round 1 repairs what each draft shows alone; round 2 repairs what the
merged set shows (`verify:merged`) and drafts still failing Zod. A draft that still fails Zod is left out and recorded
as a failure on the job.

Code, not the model, sets each rule's `effectiveFrom` (from its main citation's document edition) and each term's
`organizationId`: those fields are left out of the schema the model sees.

### 9. Merge

Code combines every unit's draft, as the hand-run's `build-rules-file.ts` did:

- **Terms** by key. The same key with the same kind merges labels and citations; different kinds, or two definitions,
  become a `conflict` issue on both. Near-duplicate terms (labels that match fuzzily, with the same kind) are listed for
  consolidation.
- **Rules** by key; a duplicate key gets `-2` (an aspect allows no other suffix) and a `conflict` issue.
- **Clauses:** liability entries and precedence citations concatenate; other clauses must agree or raise a conflict.
- **Referenced documents** by key.
- **Coverage report:** provisions without a rule, term, clause or reason.

Then the whole set is verified again, so cross-unit references are checked.

### 10. Consolidate

One call with `hoa-rulebook-consolidation`, over **summaries**, not full rules: each rule's key, kind, modality,
statement, request types, subject and main citation; each near-duplicate term pair; the documents and their kinds. That
stays well under a context window even for the sample's 307 rules (about 25,000 tokens). It returns:

```ts
type Consolidation = {
  duplicates: { keep: RuleKey; drop: RuleKey[] }[] // the same requirement stated twice
  overrides: { rule: RuleKey; overrides: RuleKey[] }[] // exceptions stated in another unit
  conflicts: { rules: RuleKey[]; description: string }[] // become conflict questions
  termMerges: { keep: TermKey; merge: TermKey[] }[]
}
```

Code applies it: merges duplicates (keeping every citation), adds overrides, validates them against precedence
(`override-not-allowed`), merges terms (rewriting every reference) and turns conflicts into questions. Then it verifies
again.

### 11. Save draft

**When a build runs.** Uploading builds the rulebook: when `DocumentIngest` leaves a document `ready` (not a duplicate
or a failure), it requests a build (`requestRulebookBuild`, `src/workflows/rulebookTrigger.server.ts`). A build reads
the **current documents** (`currentDocumentIds`, `src/rulebook/currentDocuments.ts`): for each upload lineage, its
highest version that is `ready`; an amendment is a lineage of its own. Requests coalesce. Nothing starts while an
upload is still `processing` (the last one to finish requests the build, so several uploads in a row make one build),
while a rulebook is `building`, or when no document is ready; the partial unique index settles two requests racing.
When a build ends, finished or failed, its `follow-up` step requests another if the current documents differ from the
ones it read; an unchanged set starts nothing, so a failed build isn't retried in a loop. The administrator's manual
build (`startRulebookBuild`, the "try again") makes the same request without waiting for a change. A request's ids come from a
Workflow step of their own, so a retried step reuses them: it finds the rulebook it inserted and creates the missing
workflow instance, and a request whose workflow never starts fails its rulebook rather than leave it `building`. The
build reads its documents in order of their keys, so a new version of one document doesn't reorder the others (term
merging and rule key collisions follow document order, and with them the encoding units' cached context).

The draft rulebook is written to D1 ([Storage](#storage)) and replaces the previous draft. **Carry forward**
(`src/rulebook/carryForward.ts`): for each record, the first earlier rulebook holding one with the same key and content
hash decides its review, approved, rejected or still proposed, with the resolutions of the issues it had then. The
current draft decides first, then the published rulebook, so a rebuild keeps the review work on the draft and only asks
about what changed. Rejected records stay in the draft with their status, so rejecting a record is how it's dropped,
and stays dropped. The same goes for the settings (whose decision policy, which only the administrator sets, always
carries), for a question asked again in the same words (its answer), and for a provision's no-rule reason: a reason
the build gives again for the same wording keeps its review, and a reason someone gave a provision the build leaves
uncovered comes back. Edits don't carry: a rule, term or clause an administrator edited comes back as the build
encodes it, proposed. The job reports counts: provisions, terms, rules by kind, uncovered provisions, issues.

### 12. Review and 13. Publish

The administrator works in [the rules UX](#ux). The draft view lists what it changes against the published rulebook
(`src/rulebook/changes.ts`): records added, changed (the same key with another content hash) and removed (published,
not rejected, and missing from the draft), whether the settings changed, and the uploads it reads that the published
rulebook didn't, and the reverse. Nothing is deleted from a draft: Reject replaces deletion. The whole draft can be
discarded (`discardRulebookDraft`), which deletes it and its records and leaves the published rulebook as it is.

Publishing requires every record approved or rejected, every no-rule reason approved, no blocking issue, no uncovered
provision, and approved records that make a valid rules file. Code assembles the rules file from the approved records
(schema.md, Rules file), validates it with `rulesFile`, writes it to R2, stores its SHA-256 on the rulebook and marks
the previous published rulebook `superseded`.

## Storage

Nothing is released, so the old rule tables and objects are dropped rather than migrated; the build is re-run.

**D1** (Drizzle, new migration):

| Table | Holds | Key columns |
| --- | --- | --- |
| `governing_documents` | Uploaded documents, as today, and referenced ones | `key` (unique per organization) and `document_json` (the schema's `GoverningDocument`); `status` `referenced`, with no file columns, for named, not uploaded; `lineage_id`, `version`, `amends` dropped at cutover |
| `provisions` | One row per provision | `document_id`, `key` (unique per organization), `label`, `parent_key`, `kind`, `ordinal`, `provision_json` (the schema's `Provision`) |
| `rulebooks` | One per build, as today | `status` building, draft, published, superseded, failed; add `settings_json`, `file_key`, `file_sha256`, `coverage_json`; `catalog_version` dropped at cutover |
| `rulebook_rules` | Draft and published rule records | `rulebook_id`, `rule_key`, `kind`, `request_types` (JSON, for filtering), `applies_to`, `review_status`, `content_hash`, `rule_json` (the schema's `Rule`) |
| `rulebook_terms` | The organization's terms and proposed core terms per rulebook | `rulebook_id`, `term_key`, `kind`, `review_status`, `content_hash`, `term_json` |
| `rulebook_questions` | Interpretation and conflict questions | `rulebook_id`, `id`, `question_json`, `answer_json` |

The partial unique indexes (one `building`, one `draft` rulebook per organization) stay.

**R2:**

| Key | Contents |
| --- | --- |
| `hoas/{hoaId}/governing/{documentId}/…` | As today: source, OCR, pages, layout, figures |
| `hoas/{hoaId}/rulebooks/{rulebookId}/rules.json` | The published rules file, immutable |
| `hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json` | Every build step's output, by step name: `structure/{documentId}`, `encode/{unitId}`, `repair/{unitId}:{round}`, and `{stage}/result` for steps without an item (`plan`, `merge`, `consolidate`) |
| `hoas/{hoaId}/cache/{stage}/{hash}.json` | Model results, as today |

A review records the rulebook id and the file's SHA-256, so it can always be reproduced against the exact file.

## UX

One page, `/rules` ("Rulebook" in the sidebar, for every role), holds the rulebook and the governing documents it's
built from; `/documents` redirects to it. The page is quiet: one sentence about what's happening or next, at most one
primary action, few counters, plain headings, and details behind a sheet, a disclosure or a secondary tab. Nothing on
it names a document, organization, project type or term from a sample; lists are paged (25 to a page), so an
organization with 2 documents or 20, 50 rules or 2,000, sees the same page.

**In force (an administrator's default view).** Three parts, top to bottom:

- **Status:** shown only when there's something to say, most pressing first (`rulebookStatus`): a build is running
  (with `JobProgress`); a document is being read; a draft is ready ("A new draft of the rulebook is ready to review.
  It was built after the Design Guidelines changed. It adds 5 rules, changes 12 rules and removes 2 rules." and
  **Review changes**); the last build failed (**Try again**); the documents differ from the published rulebook's and
  there's no draft (**Build a draft**); nothing is built yet (**Build the rulebook**).
- **Governing documents:** each document's current version (kind, version, pages, date) with its earlier versions
  behind a disclosure, and quiet actions: **Read** (the document viewer, page by page), **Download** (the original
  file), and **New version** (a new edition that replaces it, or an amendment that changes part of it). **Upload** adds
  a document. Uploading builds the rulebook on its own once the file is read ([Save draft](#11-save-draft)); there's
  no separate build step.
- **Rules in force:** the published version and date, the rules file to download, and the rulebook's records
  read-only in quiet tabs (Rules, Terms, Coverage, Questions when there are any, Settings).

**Reviewing a draft** is a focused mode (`/rules?review=draft`; with nothing published, it's what the page shows). It
leads with the way back to the rules in force, what the draft changes against them, and **Discard draft**, whose
confirmation says how many review decisions are lost and that the published version stays in force. Then the next step
as one sentence with one action, from the draft's to-do list in the order the work goes (`draftTodos`): terms to
review (a rule waits for the terms it reads), questions to answer, rules to review, the settings, reasons for having no
rule, provisions with no rule and no reason, and approved rules with open problems. The rest of the list follows as
links, each opening its tab with the matching filter. With nothing left, the sentence says so and the action is
**Publish**, after a confirmation; anything the server still finds (`publishBlockers`, such as problems in the rules
file) is listed instead. Below are the tabs: **Changes** (new, changed and removed rules and terms, each changed one
beside what it said before, each with its review; unchanged records keep their review and aren't listed), then Rules,
Terms, Coverage, Questions and Settings.

**Reviewing a record.** Approve is the primary action; Reject and Edit are quieter. A decided record says so in words
("Approved", "Rejected") with **Undo**, never as a faded button. Rejecting is how a record is dropped: it stays in the
draft with its status, stops counting as coverage, and a rebuild carries the decision forward; nothing is deleted. Rows
in the rules, terms and changes lists carry the same controls in a compact form; a row something blocks says it can't
be approved yet, and its card says why. Rules, terms and the settings share `ReviewControls`.

- **Rules:** a search box, with the other filters (review status, kind, area, request type) behind **Filters**; the
  domain is a filter, not a column. Each row has the title, which opens the rule's card, its main citation and its
  statement in words. "Approve the N rules shown" approves what a filter shows, skipping (and saying why) any record
  something blocks; Terms and Coverage have the same.
- **Rule card** (a side sheet): the review, the statement, its sources (the main citation's text, the others as
  links), its problems when it has any, and two disclosures: "What it says, in detail" (the schema's words from
  `describeRule`, kind, applicability, request types, bearer, remedy, cure, related rules, area and key) and "Try it
  against facts" (the engine's preview). Editing is the form (title, statement, modality, bearer, remedy, request
  types, and the structured check and condition editors with their JSON fallback). There's no whole-rule JSON editor
  and no delete.
- **Terms:** each term with its kind, definition and the rules that use it.
- **Questions:** each question with its citations and readings; Answer becomes the primary action once a reading is
  chosen.
- **Settings:** the review, then each clause in words with its citations (edited as JSON), and the policy.
- **Coverage:** one share for the documents the build read from their pages ("97.7% of the text of 2 documents is
  covered by a rule, a term, a setting or a reason for having no rule"), one bar and a small legend. A document whose
  provisions aren't linked to any upload's pages says it's not built yet instead of showing a share. Two views:
  - **On the pages:** the document in the document viewer, every passage highlighted by what covers it (a tint per
    kind, plus an underline or stripes for the gaps, so color isn't the only cue). Clicking a passage, or choosing it
    from the list beside the page ("On page N", then the gaps), shows what covers or cites it: rules, terms, settings
    clauses, questions, its no-rule reason, the values its rules encode, and the provisions that refer to it. The panel
    sits beside the page on wide screens and in a sheet on narrow ones; choosing from the list moves focus to it.
  - **As a list:** every provision with what cites it or its reason, uncovered ones first, searchable, and filtered to
    the uncovered ones or the reasons to review.

  In either view an uncovered provision can be given a reason for having no rule. Coverage is computed in
  `src/rulebook/coverage.ts`, and the text outside provisions by `getSourceText`.

**Citations open the document.** Every citation (`ProvisionReference` and `RuleReference`, so the application review's
too) shows the provision's text on hover and focus, and opens `CitationViewer`: a side sheet, full width on a phone,
with the governing document at the cited page and the provision highlighted from its anchors. A provision that spans
pages lists them; a rule's "and N more" opens the same viewer with a picker over all its citations. The viewer's header
has **Open the original** (the uploaded file at that page, in a new tab) and **Download**. Without the document's pages
it shows the provision as stored.

The viewer shows the page text read at upload (`getDocumentPage`), rendered from its Markdown, with highlights placed
by character range. That's what the stored data supports exactly: page records hold the text the anchors index, and no
page images are stored. The raw Layout responses keep word polygons, so the real page with highlight boxes is possible
later by rendering the PDF; a PDF renderer would be a new library, which needs a discussion first. Until then, **Open
the original** shows the real page.

**Files.** `/files/governing/{documentId}` serves an upload's original file from R2 with its media type and original
name (`?download` saves it). It looks the document up in the requester's organization only, so one organization can
never fetch another's file. Every member may read the governing documents ([documents.md](documents.md#access)).

**Members** (homeowners) see the same page read-only, with only the published rulebook, never a draft: a plain
introduction, the rules (Rules and Terms tabs; a rule's card has its statement, sources and details, without the
preview or keys), and the governing documents to read or download. There's no build, review, upload or coverage. The
draft and every review action are checked on the server (`requireAdministrator`), not only hidden.

## Prompts and models

| Prompt | Trace name | Model | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-structure-repair` | `structure-repair` | `OPENROUTER_MODEL` | `documentTitle`, `pageText`, `parserOutline`, `problems` | `{ markers: { offset: number; marker: string; level: number }[] }` |
| `hoa-term-extraction` | `term-extraction` | `anthropic/claude-opus-5.5`, high effort | `document`, `definitions`, `candidates`, `coreTerms` | `{ terms: EncodedTerm[]; notes: string[] }` |
| `hoa-provision-encoding` | `provision-encoding` | `anthropic/claude-opus-5.5`, high effort | `document`, `provisions`, `context`, `references`, `terms`, `coreTerms`, `requestTypes` | `EncodingDraft` |
| `hoa-encoding-repair` | `encoding-repair` | `anthropic/claude-opus-5.5`, high effort | `draft`, `problems`, `terms`, `coreTerms` | `EncodingDraft` |
| `hoa-rulebook-consolidation` | `rulebook-consolidation` | `anthropic/claude-opus-5.5`, high effort | `rules`, `termPairs`, `documents` | `Consolidation` |
| `hoa-provision-audit` (not built) | `provision-audit` | `anthropic/claude-haiku-5.5` (`config.model`) | `document`, `provisions` | `{ items: { provisionKey, kind: "number" \| "duration" \| "party" \| "condition", quote, value }[] }` |

`hoa-rules-encoding-guide` holds the encoding conventions and the schema's rules in one text with no variables; the
encoding, repair and term prompts include it by pinned version (Langfuse prompt composition), so it's written once.
The statement link syntax is described on the output schema's `statement` field, because Langfuse would read double
braces in prompt text as variables.

The old `hoa-section-routing`, `hoa-section-rule-extraction` and `hoa-rule-consolidation` are retired with the code
that calls them.

**Output size.** `RuleDraft`'s JSON Schema is recursive (conditions and operands) and large. `runObjectPrompt` sends it
through the `respond` tool with `reused: "inline"`, which can't inline a cycle. The first task of the build is to
measure it against the model ([implementation-plan.md](implementation-plan.md), phase 0); if a provider rejects it,
recursive definitions go out as `$defs` references, and if that's rejected too, the schema is described in the prompt
text and the answer validated by Zod alone (the `answerOf` JSON fallback).

## Recognition

The encoding reads values the way the review does ([application-review.md, Recognition](application-review.md#recognition)):
**the model proposes, code verifies, corrections become data.** Hand-written recognizers (LexNLP, Recognizers-Text,
grammars of our own as the primary reader) don't scale to a thousand document styles, so no stage depends on one. The
text-analysis service (spaCy, LexNLP, dateparser, embeddings) isn't built; everything here is TypeScript plus model
calls.

| Job | Technique |
| --- | --- |
| Running heads, footers, page stamps | Azure Layout's paragraph roles, then repeated-line detection (code) |
| Provision numbering | The parser's numbering grammar as the fast path; for a document it can't number, a model's outline that code applies and keeps only when its check is better ([Structure](#2-structure)) |
| Cross-references | A reference grammar, resolved against the provision index (code) |
| Label matching: vocabulary slices, value terms, document names, near-duplicate terms | Normalized exact match, then edit-distance similarity (ratio, token-set and partial ratios) with per-length thresholds (`src/text/match.ts`) |
| Defined terms | Quoted and capitalized definitions and capitalized phrases found by code, as vocabulary candidates; the model writes the terms |
| Similar rules for consolidation | Statement similarity (code), confirmed by the model |
| The values provisions state | The audit (below): a small model proposes with quotes, code verifies |

A fuzzy match is recorded as fuzzy, with its score, and never silently treated as exact; no label under four
characters is matched fuzzily. When nothing matches, the model decides, with the candidates listed.

**The audit.** One call per encoding unit (`audit:{unitId}`, `hoa-provision-audit` on Haiku through `config.model`,
never Opus), independent of the encoding: it lists, per provision, every number (amounts, money, percentages, counts,
fractions), duration, party and condition (including exceptions: "unless", "except", "provided that", "subject to")
the text states, each with its exact quote and its value in schema terms (an exact number or fraction with a unit term
key; a party's wording and the party term it names; a condition's words). Code checks the audit before using it,
generically, as the review's verifier does: each quote is in its provision's text, every numeral in a number's or
duration's quote agrees with its value after unit conversion, and the unit is a vocabulary unit. Then it checks each
item against the encoded records citing that provision, so a dropped number or party goes to repair instead of to the
administrator:

1. **Numbers and durations** appear as a constant, an offset or a fraction in a rule, term or clause citing the
   provision, equal after unit conversion with exact arithmetic, or the provision's no-rule note explains them; else
   `unencoded-value`. This catches the commonest silent error: "within thirty (30) days" dropped from a deadline.
2. **Parties** appear as a bearer, approver, signer, subject or party value of a record citing the provision; else
   `unencoded-party`.
3. **Conditions** appear as an `appliesWhen`, condition, exception (an overriding rule) or text condition on a record
   citing the provision; else `unencoded-condition`, a warning sent to repair once with its quote.

An audit item that fails its own check (a quote not in the provision, a numeral that disagrees) is dropped and recorded,
not raised. These checks replace the planned text-analysis cross-checks (quantity coverage and modality cues from
LexNLP and spaCy); modality is measured by evaluation round 1's modality agreement and gets a check only if its
failures call for one.

**Corrections become data.** Every audit item code rejects, every problem the audit raises, and how repair or the
administrator resolved it (encoded, explained in a no-rule note, or dismissed as the audit's error) is recorded on the
build, so it can become an item of the `provision-encoding` dataset, as the review's corrections become `entity-facts`
items.
## Quality

- **Gold encodings.** The hand-run encoding of the sample Declaration, once an administrator has reviewed it, is the
  first gold set, one item per encoding unit. It's committed at `apps/hoa/samples/declaration/` and loaded into the
  Langfuse dataset `provision-encoding` from there.
- **Scores per build**, sent to Langfuse on the build's trace: Zod-valid units, checker problems before and after
  repair, coverage, rules per kind, requirement and approval counts, text conditions, `SCHEMA GAP` notes.
- **Experiment scores against gold:** rule recall and precision by provision (an LLM judge decides whether two rules
  state the same requirement), modality agreement, check agreement on test cases (both rules evaluated on generated
  facts by the engine: the strongest signal, since it compares meaning, not wording), and term recall.
- **Self-consistency, later:** encoding a unit twice and diffing the rule sets by provision flags units where the model
  is unsure; those go to the administrator first.

## Cost and scale

The sample Declaration is about 110 pages and 4,200 lines of text. It plans to roughly 60 units. Each encoding call
reads about 18,000 tokens of static prompt (cached after the first call), 4,000 to 10,000 tokens of unit context, and
writes 3,000 to 12,000 tokens. Repairs run on the units with problems, about a fifth of them in the hand-run.
Consolidation is one call of about 30,000 tokens. The build caps concurrency at 8 encoding calls.
