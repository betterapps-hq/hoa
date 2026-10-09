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
| 3 | `analyze` | `analyze:{documentId}` | Cross-references, named documents, and per provision: definitions, quantities, durations and deontic cues | Code and the text-analysis service |
| 4 | `vocabulary` | `vocabulary:{documentId}` | The organization's terms from definitions and defined-term usage | Model, one call per document with definitions |
| 5 | `plan` | `plan` | Encoding units: provision subtrees within a token budget, with their context | Code |
| 6 | `encode` | `encode:{unitId}` | An encoding draft per unit | Model, one call per unit, in parallel |
| 7 | `verify` | `verify`, `verify:merged` | Zod and checker problems per draft, then per unit in the merged set | Code |
| 8 | `repair` | `repair:{unitId}:{round}` | Corrected drafts, at most two rounds | Model, only for units with problems |
| 9 | `merge` | `merge` | One vocabulary, one rule set, settings, questions, coverage | Code |
| 10 | `consolidate` | `consolidate` | Duplicates, cross-unit overrides, conflicts and questions | Model over summaries, then code |
| 11 | `save-draft` | `save-draft`, `save-draft:scores`, `save-draft:finish` | The draft rulebook in D1, with carried-forward review decisions; the build's scores in Langfuse | Code |
| 12 | Review | | Approved, edited and rejected records | Administrator |
| 13 | Publish | | The rules file in R2, with its hash | Code, in a server function |

Model results are cached per organization as today (`hoas/{hoaId}/cache/{stage}/{hash}.json`), so rebuilding after one
document changes only pays for units whose text or context changed.

The stages are one module, `buildRulebook` ([src/encoding/build.ts](../../src/encoding/build.ts)), with its step runner,
models, cache, page records and previous rulebook injected: the `RulebookBuild` Workflow runs each stage step as a
Workflow step whose output goes to R2, and `pnpm eval:encoding` runs the same module in process.

### 1. Resolve prompts

As today: pin every prompt the build uses (`hoa-term-extraction`, `hoa-provision-encoding`, `hoa-encoding-repair`,
`hoa-rulebook-consolidation`, `hoa-structure-repair`) on the job.

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

