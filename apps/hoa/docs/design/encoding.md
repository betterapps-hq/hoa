# Encoding governing documents

> **Built: the pipeline through save-draft and publishing, and the rules UX.** The rules it produces follow
> [schema.md](schema.md). The tasks that build it are in [implementation-plan.md](implementation-plan.md). The build runs
> the reordered step pipeline (`src/encoding/steps/`, [implementation-plan.md, R.7
> design](implementation-plan.md#r7-design-the-steps-in-the-build)); each step is measured alone
> ([evaluation.md, Encoding step datasets](evaluation.md#encoding-step-datasets)).

How an organization's governing documents become a rulebook: a single rules file, validated by the Zod schema, that an
administrator reviews and publishes. The application review ([application-review.md](application-review.md)) reads the
published file.

The pipeline was proved by hand first: the sample Declaration (21 articles and Exhibit C) was encoded by parallel
agents working from the conventions below, then checked by code. That run produced 537 provisions, 559 terms and 307
rules with no checker problems. Every stage here replaces something those agents did with tools (reading files,
searching the vocabulary, running the type checker) with context code assembles and validators code runs.

## Stages

`RulebookBuild` stays the workflow and `rulebook-build` the job kind. Each stage id is the job's `stage` while it runs,
and every Workflow step name starts with it.

| # | Stage id | Steps | Output | Who does it |
| --- | --- | --- | --- | --- |
| 1 | `resolve-prompts` | `resolve-prompts` | Prompt versions on the job | Code |
| 1b | `check` | `check` | Problems with the uploads' own records, which stop the build before any model call | Code |
| 2 | `structure` | `structure:{documentId}` | Provisions with keys, labels, intro, text, wrap-up and page anchors | Code; a model only for documents the parser can't number |
| 3 | `analyze` | `analyze:{documentId}` | Cross-references and named documents | Code |
| 4 | `defined-terms` | `defined-terms:{documentKey}` | The terms each document defines (B), merged across documents by key | Model, one call per document with definitions or candidates, rerun once with its problems |
| 5 | `plan` | `plan` | Sections: provision subtrees, small neighbours packed, within a token budget, with their context | Code |
| 6 | `find-rules` | `find-rules:{unitId}`, `find-rules:check`, `find-rules:{unitId}:rerun`, `find-rules:resolve` | Rule outlines per section (E), checked across sections, their targets resolved; no-rule reasons, settings flags, interpretation questions, named documents | Model, one call per section, in parallel; one rerun of each failing section |
| 7 | `vocabulary` | `vocabulary:{groupId}`, `vocabulary:check`, `vocabulary:{groupId}:rerun` | The terms each group of sections' outlines read (C), with the outlines each serves | Model, one call per group, in parallel; one rerun of each failing group |
| 7b | `vocabulary-merge` | `vocabulary-merge` (skipped with no clusters) | Near-duplicates merged and collisions renamed (C-merge); the vocabulary frozen | Model, one call, then code |
| 8 | `structure-rules` | `structure-rules:{batchId}`, `structure-rules:check:{round}`, `structure-rules:{batchId}:retry-{round}` | Each outline's structure (F), merged with its outline into a rule draft; up to two retry rounds of the rules the validator faults | Model, one call per batch, in parallel |
| 9 | `merge` | `merge` | One vocabulary, one rule set, settings, questions, coverage | Code |
| 10 | `consolidate` | `consolidate` | Duplicates, overrides across sections, conflicts and questions | Model over rule lines, then code |
| 11 | `save-draft` | `save-draft`, `save-draft:scores`, `save-draft:finish`, then `follow-up:ids`, `follow-up` | The draft rulebook in D1, with carried-forward review decisions; the build's scores in Langfuse; a further build when the documents changed while this one ran | Code |
| 12 | Review | | Approved, edited and rejected records | Administrator |
| 13 | Publish | | The rules file in R2, with its hash | Code, in a server function |

Model results are cached per organization (`hoas/{hoaId}/cache/{stage}/{hash}.json`), so rebuilding after one
document changes only pays for the calls whose prompt changed.

The stages are one module, `buildRulebook` ([src/encoding/build.ts](../../src/encoding/build.ts)), with its step runner,
models, cache, page records and previous rulebook injected: the `RulebookBuild` Workflow runs each stage step as a
Workflow step whose output goes to R2, and `pnpm eval:encoding` runs the same module in process. Each model call is its
own step, and every check across items a code step between rounds, so a replay reads the same answers in the same
order. The per-item work (each call with its parse and check, the problems a rerun is given, the handoff to the next
step) is in `src/encoding/steps/pipeline.ts`, which `pnpm eval:step` runs too, so a chain of step runs makes the build's
calls.

### 1. Resolve prompts

Pin every prompt the build uses (`hoa-structure-repair`, `hoa-defined-terms`, `hoa-rule-finding`,
`hoa-vocabulary-group`, `hoa-vocabulary-merge`, `hoa-rule-structuring` and `hoa-consolidation`) on the job.

### 1b. Check

Everything later steps validate about the uploads themselves is checked first, in code (`src/encoding/sourceCheck.ts`):
each upload's documents and edition (`governingDocument`, as merge and save-draft parse them: keys, kinds, dates, file
hashes), its structure (`documentStructure`), and that no two uploads use the same document key. Each problem is
typed (`SourceProblem`: the upload, and `file-missing`, `file-invalid`, `structure-invalid` or `duplicate-key`, with
the other upload's title for a duplicate), mapped generically from the schema's issues: one about the edition's files
is about the file (missing when the value is empty), any other is the structure. A problem fails the job at once, not
retryable, before any model call; the schema's path and message go to the log and the job's error record only. The
rule holds for every stage: a check that doesn't need a model's answer runs before the first model step.

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
   `intro`; text after the last child that continues the parent is its `wrapUp`. An exhibit's heading (its marker and
   any title lines in capitals) ends at the first line after it, so an exhibit whose body follows with no blank line
   still starts there.
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

The values each provision states (numbers, durations, parties, conditions) aren't extracted here
([Recognition](#recognition)).

### 4. Defined terms

B (`hoa-defined-terms`), one call per document with definitions or defined-term candidates. Code gives it the
definitions and every provision a candidate is defined in, and the **candidates**: defined-term usage found by code
(quoted and capitalized definitions, capitalized multi-word phrases used at least three times, with samples). The model
writes no term key: code builds each from the preferred label, resolves references, and checks the terms (citations
only to the provisions it was given, keys unique, references resolving); a document whose terms have problems is rerun
once with them, in the same step. The terms merge across documents by key.

### 5. Plan

Code divides each document into **sections** of at most 3,000 estimated tokens of provision text
(`unitTokenBudget`, [Cost and scale](#cost-and-scale)). An article that fits stays whole; a larger one splits by
section, and a large section by its items. Neighbouring pieces of one document, articles included, then pack together
in order up to the budget, so a run of short articles is one section, not one each; no subtree that fits is divided,
and no section mixes documents. A section's id is its first provision's key. Every section gets its provisions, the
intros and wrap-ups of its ancestors and the headings above it, the text of every provision it references (step 3),
truncated to 1,500 tokens each, B's terms its text mentions, and the request types.

### 6. Find the rules

E (`hoa-rule-finding`), one call per section, in parallel: every provision gets rule outlines (what each rule is, who
bears it, what it applies to, what it reads in plain words, and the rules, provisions or documents it overrides,
enforces or limits), settings flags, or a no-rule reason. Once every first answer is in, `find-rules:check` checks each
section with every section's outlines known (each provision answered once, keys unique, citations real, targets named,
a provision with nothing covered by some outline), and each failing section is rerun once with its problems. Then
`find-rules:resolve` keys the outlines' subjects and parties against B's terms, resolves their targets across sections
(a target that resolves to nothing goes to consolidation), and keeps each section's no-rule reasons (dropped where an
outline cites the provision), settings flags, interpretation questions (one option per reading) and named documents.
Known terms from a reviewed rulebook will feed the call; there are none yet.

### 7. Shared vocabulary

C (`hoa-vocabulary-group`), one call per group of sections (packed within token and outline budgets): the properties,
value sets, values, units and missing things the group's outlines read, each with the outlines it serves. Code builds
the keys, `vocabulary:check` checks the groups together, and each failing group is rerun once with its problems. Exact
keys merge across groups; clusters of near-duplicates and same-key collisions go to one C-merge call
(`hoa-vocabulary-merge`, the optional `vocabulary-merge` stage, skipped when there are none), whose merges, renames and
contexts code applies. The vocabulary is then frozen, with what each term serves.

### 8. Structure the rules

F (`hoa-rule-structuring`), one call per batch of about 15 outlines (a provision's stay together), with the outlines of
other batches they target or that cite the provisions shown, the frozen vocabulary and the settings flags: each
outline's checks, conditions, remedies, cure, sanction bodies and final overrides, and the settings clauses. Code
merges each structure with its outline into a rule draft, sets its `effectiveFrom` from its main citation's document
edition, and checks it with Zod; a batch whose whole answer fails Zod is rerun once with its problems, in the same step.
Once every batch is in, `structure-rules:check:{round}` runs the validator over every rule (references, invariants,
typing; [schema.md, Invariants](schema.md#invariants)), and the rules with problems go back to F with them, at most two
rounds. A rule still failing Zod is left out and recorded as a failure on the job; a validator problem left becomes an
issue on the rule.

### 9. Merge

Code combines one draft per section (E's no-rule reasons, questions and named documents) and one per batch (F's rules,
proposed terms and clauses) with the frozen vocabulary, as the hand-run's `build-rules-file.ts` did:

- **Terms** by key. The same key with the same kind merges labels and citations; different kinds, or two definitions,
  become a `conflict` issue on both.
- **Rules** by key; a duplicate key gets `-2` (an aspect allows no other suffix) and a `conflict` issue.
- **Clauses:** liability entries and precedence citations concatenate; other clauses must agree or raise a conflict.
- **Referenced documents** by key.
- **Coverage report:** provisions without a rule, term, clause or reason.

Then the whole set is verified again, so references across sections are checked.

### 10. Consolidate

One call with `hoa-consolidation`, over rule lines (key, kind, request types, subject, main citation, existing
overrides and statement, marked when the rule is one reading of an ambiguous passage), the cross-references between
sections (and the targets E named that resolved to nothing), the exceptions that override nothing yet with the norms
they may be about, and the similar pairs code found. It returns duplicates, overrides and conflicts; code applies them
(`applyConsolidation`): merges duplicates keeping every citation, adds overrides that precedence allows
(`override-not-allowed`), and turns conflicts into questions. Term merges were C-merge's, so there are none. Then it
verifies again.

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

The draft rulebook is written to D1 ([Storage](#storage)) and replaces the previous draft, unless the build was
stopped: a rulebook that isn't `building` any more saves nothing, so a stopped build never replaces the earlier draft
or the documents' stored provisions. **Carry forward**
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
provision, and approved records that make a valid rules file. A rulebook covers only the provisions of the documents
it was built from (its `sourceDocumentIds`): a replaced document's provisions stay stored for the rulebook that cites
them, but a draft built without it doesn't count them. Code assembles the rules file from the approved records
(schema.md, Rules file), validates it with `rulesFile`, writes it to R2, stores its SHA-256 on the rulebook and marks
the previous published rulebook `superseded`.

## Storage

**D1** (Drizzle):

| Table | Holds | Key columns |
| --- | --- | --- |
| `governing_documents` | Uploaded documents and referenced ones | `lineage_id` and `version` (an upload's versions), `amends`, `key` (unique per organization) and `document_json` (the schema's `GoverningDocument`); `status` `referenced`, with no file columns, for a document the rules name that nobody uploaded |
| `provisions` | One row per provision | `document_id`, `key` (unique per organization), `label`, `parent_key`, `kind`, `ordinal`, `provision_json` (the schema's `Provision`) |
| `rulebooks` | One per build | `status` building, draft, published, superseded, failed, cancelled; `settings_json`, `file_key`, `file_sha256`, `coverage_json` |
| `rulebook_rules` | Draft and published rule records | `rulebook_id`, `rule_key`, `kind`, `request_types` (JSON, for filtering), `applies_to`, `review_status`, `content_hash`, `rule_json` (the schema's `Rule`) |
| `rulebook_terms` | The organization's terms and proposed core terms per rulebook | `rulebook_id`, `term_key`, `kind`, `review_status`, `content_hash`, `term_json` |
| `rulebook_questions` | Interpretation and conflict questions | `rulebook_id`, `id`, `question_json`, `answer_json` |

The partial unique indexes (one `building`, one `draft` rulebook per organization) stay.

**R2:**

| Key | Contents |
| --- | --- |
| `hoas/{hoaId}/governing/{documentId}/…` | Source, OCR, pages, layout, figures |
| `hoas/{hoaId}/rulebooks/{rulebookId}/rules.json` | The published rules file, immutable |
| `hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json` | Every build step's output, by step name: `structure/{documentId}`, `find-rules/{unitId}`, `find-rules/{unitId}:rerun`, `structure-rules/{batchId}:retry-{round}`, and `{stage}/result` for steps without an item (`plan`, `merge`, `consolidate`) |
| `hoas/{hoaId}/cache/{stage}/{hash}.json` | Model results |

A review records the rulebook id and the file's SHA-256, so it can always be reproduced against the exact file.

## UX

One page, `/rules` ("Rulebook" in the sidebar, for every role), holds the rulebook and the governing documents it's
built from; `/documents` redirects to it. The page is quiet: one sentence about what's happening or next, at most one
primary action, few counters, plain headings, and details behind a sheet, a disclosure or a secondary tab. Nothing on
it names a document, organization, project type or term from a sample; lists are paged (25 to a page), so an
organization with 2 documents or 20, 50 rules or 2,000, sees the same page.

**In force (an administrator's default view).** Three parts, top to bottom:

- **Status:** shown only when there's something to say, most pressing first (`rulebookStatus`): a build is running
  (with its progress, below); a document is being read; the last build was stopped ("Processing was stopped.",
  with **Process documents**, and **Review the earlier draft** when there is one); a draft is ready ("A new draft of the rulebook is ready to review.
  It was made after the Design Guidelines changed. It adds 5 rules, changes 12 rules and removes 2 rules." and
  **Review changes**); the last build was refused by its check, checked again against the documents as they are now
  (one plain sentence per document naming it and saying what to do, such as "“Declaration” has no file we can read, so
  the rulebook can’t be made from it. Upload it again, or remove it.", with **Upload** and, per document, **Remove
  document**, which confirms by name and takes every version of it out of the documents builds and the page read,
  while what cites its pages still opens them); the last build failed (**Try again** only when the failure is
  retryable); the documents differ from the published rulebook's and
  there's no draft (**Process documents**); nothing is built yet (**Process documents**, under "Turn your
  documents into a rulebook."). On screen the build is "processing": people process their documents; the code and
  these docs keep "build".
- **Governing documents:** each document's current version (kind, version, pages, date) with its earlier versions
  behind a disclosure. **Read** (the document viewer, page by page) shows on the row; **Download** (the original file)
  and **New version** are in its ellipsis menu (a homeowner, with nothing else to do, sees Download beside Read). One
  **Upload** takes every file: once it's chosen, the dialog asks what it is, a new document (kind and title) or a new
  version of one of the documents (a new edition that replaces it, or an amendment that changes part of it). It
  preselects its guess from the file's name (`guessDocument`: the document whose title and kind explain more than half
  of the name's words, typos and prefixes allowed; otherwise a new document), and a row's **New version** preselects
  that row's document. Uploading builds the rulebook on its own once the file is read ([Save draft](#11-save-draft)); there's
  no separate build step.
- **Rules in force:** the published version and date, the rules file to download, and the rulebook's records
  read-only in quiet tabs (Rules, Terms, Coverage, Questions when there are any, Settings).

**The build's progress** (`DocumentEncodingSteps`). A build takes up to an hour, so the status shows all of it up front, not
one stage's bar at a time. The job records every stage it will report when it starts (`jobs.progress_json`,
`src/jobs/progress.ts`), and each report marks the stages before it done and its own current, with its count and
times. Until that record arrives, the page lists the same stages (`src/encoding/stages.ts`), none started. The page groups the stages into steps in plain words: Reading documents, Finding defined terms, Finding rules,
Building the vocabulary (merging it only if needed), Drafting rules, Combining and checking for conflicts, Saving the
draft. A stage the page has no words for is a step of its own, so the list stays true to the build's stages. Above the list, one
row: the time left ("35–50 min left"; the list already names the current step), the time so far ("21 min in") and an
icon button that shows or hides the steps; under it, one bar for the whole build. The estimate starts from the
sections (each stage's calls, `concurrency` at a time, with its reruns or retries, and the time each step's call takes)
and follows the build's own pace once finding or drafting the rules has done some of its work; it says "Estimating
time left" until the sections are known. The bar never
reads full before the build ends. The steps fold away, and the row then names the current step too ("Drafting
rules, 35–50 min left").

**Counts as they arrive.** The steps say only where the build is: the current one has a spinner, and none counts what
it found or the parts the build divides its work into (documents, sections, groups of sections, batches of rules).
What the build finds belongs to the reader above the steps (`DocumentEncodingReader`, in `ProcessingStatus`), which
shows each term, rule and draft in the document as it arrives and counts them. Its results come from
`getBuildResults` (administrators, the organization's own builds), which lists the build's step outputs in R2 and reads
only those written since the page's cursor, polled every four seconds; its documents from `getBuildDocuments`, the
structure step's output with each document's title, asked for every four seconds until the step has written it and
then kept, as it doesn't change. Polling, not server-sent events: a stream would hold a Worker request
open for the hour a build runs and still have to poll R2 inside it, while a poll is short, survives a dropped
connection and reads nothing twice.

**Stopping a build.** While a build runs, **Stop processing** (quiet, beside the progress) asks "Stop processing? Work
finished so far is kept and reused next time. Nothing is published." Stopping (`stopRulebookBuild`, administrators
only) terminates the build's Workflow instance and marks its rulebook and job `cancelled`. No draft is saved, the job
isn't marked failed, and no follow-up build starts; the next upload, or **Process documents**, starts one, and the model
answers the stopped build finished come from the content cache. A build that already finished, failed or was stopped
is reported as such, not as an error.

**Reviewing a draft** is a focused page of its own (`/rules/review`; `/rules` stays the rulebook page, and offers it). It
leads with the way back to the rules in force, what the draft changes against them, and **Discard draft**, whose
confirmation says how many review decisions are lost and that the published version stays in force. When the build
that made the draft skipped items (a rule that still failed its checks, a section a call never answered), a notice
("4 parts weren't finished") shows the same steps the progress did, each done or, where it skipped something, with a
warning and the places under it in a few words, each linked to it in the documents (`skippedParts`: "Declaration 21:
2 rules not drafted"), and offers **Try again**, which processes the documents again: what finished
comes from the content cache, so only the skipped parts are redone. The errors themselves stay on the job, not on the
page. The status line outside review says some parts weren't finished. A failed build is the only one the status line reports as not finished. Then the next step
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

Every list's search box (rules, terms, the coverage list's provisions, and the term pickers) goes through one helper,
`src/lib/search.ts` on MiniSearch: each word matches as a prefix and with typos scaled to its length (short words and
numbers exactly), every word must match in any order, and a title or label counts more than body text. With words, the
list is ordered by relevance; without, in its usual order. The other filters still apply.

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
- **Terms:** grouped under what they describe. Each subject (a thing, request, party, event or document the
  organization's terms hang off, core ones included, then the lists of choices no detail uses and the units) is a
  collapsed row in its section, most used first, the first eight until "Show all", saying what it holds ("37 questions
  and 3 kinds") and how many rules read it or anything under it ("Used in 5 rules"). The page calls a
  detail a question, since it's what the rules ask about the thing (as on the homeowner's form): "What the rules ask
  about it", each "Asked by 1 rule"; other labels are "Also called". Open, it shows its definition and other labels, its
  kinds (categories, with their definition or criteria) and its details (properties, by the name they're shown by
  under it: "height" under gate, not "gate height"), each with what it holds in words, its definition, the rules that
  read it and its review. A choice detail shows its list's choices as chips (folded past eight; "or another" when the
  list is open), each opening what it means, the rules that read it and its review; a later detail in the same
  subject choosing from the same list refers back to it ("as for material"). Kinds and details come most used first.
  The review filter (to review by default in a draft) keeps a subject for any term under it that matches, and only
  those kinds and details ("3 of 37 questions"); "Approve all N terms" approves what an open subject keeps, its details
  and their choices included. A search lists the subjects it finds best first, opened: a found subject shows all of
  itself, otherwise only the details holding a match, and a found choice is marked.
- **Questions:** the open questions one at a time (shadcn's Questionnaire, "Question 1 of 4"), each with its citations
  and readings, each reading naming the rules it keeps. Choosing a reading and moving on saves the answer; Skip leaves
  the question open, and finishing brings back the skipped ones as one line to answer later. Answered questions
  follow, each with its chosen reading and a way to change it.
- **Settings:** the review, then each clause as a card that says what it's for, a small form in plain words and the
  passages it comes from, when the documents state it. Which document wins is a tier list: each rank (1st, 2nd) a row of
  the documents equal in it; a document is dragged by its handle onto another rank to rank equal (before or after a chosen document there), or into a gap to
  rank alone, and its menu does the same from the keyboard; law (federal law, state law, then county and city ordinances) is fixed at the top, each marked with a lock, since no
  document an organization writes outranks it, so it can't be moved and nothing goes into or above it; each document is named as an owner knows it (Federal laws, Declaration (CC&Rs)), and moves save together with Save the order, or Reset; deadlines are a choice of calendar or business days, whether a deadline on a day off moves, the holidays that
  aren't business days (US federal, Washington state, or none) and the time zone, searched from every zone, west to east
  by its offset from UTC; the cure
  period's length and unit; who decides each request and who answers for whom are rows of pickers, added and removed;
  what a sanction needs first is read as sentences, removable. Conditions and exceptions the documents attach show as
  sentences, not edited here. A cure period or a step before a sanction can be added where the documents give none: a step needs a date the request records, every time or only when another is recorded (a hearing, if one was requested). Changes save as they're made. Then "Project application reviews": what to recommend when a rule
  isn't met, by what would fix it, and how sure the review must be, in percent. Nothing is edited as JSON.
- **Coverage:** one share for the documents the build read from their pages ("97.7% of the text of 2 documents is
  covered by a rule, a term, a setting or a reason for having no rule"), one bar and a small legend. A document whose
  provisions aren't linked to any upload's pages says it's not built yet instead of showing a share. Two views:
  - **On the pages:** the document in the document viewer, every passage highlighted by what covers it (a tint per
    kind, plus an underline or stripes for the gaps, so color isn't the only cue). Clicking a passage, or choosing it
    from the list beside the page ("On page N", then the gaps; a passage with no rule names its reason and note there),
    shows what covers or cites it: rules, terms, settings
    clauses, questions, its no-rule reason, the values its rules encode, and the provisions that refer to it. The panel
    sits beside the page on wide screens and in a sheet on narrow ones; choosing from the list moves focus to it.
  - **As a list:** every provision with what cites it or its reason, uncovered ones first, searchable, and filtered to
    the uncovered ones or the reasons to review.

  In either view an uncovered provision can be given a reason for having no rule. Coverage is computed in
  `src/rulebook/coverage.ts`, and the text outside provisions by `getSourceText`.

**Citations open the document reader.** Every citation (`ProvisionReference` and `RuleReference`, so the application
review's too) shows the provision's text on hover and focus, and links to the reader at `/documents/$documentId`,
opened at the provision with it highlighted and, for a rule, its other citations to step through. A rule's "and N more"
opens a picker whose entries link there too. The reader shows the whole document in its structure, and the uploaded PDF
beside it where the PDF and its OCR word boxes are kept; see [the reader](../reader.md).

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
| `hoa-defined-terms` | `term-extraction` | the version's `config.model` | `coreTerms`, `document`, `definitions`, `candidates`, `problems` | Things, categories, criteria terms and refinements, with labels; code builds the keys |
| `hoa-rule-finding` | `rule-finding` | the version's `config.model` | `coreTerms`, `requestTypes`, `knownTerms`, `documents`, `definitions`, `context`, `references`, `provisions`, `problems` | Per provision: outlines, settings flags or a no-rule reason; interpretation questions; named documents |
| `hoa-vocabulary-group` | `vocabulary-group` | the version's `config.model` | `coreTerms`, `requestTypes`, `definedTerms`, `previousVocabulary`, `documents`, `outlines`, `provisions`, `problems` | Terms reused and added, each with the outlines it serves |
| `hoa-vocabulary-merge` | `vocabulary-merge` | the version's `config.model` | `clusters` | Merges, renames and contexts by line id |
| `hoa-rule-structuring` | `rule-structuring` | the version's `config.model` | `coreTerms`, `requestTypes`, `vocabulary`, `documents`, `provisions`, `outlines`, `relatedRules`, `settingsFlags`, `problems` | Each outline's structure, settings clauses, proposed properties, outline issues |
| `hoa-consolidation` | `rulebook-consolidation` | the version's `config.model` | `documents`, `crossReferences`, `exceptions`, `rulePairs`, `rules` | Duplicates, overrides and conflicts |
| `hoa-provision-audit` (not built) | `provision-audit` | `anthropic/claude-haiku-5.5` (`config.model`) | `document`, `provisions` | `{ items: { provisionKey, kind: "number" \| "duration" \| "party" \| "condition", quote, value }[] }` |

The statement link syntax is described on the output schema's `statement` field, because Langfuse would read double
braces in prompt text as variables.

**Output size.** `RuleDraft`'s JSON Schema is recursive (conditions and operands) and large. `runObjectPrompt` sends it
through the `respond` tool. Zod writes the recursive parts as `$defs` references and, by default, inlines every other
schema at each use (`reused: "inline"`); a call that sets `sharedDefinitions` (the redesigned steps' calls do) sends
each repeated schema once, as a `$defs` reference (`reused: "ref"`), which keeps the tool schema and its cached prefix
small ([ai.md, Prompt caching](../ai.md#prompt-caching)). A model that answers in JSON text instead of calling the tool
is read too (`answerOf`), and the answer is validated by Zod either way.

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
item against the encoded records citing that provision, so a dropped number or party goes back to the model instead of
to the administrator:

1. **Numbers and durations** appear as a constant, an offset or a fraction in a rule, term or clause citing the
   provision, equal after unit conversion with exact arithmetic, or the provision's no-rule note explains them; else
   `unencoded-value`. This catches the commonest silent error: "within thirty (30) days" dropped from a deadline.
2. **Parties** appear as a bearer, approver, signer, subject or party value of a record citing the provision; else
   `unencoded-party`.
3. **Conditions** appear as an `appliesWhen`, condition, exception (an overriding rule) or text condition on a record
   citing the provision; else `unencoded-condition`, a warning sent back once with its quote.

An audit item that fails its own check (a quote not in the provision, a numeral that disagrees) is dropped and recorded,
not raised. These checks replace the planned text-analysis cross-checks (quantity coverage and modality cues from
LexNLP and spaCy); modality is measured by the encoding evaluation's modality agreement and gets a check only if its
failures call for one.

**Corrections become data.** Every audit item code rejects, every problem the audit raises, and how the model or the
administrator resolved it (encoded, explained in a no-rule note, or dismissed as the audit's error) is recorded on the
build, so it can become evaluation data, as the review's corrections become `entity-facts` items.

## Quality

- **Gold encodings.** The golden encoding of the sample Declaration is committed at `apps/hoa/samples/declaration/`
  (`rules.json`). `pnpm eval:encoding` builds from the sample documents and `pnpm eval:encoding:score` scores the run
  against the golden, per split, recording to the Langfuse dataset `encoding-evaluation` with `--record`
  ([evaluation.md](evaluation.md#datasets)).
- **Scores per build**, sent to Langfuse on the build's trace: sections, outlined and valid rules, rules retried,
  reruns per stage, checker problems before and after the retry, coverage, rules per kind, requirement and approval
  counts, text conditions, `SCHEMA GAP` notes. The build's report has each stage's items, calls, reruns and problems,
  and each outlined rule's validity and retry rounds.
- **Experiment scores against gold:** in code, modality agreement, check agreement on test cases (both rules of a pair
  evaluated on generated facts by the engine: the strongest signal, since it compares meaning, not wording) and term
  recall; rule recall and precision by provision and pairwise quality are judged by the coding agent from the
  comparison files `pnpm eval:encoding:score` writes, and the pairs it finds by meaning feed the code's scores
  ([evaluation.md, Judging by the coding agent](evaluation.md#judging-by-the-coding-agent)). No judge prompt or model
  call scores a build.
- **Self-consistency, later:** encoding a unit twice and diffing the rule sets by provision flags units where the model
  is unsure; those go to the administrator first.

## Cost and scale

Measured on a full build of the sample documents (the Declaration, its use restrictions and the Design Guidelines) on
the reordered steps: 1,330 rules for about $126, from Langfuse (write the rules $70, shared vocabulary $36, find
the rules $17, the rest $3; implementation-log.md, 2026-10-11). Every model stage stays on Opus 5.5 at high effort
until the encoding's quality is good.

- **Section budget.** 3,000 estimated tokens of provision text per section (`unitTokenBudget`), with small neighbours
  packed up to it ([Plan](#5-plan)). Packing cuts the calls for documents of many short sections without growing the
  largest answers.
- **Concurrency.** `ENCODING_CONCURRENCY` (default 16, [setup.md](../setup.md)) caps each stage's model calls in
  flight together. OpenRouter sets no request limit on paid models; the limits that matter are the upstream providers'
  (OpenRouter spreads Opus over several) and Anthropic's per-minute output tokens, and prompt-cache reads don't count
  toward Anthropic's input limit. Calls stream, so a Worker's limit of six connections waiting for response headers
  doesn't hold the others back. A call refused for now (429, overloaded, 5xx) waits for the provider's `retry-after`,
  or 5, 10, 20, 40 and 60 seconds, and is retried up to six times (`defaultRetry` in `runPrompt.ts`) before its step
  fails and the Workflow retries the step.
- **Prompt caching.** Every step's call marks its shared prefix (the `respond` tool's schema, the system message's
  instructions, then the user message's build-wide variables such as core terms and request types) for Anthropic's
  five-minute prompt cache, refreshed by each call that reads it ([ai.md, Prompt caching](../ai.md#prompt-caching)).
  Calls in flight at the start each write it once (1.25 times the input price); after that, reads cost a tenth.
- **Rebuilds.** Model results are cached by content, so a call whose prompt and variables are unchanged costs nothing.
