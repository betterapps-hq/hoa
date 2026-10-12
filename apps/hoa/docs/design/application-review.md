# Application review

> Reads the rulebook [encoding.md](encoding.md) produces and evaluates it as
> [schema.md, Evaluation](schema.md#7-evaluation) defines. The tasks that build it are in
> [implementation-plan.md](implementation-plan.md).

How a homeowner's application packet is checked against the organization's published rulebook, starting with fences.
The model never sees the rulebook. Code picks the rules that can apply, works out exactly which facts they read, and
asks the model only for those facts, for judgments one rule at a time, and for the written summary. Code evaluates
every rule and decides the recommendation, so the same facts always give the same result.

## Why filter first

The sample rules file is about 440,000 tokens. The rules an architectural application can trigger are a few percent of
it: 23 of the Declaration's 307 rules (about 8,000 tokens), reading 28 properties, plus the Design Guidelines' fence
rules. Selection is code, not a prompt, because the schema already says everything selection needs: each rule's
`requestTypes`, its subject (`appliesTo`), its `effectiveFrom`, and the paths it reads. A model filter could drop a rule
silently; code can't.

## Stages

`ApplicationReview` stays the workflow and `application-review` the job kind.

| # | Stage id | Steps | Output | Who does it |
| --- | --- | --- | --- | --- |
| 1 | `resolve-prompts` | `resolve-prompts` | Prompt versions on the job | Code |
| 2 | `load` | `load` | The application, the published rules file (hash checked), settings | Code |
| 3 | `ocr` | The OCR steps ([ocr.md](ocr.md)), per file | Page records, figures and visual descriptions for every file | Code, OCR, vision model |
| 4 | `classify` | `classify:{fileId}` | A document type for every page | Small model |
| 5 | `subjects` | `subjects` | The entities in the application: the work, its items (fence runs, gates), and how they relate | Model, with images |
| 6 | `select` | `select` | The rules that can apply, and the overriding rules that target them | Code |
| 7 | `plan` | `plan` | The fact plan: every property the selected rules read, per entity, and the text conditions | Code |
| 8 | `facts` | `facts:{group}` | Facts with evidence, one call per entity group | Model, with images |
| 9 | `normalize` | `normalize` | Typed fact values, units converted, values matched to terms, evidence verified | Code |
| 10 | `documents` | `documents` | Each required document: present, statements confirmed, signers | Model |
| 11 | `judgments` | `judgment:{ruleKey}:{entityId}` | An answer per judgment check and subject | Model, one call each |
| 12 | `evaluate` | `evaluate` | One finding per rule and subject | Code: the engine |
| 13 | `decide` | `decide` | Recommendation, action items, suggestions | Code: the decision policy |
| 14 | `write` | `write` | Assessment, homeowner feedback, phrased action items | Model, from findings only |
| 15 | `save-review` | `save-review` | The review in R2 and D1; the application `reviewed` | Code |

Model results are cached per application, so re-running after adding one file pays only for what changed.

### 2. Load

The application's organization must have a published rulebook. `load` reads its rules file from R2, checks the SHA-256
against D1, and parses it with `rulesFile`. A 2 MB file parses in milliseconds; nothing is preloaded.

**The request.** An application is an `architectural-application` request. Its governing date is the submission date
(the request type's `governingDate`, `architectural-application.submitted-on`). A review before submission uses the
evaluation date and is marked provisional.

### 4. Classify

One small-model call per page with `hoa-page-classification`. The choices are the rulebook's document types (things of
nature `document` that document checks name, such as `neighbor-approval-form` and `site-plan`) plus generic kinds
(`application-form`, `photo`, `product-specification`, `drawing`, `other`), each with its labels and definition. The
page's visual descriptions go in as context. A category with no definition of its own is described by its
criteria when they're text (a plot plan: "a drawing of the Unit showing its boundaries and where the proposed Work
goes"); subjects and document review describe types the same way.

### 5. Subjects

`hoa-subject-identification` reads the packet and names the things the application is about. Its choices are the
**candidate types**: every thing or category that a rule in the request type applies to, plus the things those can
reference (a gate references its fence run), each with labels, definition, its kinds (the rulebook's categories of it)
and its referencing properties. For the sample rulebook that's about ten types and 2,000 tokens.

It returns entities:

```ts
type SubjectsOutput = {
  entities: {
    id: string; type: TermKey; label: string; evidence: Evidence[] // "run-1", "fence-run", "Left side run"
    refersTo: { property: TermKey; entity: string; confidence: number }[] // a gate's fence run
    kinds: { kind: TermKey; confidence: number }[] // a return fence
  }[]
}
```

How an entity relates and what kind it is are part of naming it, so they become readings of facts: a reference is a
reading of its property (the gate's `gate.fence-run`), and a kind whose criteria fix one of the entity's own properties
is a reading of that value (a return fence's `fence-run.location` is `return`). A reading identification gives at or
above the fact confidence threshold stands for its entity and property; below it, it's weighed with the facts stage's
reading like any other.

Code always adds `request` (the application), `lot` and `community`, and one `work` entity for the project when the
model didn't name one. An entity of a type outside the candidates is dropped with a warning on the job.

The homeowner's project type (its label and the organization's description, [Project types](#project-types)) and
description are hints in the prompt, never filters. The answers to the project type's form reach every stage as one
more page of the packet ("Application form answers"), read and cited like the others.

### 6. Select

Code, from the rules file:

1. Rules whose `requestTypes` include `architectural-application` and whose `effectiveFrom` is on or before the
   governing date.
2. Of those, rules whose subject is a type (or a category of a type) among the entities, or `request`, `lot` or
   `work`. Categories keep every entity of the underlying thing; membership is decided in evaluation.
3. Every rule that overrides a selected rule: discretion rules, permissions, selectors (resolved here, against the
   selected set) and decision rules scoped to this lot.
4. Rules whose bearer is the committee or board stay in (deadlines on the committee), but never count against the
   applicant ([schema.md, From findings to a recommendation](schema.md#from-findings-to-a-recommendation)).

The selection is saved on the review, so every finding can be traced back to the rules that were considered and the
ones that weren't.

### 7. Plan

Code walks every selected rule's `appliesWhen`, check, category criteria and overriding rules, and collects the
**fact plan**:

- per entity type, the properties read, each with its labels, definition, value type, unit, allowed values (value terms
  with every label, alternative and hidden label included), `ifUnstated` and whether it's many-valued;
- request, lot and community properties read;
- reference properties to follow (a gate's fence run);
- the text conditions, each with the entities it's asked about;
- derived properties are left out: code computes them.

From the plan it builds the **fact schema**: a Zod schema whose property keys are an enum of exactly those properties
and whose values match each property's type. That's what the facts stage returns, so the model can't answer a
property nobody asked for.

### 8. Facts

`hoa-entity-facts` reads the packet and answers the plan. The plan is split into **entity groups** so each call stays
small: one call for the request, lot and work, and one per entity type with items (all fence runs together, all gates
together). For the sample fence that's three calls. Each call gets the pages, up to 20 images, the visual descriptions,
the entities with their labels (and, marked as there only to be referred to, the entities its reference properties can
point to, so a gate's run can be named), and its slice of the plan. A value every entity of a type shares (one color for
the whole fence) can be answered once, for `all`; code gives it to each entity that has no answer of its own.

**Second reading.** A fact read with a value but below the fact confidence threshold is read again in a focused call
(`facts:{group}:second`) that asks only for the entities and properties concerned; so is an entity the first reading
skipped while answering others of its type (three runs answered, the fourth left out). When both readings name the
same value, the fact stands at the more confident of the two; when they don't, the first reading stands. A skipped
entity's second reading is its only one.

The model returns, per entity and property: the state (`known`, `absent`, `conflicting`, `uncertain`), the value as
written (`stated`, the exact words and only them, such as "6'" or "River Birch"), its reading of the value in schema
terms (a value key; an exact number or fraction with a unit term key; an ISO date; an entity id), every source as
evidence (file, page, quote, figure), and a confidence. It also answers the text conditions. It never guesses a property
it has no evidence for; no answer means unknown. The model proposes and code verifies ([Recognition](#recognition)).

### 9. Normalize

Code turns the model's readings into typed `FactValue`s, checking each ([Recognition](#recognition)):

- **Quantities, counts and dates** are the model's reading, verified generically against `stated`: every numeral agrees
  with the value and the unit is one of the property's dimension. The quantity and date grammars read the same words
  as a fast check: a grammar value that verifies and agrees marks the value `parsed`; one that verifies but differs
  leaves both as candidates (`uncertain`); a model value that fails the verifier gives way to a grammar value that
  passes, else the fact is `uncertain` with the model's value as its candidate. A form no grammar reads stands on the
  verifier alone (`verified`). A quantity or date with no `stated` words can't be verified and stays `uncertain`; a count
  counted from a drawing has no numerals to check and stands on its evidence. A range is `uncertain`.
- **Choices** against the property's value terms: exact on any label, then normalized, then fuzzy similarity
  (`src/text/match.ts`, RapidFuzz's ratios in TypeScript). A fuzzy match is kept with the matched label and its score. When no label matches the words, the model's reading
  (the allowed value it took them for) stands, as kind `reading`: labels can be phrases a packet never uses
  ("enclosing a garage as living space"). With neither, the value is `{ term: null }` for an open set, and
  `uncertain` with an `invalid-value` note for a complete one, as the schema requires.
- **Parties** from the model's reading, which names a role ("contractor"), else the stated words, matched to the party
  terms; a role no party term names stands as written (`{ term: null }`): it's known, and it isn't a party the rules
  list, so "built by a contractor" settles that the Declarant isn't doing the work.
- **References** to entity ids.

Then two checks that need no model:

- **Evidence verification:** every evidence quote is matched against its page with the existing `matchQuote`; a quote
  not on the page it cites but on another page of the packet is cited there instead. A fact whose only evidence
  doesn't match is downgraded to `uncertain`; an `absent` answer whose evidence doesn't match is dropped, since "none"
  with nothing behind it is a guess and no answer means unknown. A reading that doesn't fit its property's type is
  dropped, and the stated value read instead.
- **Conflicts:** two readings of one property for one entity that disagree become `conflicting`, with both as
  candidates.

Facts below the organization's fact confidence threshold become `uncertain`. Every value the verifier rejects, and
every fast check that reads the words differently, is recorded as a correction ([Recognition](#recognition)).

### 10. Documents

`hoa-document-review` gets every document check among the selected rules: the document type, what it must state, who
must sign, and whether it's per subject. It also gets the parties as facts (owners of record from the packet, the
applicant) and the pages classified as those document types (or every page when none is). It returns, per check and
subject: present or not, each statement confirmed, contradicted, not applicable or not found (with its quote), and
the signers. A statement is contradicted only when the packet says its opposite; `not-applicable` is for a statement the
rule qualifies ("as applicable", "if any") when the project has nothing it covers, and holds like a confirmed one.

A check for a document the portal's application form provides (`formDocumentKinds` in `src/schema/coreTerms.ts`: the
core `application-form` and `project-description`, or an organization's refinement of one: the same key, or a category
of it) that needs no signature is present by code when the application has it: the application form when the form's
answers page is in the packet (its evidence), the description when there is one. The reader isn't asked about it unless
it lists statements the document must show. A check that must be signed still goes to the reader: the form collects no
signatures.

### 11. Judgments

One call per judgment check and subject, with `hoa-judgment-check`: the rule's statement and question, the subject,
the facts its `evidence` terms name, and only the pages and images those facts cite. It returns yes, no or unclear,
with a confidence, a rationale and evidence. An answer below the judgment threshold is unknown, which the engine turns
into `committee`.

### 12. Evaluate

The engine ([Engine](#engine)) evaluates every selected rule on every subject with the facts, documents and judgments,
exactly as [schema.md, Evaluating a request](schema.md#evaluating-a-request) defines, and returns the schema's
`Finding` for each: outcome, remedy, reason, every fact read, the rules that modified it, the judgment and confirmed
statements.

**Verification pass.** First, each fact read from the packet that alone decides a finding (held unsure, the finding's
outcome would change: met, not met, not applicable or exempt alike) is read a second time, independently, by
`hoa-entity-facts` on Haiku, alone, on the pages its evidence cites (`facts:{entity}:{property}:verify`). It stands when
that reading confirms its value confidently. Otherwise the dispute escalates once to the stronger model the prompt
version's `config.escalationModel` names (Sonnet), reading the whole packet (`facts:{entity}:{property}:escalate`): the
fact stands when the escalation confirms it, takes the second reading's value when the escalation confirms that one,
and otherwise stays conflicting (readings of different values, or of none) or uncertain, so its findings become missing
information or go to the committee, never rest on a silent wrong value. Without an escalation model the dispute stays
unsettled. A wrong not-met tells a homeowner to change something that's fine and a wrong met approves what the rules
forbid, so any deciding value needs two readings. Every dispute is recorded as a correction, with every reading.

### 13. Decide

The recommendation is code, so the same findings always give the same recommendation. It's advice to the committee,
which still records the decision.

1. **Which findings count.** Findings on rules whose bearer is the owner or the applicant, and requirements on the
   application itself. Two kinds never count against the applicant, though both are shown:
   - findings about the committee or board, such as its own 30-day deadline;
   - an `approval` check by the party the settings' `deciders` name for this request type (the committee, for
     architectural applications). That approval is the decision the application asks for. Without this rule, "No Work
     without the Reviewer's prior approval" would send every application to the committee and nothing could be
     recommended for approval. An approval by anyone else (the Board's authorization of an attic conversion, the
     Declarant's consent) still counts.
2. **Each finding becomes one action:**

   | Outcome | Action |
   | --- | --- |
   | `not-met` | The organization's decision policy for the rule's remedy (below) |
   | `missing-information` | Request information |
   | `committee` | Refer to the committee |
   | `advisory` | None; listed as a suggestion |
   | `met`, `exempt`, `not-applicable`, `pending` | Approve |

3. **The recommendation is the most serious action that occurs**, in this order: deny, request information, refer to
   the committee, approve with conditions, approve. Deny comes first because no added information fixes it; request
   information comes before the committee because the committee can't weigh an incomplete application; the committee
   comes before conditions because conditions are the committee's to set.

**Remedies and the decision policy.** Each rule's `remedy` says what fixes a `not-met` finding: `change-detail` (a
detail can change: the color, the height), `redesign` (the project has to be rethought: a prohibited fence type), or
`none` (nothing fixes it). The organization's `policy.decisionPolicy` maps each remedy to an action; it's the
organization's choice, not the documents', and defaults to:

| Remedy | Default action |
| --- | --- |
| `change-detail` | Approve with conditions |
| `redesign` | Deny |
| `none` | Deny |

So the remedy encoded on each rule decides how serious a failure is. In the sample, "no horizontal boards" is
`change-detail`; if it were `redesign`, the same packet would be recommended for denial.

**Action items** list every counting finding, not just the one that set the recommendation, grouped by rule with every
entity they cover: what to change (`not-met`), what to provide (`missing-information`, saying which fact or document),
for the committee (`committee`), and suggestions (`advisory`). The homeowner sees everything to fix in one pass.

### 14. Write

`hoa-review-summary` gets the recommendation, the action items and the findings with their rule statements, outcomes,
reasons and cited provision text, and writes the assessment for the committee, the feedback for the homeowner and one
sentence per action item. It sees no rules beyond those in findings and no packet text, so it can't introduce a
requirement.

It refers to a rule only with a marker, `{{rule:guidelines:5.4.2(i)#colors}}`, never by quoting or paraphrasing a
section number. Code checks every marker names a rule in the findings (an unknown marker fails the step, so it
retries), and the UI renders each marker as a `RuleReference` linked to the citation.

### 15. Save

The review record goes to R2 (`reviews/{jobId}.json`) and its summary to D1, with the rulebook id and the rules file's
hash.

```ts
type Review = {
  id: string; applicationId: string; jobId: string
  rulebookId: string; rulesFileSha256: string
  request: EvaluationRequest // schema.md: type, governing and evaluation dates, entities, facts, documents
  provisional: boolean // reviewed before submission
  selected: RuleKey[] // every rule considered
  documents: DocumentResult[]
  normalizations: { entity: string; property: TermKey; stated: string; matchedLabel: string | null; kind: "exact" | "normalized" | "fuzzy" | "reading" | "parsed" | "verified" | "none"; score: number | null }[]
  corrections: Correction[] // Recognition: rejections, disagreements, escalations and people's corrections, with every reading
  judgments: { ruleKey: RuleKey; entity: string; answer: "yes" | "no" | "unclear"; confidence: number; rationale: string; evidence: Evidence[] }[]
  conditionAnswers: { entity: string; text: string; holds: boolean | null }[] // the text conditions, as the engine read them
  findings: Finding[] // schema.md
  recommendation: "approve" | "approve-with-conditions" | "request-information" | "refer-to-committee" | "deny"
  changes: ActionItem[]; missingInformation: ActionItem[]; committeeDecisions: ActionItem[]; suggestions: ActionItem[]
  assessment: string; feedback: string
  promptVersions: Record<string, number>; costUsd: number; durationMs: number; sessionId: string; createdAt: string
}
type ActionItem = { id: string; ruleKey: RuleKey; entities: string[]; text: string }
```

## Engine

`src/engine/` implements [schema.md, Expressions](schema.md#3-expressions) and
[Evaluation](schema.md#7-evaluation) as pure functions over a parsed rules file and an `EvaluationRequest`. It's the
same code the rules editor uses to preview a rule against sample facts, and the encoding pipeline's quality scores use
to compare rules by meaning.

| Module | Does |
| --- | --- |
| `decimal` | Exact decimals and fractions as reduced bigint ratios; rounding half up |
| `vocabulary` | Builds on `src/schema/vocabulary.ts`: properties, categories, broader values, parties, units and `perBase` conversion |
| `values` | Three-valued logic; ranges for unknown quantities, counts and dates, and arithmetic over them |
| `calendar` | Days, months, business days and holidays, local time, schedules |
| `context` | The request's entities and facts indexed, the calendar, and the pipeline's answers |
| `paths` | Resolves a path from a root through properties and references to facts; unknown, absent, many-valued |
| `operands` | Constants, references, arithmetic, aggregates and date shifts |
| `conditions` | Every `Condition` type, including `during`, quantifiers, `approved` and `text` (answered by the pipeline) |
| `derived` | Derived properties: the first derivation whose `when` holds |
| `checks` | `test`, `table`, `document`, `judgment`, `approval` |
| `deadlines` | `deadline` checks: windows, roll-forward, pending, `onMiss` effects |
| `applicability` | Which rules a request considers and whether one applies to a subject |
| `overrides` | Selector resolution, precedence, displaced, exempt and decided-by |
| `evaluate` | Rules × subjects to findings, with remedies |
| `sanctions` | Cure periods, preconditions, liability, amounts, limits (not needed for applications; built with violations) |
| `decide` | Findings to recommendation and action items |

`evaluate({ rulesFile, request, answers, evaluatedAt })` gives the findings, where `answers` holds the document reviews
(each statement per rule and subject), the judgments and the text conditions' answers; `decide(findings, rulesFile,
requestType)` gives the recommendation and the action items grouped by rule.

Decimal arithmetic uses exact decimals (scaled bigints), never floats, so 72 inches and 6 feet are equal.

## Recognition

**The model proposes, code verifies, corrections become data.** Hand-written recognizers (LexNLP, Recognizers-Text, our
own grammars as the primary reader) don't scale to the thousand ways documents and packets write a value, so reading a
value is the model's job and checking it is code's, with no rule for any one format. The same approach reads the
governing documents ([encoding.md, Recognition](encoding.md#recognition)).

1. **The model proposes.** For every value a fact depends on, the facts call (`hoa-entity-facts`, on Haiku through the
   prompt version's `config.model`; never Opus) returns the exact words (`stated`) and the value in schema terms: an
   exact number (a decimal, or a fraction such as `"2/3"` where no decimal is exact) with a unit term key, an ISO date, a
   value key or an entity id. That works for any phrasing.
2. **Code verifies, generically** (`src/review/valueCheck.ts`):
   - the quote exists on its page (`matchQuote`, `verifyEvidence`);
   - **numerals agree:** every numeral in `stated` (digits, decimals, fractions and mixed numbers, and number words from
     a small fixed list in `src/text/numerals.ts`, fractions like "two-thirds" included) equals the value in some unit
     of its dimension (or the dimension's base), or the numerals together make it as a compound in ever smaller units
     (6'-0" is 72 inches); there's at least one numeral. A count's numerals, if any, are the count; a date's numbers are
     its day, month or year and its month names its month;
   - **the unit fits:** it's a vocabulary unit of the dimension the property expects.

   Exact arithmetic (`src/engine/decimal.ts`) makes "two-thirds" and 2/3 equal and 66.67 percent not.
3. **Second readings decide disputes.** A value that alone decides a finding is read twice independently on Haiku; a
   disagreement escalates once to a stronger model, and a value still disputed stays uncertain (missing information
   or the committee), never a silent wrong value ([Evaluate](#12-evaluate)).
4. **Grammars are fast checks.** The quantity grammar (`src/text/quantity.ts`: the legal double form, feet and inch
   marks, compounds, ranges, unit labels from the rulebook) and the date grammar (`src/text/date.ts`, US month-day
   order) read the same words and feed the same verifier. They confirm a value, catch a unit the numerals alone can't
   (6 ft read as 6 inches), and stand in for a model value the verifier rejects; they never gate one they can't read.
5. **Corrections become data.** Every rejection (`verifier-rejected`), fast check that disagrees (`check-disagrees`),
   unsettled second reading (`second-reading-disagrees`), escalation (`escalated`) and, later, person's correction
   (`person-corrected`) is recorded on the review (`corrections`), with every reading: who read it (the model, the
   grammar, the second reading, the escalation, a human), the model, the value, the confidence and the evidence, plus
   the verifier's problems and the fact as the review used it. `pnpm review:corrections <run folder | review record>`
   exports them as items of the Langfuse dataset `entity-facts` (`scripts/export-corrections.ts`): the input names the
   packet, entity, property, words and cited pages; the expected output is the settled fact, or null with `needsLabel`
   for a person to label. Item ids name the source, so exporting again updates rather than duplicates. There is no UI
   for people's corrections yet; the record and the export already carry them.

Nothing here is per organization or per format: the verifier knows numerals, exact arithmetic and the vocabulary's
units, and every organization's rulebook supplies its own labels and units.

## Prompts and models

| Prompt | Trace name | Model | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-visual-description` | `visual-description` | `OPENROUTER_MODEL` | `documentKind`, `contextText`, `ocrText` | A description of the figure ([ocr.md](ocr.md)) |
| `hoa-page-classification` | `page-classification` | `anthropic/claude-haiku-5.5` (`config.model`) | `documentTypes`, `contextText`, `visualDescriptions`, `pageText` | `{ type: string }` |
| `hoa-subject-identification` | `subject-identification` | `anthropic/claude-haiku-5.5` (`config.model`) | `requestType`, `projectKind`, `description`, `candidateTypes`, `pages` | `SubjectsOutput` |
| `hoa-entity-facts` | `entity-facts` | `anthropic/claude-haiku-5.5` (`config.model`); escalations on `anthropic/claude-sonnet-5.5` (`config.escalationModel`) | `requestType`, `description`, `entities`, `properties`, `textConditions`, `pages` | facts and condition answers, typed by the fact schema |
| `hoa-document-review` | `document-review` | `anthropic/claude-sonnet-5.5` (the prompt's `config.model`) | `requirements`, `parties`, `pages` | `{ documents: DocumentResult[] }` |
| `hoa-judgment-check` | `judgment-check` | `anthropic/claude-haiku-5.5` (`config.model`) | `statement`, `question`, `subject`, `facts`, `evidencePages` | `{ answer, confidence, rationale, evidence }` |
| `hoa-review-summary` | `review-summary` | `anthropic/claude-haiku-5.5` (`config.model`) | `recommendation`, `findings`, `actionItems`, `suggestions` | `{ assessment, feedback, items: { id, text }[] }` |
| `hoa-project-type-suggestion` | `project-type-suggestion` | `anthropic/claude-sonnet-5.5` (`config.model`) | `rulebook`, `projectTypes` | project types with subjects, fields and documents, checked by code ([Project types](#project-types)) |

`projectKind` carries the chosen project type's label and description ("not given" for Something else). Every prompt
is generic: it names no organization's terms, project type, product, place or sample case. What a stage needs to know
about one organization arrives as data: the rulebook's labels, definitions, scope notes and value meanings
(`promptInputs.ts` sends a term's scope note and each allowed value's meaning with it), and the project type.

Every review prompt runs at its model's default effort (no `config.effort`): the review's evaluation found Haiku at
high effort no better on any stage, and not a match for Sonnet on the document review (implementation-log.md).

## UX

The application routes keep their shape.

**Every rule reference links to its citation.** Wherever a rule appears (a matrix row, a finding, an action item, the
written summary, the committee's view), it's a `RuleReference`: the rule's title with its main citation's label
("Guidelines 5.4.2(i)"). Activating it opens `DocumentViewer` at the cited provision with the operative words
highlighted (or the region on a plat); hovering or focusing it shows the provision's text. A rule with several
citations lists the main one and "2 more". The text shown is always the stored provision, so it can't drift from the
document.

- **Start an application:** the project type picker lists the organization's active project types
  ([Project types](#project-types)) and "Something else". Choosing one renders its form (its questions, repeatable
  groups for several items of a kind, and an upload per document the rules require, with what each must show) above
  the general file upload. The application stores the type's id and the answers.
- **The application page** (`ApplicationPage`, `ReviewReport`) is a record page: what's needed to act up front, the
  rest a tab away. The reader is the homeowner, or the committee when an administrator opens someone else's
  application (the role switcher's role), and every heading and sentence is worded for that reader. On a wide screen
  the review fills the main column and a side column holds the one thing to do now and the application's details;
  on a narrow one the side column follows the review. From the top:
  - **Back to the applications**, then the **header:** the application type, its status as a badge with a colored dot
    (a decision takes its outcome's color), and the homeowner's description.
  - **Verdict card:** the recommendation in plain words beside a tinted icon ("More information needed" for the
    homeowner, "Request more information" for the committee) with one sentence of why, written by code from the action
    items ("Your packet doesn't yet show 11 things the rules ask for."), so it never mixes in rule titles or citations.
    Under it, one muted line says when the review ran; a provisional review says so, with "What this means" on demand.
    Then the counts it rests on, each a tile: what's missing, what doesn't meet the rules, what's left to the
    committee (each jumps to its group), and the rules met out of those that apply to the project (it opens the
    matrix). Once the committee decides, its decision and note take the recommendation's place, with the
    recommendation in the muted line.
  - **Tabs:** Overview, Rules (the rule matrix), Facts (what the review read from the packet: the facts per entity,
    with evidence and confidence, so a misread can be corrected before submitting), Summary (the review's written
    summary, rule markers as `RuleReference`s), Files and History (every review, the latest marked), each with its
    count.
  - **Overview:** the action items as a card per group, ordered by what changes the outcome: what to provide, what to
    change (as "possible conditions" when the review recommends conditions), what the committee decides itself; a
    denial puts the changes first. A group's header has its outcome's icon and its count. Each item is one line in the
    writer's words (rule markers as plain titles); opening it shows its rule as a `RuleReference` and the parts it
    covers, each opening the finding sheet. A group shows its first five items and "Show N more"; suggestions, which
    don't affect the decision, start hidden. With nothing to do, the page says so.
  - **One primary action,** in the side column: the homeowner adds files while information is missing (the review runs
    again; submitting anyway asks for confirmation) and otherwise submits to the committee; the committee records its
    decision, each outcome a choice card, the one that follows the recommendation marked "Recommended by the review"
    and preselected (none for a referral), with "Start from the review's next steps" to draft the note. Under it, the
    details: project type, started, submitted, reviewed (provisional or not), decided, and the number of files.
  - **Files:** each packet file as an attachment with what the review made of it. It opens in a new tab (a PDF or photo
    shows in the browser; anything else is saved) and saves from its download action, both served by
    `/files/applications/$applicationId/$fileId` to the homeowner who made the application and to administrators. The
    homeowner can remove a file and run the review again.
- **Rule matrix** (`ReviewMatrix`), under the Rules tab. It's the whole review at a glance: every
  selected rule against every part of the project.
  - **Rows** are rules, grouped by their main citation's provision (5.3, 5.4, 5.5…), each a `RuleReference` linked to
    its citation.
    **Columns** are the entities from subject identification (left side run, right side run, rear run, return run,
    gate) plus a column for the application itself (signatures, checklist, form).
  - **Cells** are outcome chips: met, not met, missing, committee, suggestion, exempt, or a muted "n/a" when the rule
    doesn't apply to that entity (its subject is another type, or `appliesWhen` is false).
  - **Opening a cell** (or a part under a next step) shows the finding in a side sheet: the rule's statement and the
    provision's text; the reason; then every fact the rule read, each marked by where it came from: **read from your
    packet** (with the page, the quote, a thumbnail for photos and the model's confidence), **matched** (a stated value
    matched to a listed one, with the match score when it was fuzzy), **computed** (unit conversion, derived
    properties), or **not provided**. A judgment shows the model's answer and rationale; a document check shows each
    statement confirmed or contradicted, with its quote.
  - **Filters:** "Only what needs attention" (hides met and n/a rows), and by outcome. The column header of an entity
    opens what was identified: its type, label and the evidence that named it (the plat route, the photo).
  - **Narrow screens:** the rule column stays fixed and the entity columns scroll inside the matrix; below 480 pixels the
    matrix becomes one card per entity listing its rules with chips.
  - The sheet links back to the finding's next step ("Change in your plans: ..."), showing it if its group was
    collapsed. **Committee view:** the same, plus the rules that changed each finding and the judgment rationale.
- **`getApplicationView`** loads the review and, from the review's rules file, only the selected rules and the
  provisions they cite, as `ReviewRule { key, title, statement, citations: { provisionKey, label, documentTitle, text,
  anchors }[] }`.
- **Committee view:** the assessment replaces the homeowner feedback in the written summary.

## Expected result for the sample application

The sample packet is the first regression case. Facts read only from images are `uncertain` unless the packet states
them too.

**Entities** (from the route marked on the plat map):

| Id | Type | Label | Location | Boundary with |
| --- | --- | --- | --- | --- |
| `work-1` | `work` | Replace the fence | | |
| `run-1` | `fence-run` | Left side run | side | another lot |
| `run-2` | `fence-run` | Right side run | side | another lot |
| `run-3` | `fence-run` | Rear run, along the permanent open space tract | rear | open space |
| `run-4` | `fence-run` | Short run from the left side line to the garage's front corner, holding the gate | return | none |
| `gate-1` | `gate` | Gate on the return run (`gate.fence-run` is `run-4`) | | opens to own lot |

**Facts:**

- Every run: material composite, manufacturer Trex, color River Birch (stated in the appendix); boards horizontal
  (from the "copy of the new fence" photo); lattice and arbor absent; height, length, style, post color and setback
  not stated.
- Gate: material composite, boards vertical (from the gate photo); arbor absent; not a new opening (the fence replaces
  an existing one in the same place); height and color not stated.
- Work: replaces an existing fence (stated). Owners of record conflicting: the appendix names two owners, the form one.

**Documents:**

- Project description present (in the appendix; the form's field is blank, and the form allows extra pages).
- Checklist present but not confirmed: unsigned, and it contradicts the packet twice: "No" to before photos although
  the appendix has a photo of the current fence, and "Yes" to neighbor sign-off although the neighbor form is blank.
- Owner signatures: one owner signed.
- Neighbor approval missing for both side runs.
- Application form, plot plan, photos and product specification present.

**Findings:**

| Rule | Outcome |
| --- | --- |
| 5.3 materials, 5.3.2 listed manufacturers | `met` on every run |
| 5.4.2(i) composite colors by manufacturer | `not-met` on every run: River Birch is a Frame It All color, not a Trex one |
| 5.2.1, 5.2.5 no horizontal boards | `not-met` on every run |
| 5.9.1 gate boards coordinate with the fence | `not-met`: vertical gate, horizontal fence |
| 5.4.2(iii) gate material matches | `met` |
| 5.4.2(iii) gate color matches | `missing-information`: gate color not stated |
| 5.2.2 K style | `missing-information` while the style isn't stated; another style goes to the committee through the guidelines' case-by-case clause |
| 5.4.2(iv) posts match | `missing-information`: post color not stated |
| 5.5.1(i) maximum and minimum height | `missing-information` on every run: height is required |
| 5.6.1(i) neighbor approval | `missing-information` on both side runs; `not-applicable` on the rear and return runs |
| 5.6.2(ii) front setback | `missing-information` on the return run: setback not stated; `not-applicable` on the others |
| 5.9.2 gate height without an arbor | `missing-information`: gate height not stated |
| Owner signatures, checklist | `missing-information` |
| Application form, project description, plot plan, photos, product specification | `met` |
| 5.3 no vinyl, 5.3 open metal, 5.4.1 wood finish, 5.5.1(ii) and (iii) lattice and arbor, 5.5.2, 5.6.2(i), 5.7.1, 5.9.2 with an arbor, 5.9.5 | `not-applicable` |
| Declaration 4.1 prior approval of work | `committee`, shown but not counted: it's the decision the application asks for |
| Declaration 4.3(b) plans and specifications | `met`: plot plan, photos and product specification |
| Declaration 4.3(b) harmony with the community | `committee`: a judgment, unless the model answers it confidently from the photos |
| Declaration 4.2(d) review fee paid before review | `missing-information` unless the packet shows the fee paid |

**Recommendation:** request information.

- What to provide: the height of each run, the second owner's signature, a signed and corrected checklist,
  neighbor approval for both side runs, proof of the review fee unless the packet shows it, and the style, post color,
  gate color, gate height and the return run's setback.
- What to change: a listed Trex color, vertical boards, and a gate that matches the fence.
- For the committee: harmony with the community.

A fact a rule tests that the packet doesn't state is missing information; a finding goes to the committee only through
a discretion rule, an approval it's about to give, or a judgment the model can't make confidently. The test fixture's
decisions behind these rows are in the [implementation log](implementation-log.md).

The test fixture for this case is built from the committed sample rulebook and these facts, not from the packet, so it
carries no personal data.

## Project types

An organization's project types are its own data (D1 `project_types`), not a catalog in code: what a homeowner picks
when starting an application, kept by the administrator on `/project-types`. Each has a label, a description, a
status (`active`, or `archived`: hidden from new applications, kept for the ones that use it), the rulebook it was built
against, and a **definition** (`src/projectTypes/projectType.ts`, Zod): the subjects it covers, sections of questions
(the project once; each subject repeatable, several runs or windows) in the order homeowners see them, the documents it
asks for in checklist order, the documents the form itself provides (`formDocuments`), and the questions the rules can ask that the form leaves out (`unasked`, kept with their
wording so adding one back keeps it).

- **Questions.** Each has its wording, help, an answer type (text, long text, an amount with its unit and dimension, a
  count, one choice, several choices, yes or no, a date, a time), an example for text, whether it's required, and the
  passages it cites (`citations`). **A question's citations are what its answer is checked against.** Underneath, a
  question is bound (`binding`: the property a rule tests, its answer type and values from the vocabulary) or not
  (`binding: null`), and code alone decides which (`src/projectTypes/bind.ts`, `bindDefinition`, run on every change in
  the editor and on every save): a question whose citations include a passage of the rules testing a detail its answer
  type can give (the same kind; an amount of the same dimension; a choice naming at least one of the rulebook's values
  by value or label, the rest becoming its own) is bound to that detail, the one closest to its wording when several
  fit and never one another question answers; a bound question stays bound while its type fits and its citations keep
  one of those passages (or are the rules' own); removing the last such citation or changing to a type that can't give
  the detail unbinds it, and citing again or changing back binds it again. Bound answers about the project are facts
  (`answerReadings`). Every answer is on the packet's "Application form answers" page with its question, its help and
  the passages it cites by name, and the review selects the rules citing those passages whatever the request's
  entities (`selectRules`, `cited`) and tells the facts stage which questions to read their details from
  (`askedInForm` on the plan), so code verifies what it reads against the quoted answer. An answer nobody cites is
  context the rules ignore and the committee sees; an answer the review can't read is context, never a failure.
- **Built by code** (`src/projectTypes/build.ts`): the rules a project of these subjects selects, their fact plan and
  their document checks. Questions are worded by code (`fallbackQuestion`: "What is the fence run's height?", "What
  kind of work is it?", "Is the project built to a pre-approved plan?") until the administrator rewords them. A
  property no rule checks at application reads (only exemptions the association grants, or deadlines after approval,
  read it; a prohibition with no check is decided by its condition, so what it reads is asked) is usually known by
  the association: it's kept aside, offered under that heading in Add question. A label that starts with the
  subject's name doesn't repeat it ("gate height" of a gate: "What is the gate's height?"). A document check the
  application form meets (a core form document or a refinement of one, needing no signature) is a form document, never
  an upload; an upload that must be signed says by whom ("Application form signed by every Owner").
  `bindDefinition` checks every saved definition against the rules again: a bound question whose detail no rule tests
  any more and a rule document no rule requires are dropped; other questions and the administrator's own documents are
  kept as written. Every
  newly linked citation must be a provision of the published rulebook; one a rebuild removes stays, flagged in the
  editor.
- **The editor** (`ProjectTypePage`): each question rendered exactly as homeowners see it (`QuestionField`, shared
  with the homeowner form), one info button for long help, its citations on a quiet line, a drag
  handle (dnd-kit, keyboard sensor and announcements) and a menu (edit, required or optional, remove with undo).
  Changes save as they're made. "Add question" suggests what the rules check and always lets the administrator write
  their own (a "File upload" answer becomes a document requirement); "Add document" suggests what the rules require and
  always lets them create their own (name, what it must show, required, accepted file formats, citations). The edit
  dialog is a plain form builder: nothing in it names bindings, links or how the review uses an answer, and the
  answer type is a select of every type. Each citation in the edit dialogs is a link that opens the reader in the sheet
  over the editor, beside its own remove button.
- **Choices of a bound question.** The rules give the list, and the administrator shapes it like any other:
  they show or hide each of the rulebook's values, add their own (`isAdded`; marked "Added" in the dialog only),
  rename or remove those, reorder the whole list by its drag handles, and allow "Other", which gives homeowners a short
  box to describe their answer (on by default when the rulebook's set is open). A rulebook can name only some values
  and leave one implicit (front and sides, not the back): the administrator adds it. An added choice is stored with a
  key made from its label when it's added (unique among the property's values, kept on rename); one whose label
  repeats a rulebook value is refused ("show it instead"). Code never adds choices, and a rebuild keeps the added ones,
  the order and the Other setting, dropping only rulebook values the rules no longer list.
- **How added choices are evaluated.** The answers page shows an added choice by its label and an Other answer as
  "Other: <the homeowner's words>". An added choice reaches the facts as a value of its own (`asWritten: "value"`,
  normalized to `{ type: "value", term: null, text: label }`), never matched to the rulebook's values however close
  its words, so the engine compares it with nothing: a rule limiting listed values (front or side) doesn't apply to
  it, a rule permitting only listed values (wood, composite or metal) fails it, and `!=` holds. An Other answer
  (`asWritten: "description"`) is no value a rule can test: its fact is `uncertain`, the words its only reading (a
  text candidate). A finding the engine can't settle only because of such descriptions goes to the committee with the
  words ("location described as “by the shed”") instead of asking the homeowner again; a finding met either way stays
  met, and one that also lacks another detail still asks for it (`src/engine/unlistedValues.test.ts`).
- **The homeowner form**: the project type as cards, a description, the sections in order (amounts in the shared
  quantity inputs by dimension, in the organization's unit system, `HoaSettings.unitSystem`), and one drop zone for
  files, each file marked as one of the documents (guessed from its name only when clear) against a checklist that
  names what's still missing. Each question's info button holds its help and, quietly, why it's asked: the rules that
  read it and its citations, opening in the document reader in a new tab.
- **Suggested by a model** (`hoa-project-type-suggestion`): it reads the published rulebook as it applies to
  applications and proposes types with a homeowner-facing description, the fields to ask and the rules they rest on.
  Code keeps only subjects the rules apply to, fields those rules test, rule keys that exist, and every document the
  rules require (`checkSuggestions`); the administrator adds or dismisses each. Rewording questions with a model is
  deferred.
- **Requirements**: a type's page lists every rule the published rulebook applies to that kind of project
  (`projectRequirements`), behind a disclosure; a document rule the application form meets says so.
- **Out of date**: a type records the rulebook it was built against (`rulebookId`). Published rulebooks never change,
  so a type is out of date exactly when a newer rulebook is published. Code works out what that changes for the form,
  with no model (`src/projectTypes/updates.ts`, `rulebookChanges`): the form the earlier rulebook builds against the
  one the published rulebook builds, applied to the stored form. It finds questions the rules now ask or no longer
  ask, answers and choice lists that changed, cited passages the rulebook no longer has, documents the rules now
  require, no longer require or want to show more, and the administrator's edits that now conflict (an added choice
  the rulebook now lists). The list of types says it in one quiet line ("Out of date with the rulebook published Oct
  12"); the type's page shows a callout with a one-sentence summary and "Review updates", a dialog where each change is
  accepted or the administrator's version kept ("Accept all" for the lot), then saved (`applyChanges`,
  `applyProjectTypeUpdates`). Kept, a question stays as worded (its citations still decide what it's checked against),
  a document becomes the administrator's own, a missing passage stays cited, and a new question or document stays out
  of the form, offered by Add question or Add document. The administrator's own questions and documents, wording,
  added choices, order, required flags and citations survive either way. Until then, edits are bound against the
  rulebook the type was built with, homeowners apply with the saved form, and a cited passage the published rulebook
  doesn't have is left out of their "Why we ask"; reviews of applications already submitted are untouched. The
  committee's dashboard says how many active types need updating, with a link.
- **Delete or archive**: from the list's or the page's menu. A type no application uses can be deleted after a
  confirmation naming it; for one in use, the confirmation offers archiving instead (hidden from new applications,
  kept for the ones that use it). An archived type offers Unarchive.
- **In the review**: the type's label and description go to subject identification as `projectKind`; the answers become
  a page of the packet, so classification, identification, facts and the document review read and cite them.
  Repeated items are left to the models to match to the entities they name.

Nothing here grows with customers: the code walks rules and vocabulary, one prompt serves every organization, and
each organization's types live in its own rows.

## Sample cases in the proof of concept

The proof of concept covers two project types whose rules come from different documents, so neither shapes the
pipeline alone:

| Type | Rules from | What it exercises |
| --- | --- | --- |
| Fence | Mostly the Design Guidelines (Article 5), plus Declaration Article 4 | Many items of one type (runs) plus a gate referencing one; `table` and `test` checks with units; neighbor sign-off documents; committee discretion |
| Garage enclosure | The Declaration and Use Restrictions only: Exhibit C (a)(vii) and Article 4 | One space being converted; approval checks with either-or approvers (the Reviewer or the Board); a required document with a stated purpose (plans for a replacement garage); a judgment (harmony with the community); a fee requirement; the committee's own deadlines; the variance discretion |

## Expected result for a garage enclosure

There's no real packet for this type, so the regression case is a **synthetic packet**, written for the purpose and
committed under `samples/garage-enclosure/`: an application form, a description ("convert the attached two-car garage
into a family room"), a floor plan and an exterior elevation, no plans for a replacement garage, and the review fee
paid.

**Entities:** `work-1` (the conversion) and `space-1`, a `space-conversion` of the garage to finished living area.

**Findings:**

| Rule | Outcome |
| --- | --- |
| Use Restrictions (a)(vii) replacement garage plans | `missing-information` (`provide-document`): no plans for a replacement garage |
| Use Restrictions (a)(vii) garage enclosure approved by the Reviewer or the Board | `committee`, not counted: the decision being asked for |
| Use Restrictions (a)(vii) no conversion without the Board's authorization | `not-applicable`: a garage enclosure is governed by the Reviewer rule instead |
| Declaration 4.1 prior approval of work | `committee`, not counted |
| Declaration 4.3(b) plans and specifications | `met`: floor plan and elevation present |
| Declaration 4.3(b) harmony with the community | `committee`: a judgment the model can't make confidently from an elevation alone |
| Declaration 4.2(d) review fee paid before review | `met` |
| Declaration 4.3(b) the committee responds in writing within its deadline | `pending`, about the committee, not counted |

**Recommendation:** request information. What to provide: plans for a replacement garage. For the committee: harmony
with the community.

**Variants:** with replacement garage plans (refer to the committee, for harmony). The replacement garage's plans
are supporting evidence: the document that satisfies (a)(vii)'s requirement, and a condition the Reviewer may attach to
approval. The new garage isn't an entity or a second item of work in this application; it gets its own review when
the homeowner applies to build it, and only a homeowner who explicitly asks to approve both together has two items of
work. So the entities stay `work-1` and `space-1`. Converting an attic instead
(the Board's authorization under Exhibit C (a) is required and counts, so refer to the committee); fee not paid
(request information).

## Quality

The review is measured on the cases `pnpm eval:review` runs: the synthetic garage enclosure packets above and the fence
packet's case ([evaluation.md, Review cases](evaluation.md#review-cases)). Code scores entities, facts, documents,
normalization, evidence verification, findings per rule and entity, the recommendation and the action items; the
coding agent judges the writer's faithfulness and clarity from each case's `writer.md`
([evaluation.md, Judging by the coding agent](evaluation.md#judging-by-the-coding-agent)). Tuning and measurement use
separate cases, and the fence is held out from prompt tuning
([evaluation.md, Tuning and measurement](evaluation.md#tuning-and-measurement)). The facts stage's corrections go to
the Langfuse dataset `entity-facts` ([Recognition](#recognition)).