The text-analysis service then reads every provision ([Language processing](#language-processing)) and stores, per
provision: the definitions it states, the amounts, percentages, counts, durations and dates it mentions, and its
deontic cues (modals with their negation, and exception markers). Vocabulary uses the definitions; verify uses the
rest as cross-checks.

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
  labels and plurals, then fuzzily for OCR noise, see [Language processing](#language-processing)), every property of those things, and
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
- **Language cross-checks:** quantity coverage (`unencoded-quantity`) and modality cues (`modality-cue-mismatch`),
  from the analysis in step 3.
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

The draft rulebook is written to D1 ([Storage](#storage)). **Carry forward:** a record whose key and content hash
equal a record approved in the organization's last published rulebook keeps its approval, so a rebuild after one
amendment only asks the administrator to review what changed. Everything else is `proposed`. The job reports counts:
provisions, terms, rules by kind, uncovered provisions, issues.

### 12. Review and 13. Publish

The administrator works in [the rules UX](#ux). Publishing requires every record approved or rejected, every no-rule
reason approved, no blocking issue, no uncovered provision, and approved records that make a valid rules file. Code assembles the rules file from the approved records (schema.md, Rules file),
validates it with `rulesFile`, writes it to R2, stores its SHA-256 on the rulebook and marks the previous published
rulebook `superseded`.

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

The `/rules` route keeps its shape: a build card, a Draft tab and a Published tab. What changes:

- **Build card:** documents are chosen as today. `JobProgress` has labels for the new stages (structure, analysis,
  vocabulary, planning, encoding, checking, repairing, merging, consolidating, saving). A finished build shows its
  counts and links to the problems. The Draft tab starts with the draft's counts, what blocks publishing, and
  Publish.
- **Draft tab**, as tabs inside it:
  - **Rules:** `RuleTable` lists rules by domain (instead of topic), filtered by status, kind and request type. Each row
    shows the title and the statement with term links rendered as labels. "Approve the rules shown" approves what a
    filter shows, skipping (and saying why) any record something blocks; the Vocabulary and Coverage tabs have the
    same.
  - **Vocabulary:** terms with labels, kind, definition, where they're used, and review status. Approving a term is
    separate from approving rules; a rule can't be approved while a term it reads is proposed.
  - **Coverage:** every provision of every document in order, showing the rules and terms citing it, or its no-rule
    reason, with uncovered provisions first. A reason an administrator gives is approved as given; the build's are
    approved here.
  - **Questions:** each interpretation or conflict question with its options; answering one approves the rules the
    chosen option keeps and rejects the candidates it drops. A candidate can't be approved on its own while its
    question is open.
  - **Settings:** the clauses (precedence, time, liability, cure, deciders, sanction preconditions), each cited and
    edited as JSON, and the policy; the settings are approved like a record.
- **Every rule reference links to its citation**, through the same `RuleReference` the review uses
  ([application-review.md, UX](application-review.md#ux)): rule rows, overrides and enforced rules on a card, the
  rules a question keeps, the rules citing a provision in the coverage tab, and every issue's related rules.
- **`RuleCard`** (in the Sheet) shows modality, bearer, subject, request types, applicability and the check, rendered
  as sentences from the schema (`describeRule`), with every term as a `TermChip` (a popover with the term's labels and
  definition, replacing `AttributeChip`). Citations open `DocumentViewer` at the provision, highlighted from its
  anchors. Issues (resolved with a note), approve, reject and delete work as today, and a preview evaluates the rule
  with the engine against facts typed in the card.
- **Editing:** title, statement, modality, bearer, remedy and request types in a form. Checks and conditions in a
  structured editor for the common shapes (compare, in, between, all/any, table rows, approval, document), and a JSON
  editor with live validation for anything else. Every edit runs `validateRulebook` and shows its issues inline; an
  edit with problems can be saved, and they block its approval.
- **Published tab:** the same views, read-only, with the file's hash and "Download rules file".

## Prompts and models

| Prompt | Trace name | Model | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-structure-repair` | `structure-repair` | `OPENROUTER_MODEL` | `documentTitle`, `pageText`, `parserOutline`, `problems` | `{ markers: { offset: number; marker: string; level: number }[] }` |
| `hoa-term-extraction` | `term-extraction` | `anthropic/claude-opus-5.5` | `document`, `definitions`, `candidates`, `coreTerms` | `{ terms: EncodedTerm[]; notes: string[] }` |
| `hoa-provision-encoding` | `provision-encoding` | `anthropic/claude-opus-5.5` | `document`, `provisions`, `context`, `references`, `terms`, `coreTerms`, `requestTypes` | `EncodingDraft` |
| `hoa-encoding-repair` | `encoding-repair` | `anthropic/claude-opus-5.5` | `draft`, `problems`, `terms`, `coreTerms` | `EncodingDraft` |
| `hoa-rulebook-consolidation` | `rulebook-consolidation` | `anthropic/claude-opus-5.5` | `rules`, `termPairs`, `documents` | `Consolidation` |

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

## Language processing

Tools are chosen for accuracy; where they run is a hosting detail. The Python tools run in a small text-analysis
service (`text-tools`, a container next to the Workers) that Workflow steps call over HTTP in batches. Everything that
needs the provision index or the vocabulary at hand stays in TypeScript.

| Job | Technique | Tool |
| --- | --- | --- |
| Running heads, footers, page stamps | Azure Layout's paragraph roles, then repeated-line detection | TypeScript |
| Provision numbering | A numbering grammar with a sequence stack (letters versus roman numerals, counted paragraphs, inferred repairs) | TypeScript |
| Cross-references | A reference grammar, resolved against the provision index | TypeScript |
| Label matching: vocabulary slices, value terms, document names, near-duplicate terms | Normalized exact match, then edit-distance similarity (ratio, token-set and partial ratios) with per-length thresholds | RapidFuzz |
| Definitions, amounts, money, percentages, durations, dates and citations in legal text | Legal extractors built for contracts and covenants ("thirty (30) days", "$1,000,000", "two-thirds (2/3)") | LexNLP |
| Deontic cues: modals, negation scope, exceptions ("unless", "except", "provided that", "subject to") | Dependency-pattern matching on a parse | spaCy (a transformer English model) |
| Similar rules and terms | Sentence embeddings and cosine similarity | An embedding model, hosted or in the service |

A fuzzy match is recorded as fuzzy, with its score, and never silently treated as exact; no label under four
characters is matched fuzzily. When nothing matches, the model decides, with the candidates listed.

**Cross-checks on the model's encoding.** The extractors don't encode anything; they check what the model encoded, in
[Verify](#7-verify), so a dropped number or a flipped "shall not" goes to repair instead of to the administrator:

1. **Quantity coverage.** Every amount, percentage, count and duration LexNLP finds in a provision appears in a rule,
   term or clause citing that provision (as a value, an offset or a fraction), or the provision's no-rule note explains
   it. A missing one raises `unencoded-quantity`. This catches the commonest silent error: "within thirty (30) days"
   dropped from a deadline.
2. **Modality cues.** Each rule's modality is compared with the deontic cues in the sentences it cites: a permission
   on "shall not", an obligation on "may", or an "unless" with no override or condition raises `modality-cue-mismatch`.
   It's a warning, sent to repair once.
3. **Defined terms.** Every definition LexNLP finds is a vocabulary candidate, and every capitalized defined term a
   unit uses must resolve to a term in its slice.
4. **Consolidation candidates.** Embeddings propose pairs of rules and terms above a similarity threshold; the model
   confirms duplicates among them. Consolidation then scales past one context window.

**Licensing.** LexNLP is AGPL-3.0 with a commercial license available. That's a legal decision, not a technical one:
before production, either take the commercial license or replace its extractors with grammars of our own for the same
patterns.

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
