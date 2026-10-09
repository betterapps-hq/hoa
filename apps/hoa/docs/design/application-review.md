# Application review

> **Spec, not built.** Replaces the first build's review pipeline. Reads the rulebook [encoding.md](encoding.md) produces and
> evaluates it as [schema.md, Evaluation](schema.md#7-evaluation) defines. The tasks that build it are in
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
| 3 | `ocr` | as today | Page records, figures and visual descriptions for every file | Code, OCR, vision model |
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

Model results are cached per application as today, so re-running after adding one file pays only for what changed.

### 2. Load

The application's organization must have a published rulebook. `load` reads its rules file from R2, checks the SHA-256
against D1, and parses it with `rulesFile`. A 2 MB file parses in milliseconds; nothing is preloaded.

**The request.** An application is an `architectural-application` request. Its governing date is the submission date
(the request type's `governingDate`, `architectural-application.submitted-on`). A review before submission uses the
evaluation date and is marked provisional, as the first build did.

### 4. Classify

One small-model call per page with `hoa-page-classification`. The choices are the rulebook's document types (things of
nature `document` that document checks name, such as `neighbor-approval-form` and `site-plan`) plus generic kinds
(`application-form`, `photo`, `product-specification`, `drawing`, `other`), each with its labels and definition. The
page's visual descriptions go in as context, as today.

### 5. Subjects

`hoa-subject-identification` reads the packet and names the things the application is about. Its choices are the
**candidate types**: every thing or category that a rule in the request type applies to, plus the things those can
reference (a gate references its fence run), each with labels, definition and its referencing properties. For the
sample rulebook that's about ten types and 2,000 tokens.

It returns entities:

```ts
type SubjectsOutput = {
  entities: { id: string; type: TermKey; label: string; evidence: Evidence[] }[] // "run-1", "fence-run", "Left side run"
}
```

Code always adds `request` (the application), `lot` and `community`, and one `work` entity for the project when the
model didn't name one. An entity of a type outside the candidates is dropped with a warning on the job.

The homeowner's project kind (see [UX](#ux)) and description are hints in the prompt, never filters.

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
the entities with their labels, and its slice of the plan.

The model returns, per entity and property: the state (`known`, `absent`, `conflicting`, `uncertain`), the value as
written (`stated`, such as "6'" or "River Birch"), its reading of the value, every source as evidence (file, page,
quote, figure), and a confidence. It also answers the text conditions. It never guesses a property it has no evidence
for; no answer means unknown.

### 9. Normalize

Code turns stated values into typed `FactValue`s:

- **Quantities** with the quantity grammar ([Language processing](#language-processing)): `6'`, `6 ft`, `72"`, `6'-0"`,
  `six (6) feet`, `72 inches`. The unit labels come from the rulebook's unit terms. A value that doesn't parse is
  `uncertain`.
- **Choices** against the property's value terms: exact on any label, then normalized, then RapidFuzz similarity. A
  fuzzy match is kept with the matched label and its score. No match is `{ term: null }` for an open set, and `uncertain` with an `invalid-value`
  note for a complete one, as the schema requires.
- **Dates** with dateparser, in the organization's time zone and with US month-day order (`09/04/26`,
  `September 4, 2026`, `Sept. 4`).
- **References** to entity ids.

Then two checks that need no model:

- **Evidence verification:** every evidence quote is matched against its page with the existing `matchQuote`. A fact
  whose only evidence doesn't match is downgraded to `uncertain`.
- **Conflicts:** two readings of one property for one entity that disagree become `conflicting`, with both as
  candidates.

Facts below the organization's fact confidence threshold become `uncertain`.

### 10. Documents

`hoa-document-review` gets every document check among the selected rules: the document type, what it must state, who
must sign, and whether it's per subject. It also gets the parties as facts (owners of record from the packet, the
applicant) and the pages classified as those document types (or every page when none is). It returns, per check and
subject: present or not, each statement confirmed, contradicted or not found (with its quote), and the signers.

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
  normalizations: { entity: string; property: TermKey; stated: string; matchedLabel: string | null; kind: "exact" | "normalized" | "fuzzy" | "parsed" | "none"; score: number | null }[]
  judgments: { ruleKey: RuleKey; entity: string; answer: "yes" | "no" | "unclear"; confidence: number; rationale: string; evidence: Evidence[] }[]
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

## Language processing

The same tools and rules as [encoding.md, Language processing](encoding.md#language-processing), called from the
`normalize` step in one batch per review:

| Job | Tool |
| --- | --- |
| Stated values to value terms | RapidFuzz, after normalized exact matching, with the same thresholds |
| Dates | dateparser |
| Quantities | Our own grammar, in TypeScript |

**Quantities get a grammar of our own** because no library reads the forms applications use together: digits, words
("six"), the legal double form ("six (6)"), feet and inch marks (`'`, `"`, `′`, `″`), compound `6'-0"`, and ranges
("4 to 6 feet"), with unit labels from the rulebook. Pint and quantulum3 handle words and units but not feet-and-inch
marks; js-quantities and chrono-node handle neither form. The grammar's tests list every form.

## Prompts and models

| Prompt | Trace name | Model | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-visual-description` | `visual-description` | `OPENROUTER_MODEL` | as today | as today |
| `hoa-page-classification` | `page-classification` | `OPENROUTER_SMALL_MODEL` | `documentTypes`, `contextText`, `visualDescriptions`, `pageText` | `{ type: string }` |
| `hoa-subject-identification` | `subject-identification` | `OPENROUTER_MODEL` | `requestType`, `projectKind`, `description`, `candidateTypes`, `pages` | `SubjectsOutput` |
| `hoa-entity-facts` | `entity-facts` | `OPENROUTER_MODEL` | `requestType`, `description`, `entities`, `properties`, `textConditions`, `pages` | facts and condition answers, typed by the fact schema |
| `hoa-document-review` | `document-review` | `OPENROUTER_MODEL` | `requirements`, `parties`, `pages` | `{ documents: DocumentResult[] }` |
| `hoa-judgment-check` | `judgment-check` | `OPENROUTER_MODEL` | `statement`, `question`, `subject`, `facts`, `evidencePages` | `{ answer, confidence, rationale, evidence }` |
| `hoa-review-summary` | `review-summary` | `OPENROUTER_MODEL` | `recommendation`, `findings`, `actionItems`, `suggestions` | `{ assessment, feedback, items: { id, text }[] }` |

Retired with the code that calls them: `hoa-file-classification`, `hoa-fact-extraction`, `hoa-document-check`,
`hoa-qualitative-check`, `hoa-review-writer`.

## UX

The application routes keep their shape.

**Every rule reference links to its citation.** Wherever a rule appears (a matrix row, a finding, an action item, the
written summary, the committee's view), it's a `RuleReference`: the rule's title with its main citation's label
("Guidelines 5.4.2(i)"). Activating it opens `DocumentViewer` at the cited provision with the operative words
highlighted (or the region on a plat); hovering or focusing it shows the provision's text. A rule with several
citations lists the main one and "2 more". The text shown is always the stored provision, so it can't drift from the
document.

- **Start an application:** the project kind picker lists the rulebook's project kinds: categories of `work` the
  rulebook defines (the encoding conventions add one per improvement chapter of design guidelines, such as fences), and
  "Something else". The application stores the term key; it's a hint to subject identification and a label in lists.
- **`ReviewReport`:**
  - The badge and recommendation labels gain "Refer to the committee" and rename "Reject" to "Deny".
  - "What to change", "What to provide", "For the committee", and a new "Suggestions", each item naming the entities it
    covers ("Left side run, right side run").
  - Findings grouped by outcome: not met, missing information, committee, advisory, met, exempt, not applicable. Each
    shows the rule's title, its statement with term labels, the entity, the reason, and the cited provision's text
    (with "View in document" opening `DocumentViewer` at the provision).
  - "What we read from your packet": the facts per entity, with evidence (page and quote), so the homeowner can correct
    a misread before submitting.
  - Provisional reviews say so.
- **Rule matrix** (`ReviewMatrix`), shown to the homeowner and the committee above the findings list. It's the whole
  review at a glance: every selected rule against every part of the project.
  - **Rows** are rules, grouped by their main citation's provision (5.3, 5.4, 5.5…), each a `RuleReference` linked to
    its citation.
    **Columns** are the entities from subject identification (left side run, right side run, rear run, return run,
    gate) plus a column for the application itself (signatures, checklist, form).
  - **Cells** are outcome chips: met, not met, missing, committee, suggestion, exempt, or a muted "n/a" when the rule
    doesn't apply to that entity (its subject is another type, or `appliesWhen` is false).
  - **Opening a cell** shows the finding in a side sheet: the rule's statement and the provision's text; the reason;
    then every fact the rule read, each marked by where it came from: **read from your packet** (with the page, the
    quote, a thumbnail for photos and the model's confidence), **matched** (a stated value matched to a listed one, with
    the match score when it was fuzzy), **computed** (unit conversion, derived properties), or **not provided**. A
    judgment shows the model's answer and rationale; a document check shows each statement confirmed or contradicted,
    with its quote.
  - **Filters:** "Only what needs attention" (hides met and n/a rows), and by outcome. The column header of an entity
    opens what was identified: its type, label and the evidence that named it (the plat route, the photo).
  - **Narrow screens:** the rule column stays fixed and the entity columns scroll inside the matrix; below 480 pixels the
    matrix becomes one card per entity listing its rules with chips.
  - **Homeowner view:** a cell with an action links to its action item ("What to change: a listed Trex color").
    **Committee view:** the same matrix, plus the discretion rule behind each committee cell and the judgment rationale;
    the decision form stays below it.
- **`getApplicationView`** loads the review and, from the review's rules file, only the selected rules and the
  provisions they cite, as `ReviewRule { key, title, statement, citations: { provisionKey, label, documentTitle, text,
  anchors }[] }`.
- **Committee view:** unchanged decision form; the assessment replaces the homeowner feedback, as today.

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

## Project types in the proof of concept

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

**Variants:** with replacement garage plans (refer to the committee, for harmony); converting an attic instead
(the Board's authorization under Exhibit C (a) is required and counts, so refer to the committee); fee not paid
(request information).

## Quality

| Dataset | Item | Expected output |
| --- | --- | --- |
| `page-classification` | One page | Its document type |
| `subject-identification` | One packet | Entities with types and references |
| `entity-facts` | One packet and fact plan | Facts per entity and property |
| `document-review` | One packet and its document checks | Results per check and subject |
| `judgment-check` | One rule, subject, facts and evidence | The answer |
| `review-decision` | Facts, documents, judgments and a rules file | Findings, recommendation and action items (code only) |
| `review-summary` | Findings and action items | None: scored by judges for faithfulness and clarity |

Application variants start from the redacted compliant baseline, as [evaluation.md](evaluation.md) describes, and each
changes one thing (a River Birch color, horizontal boards, a missing neighbor form, an 84-inch rear run).

Scores: entity accuracy (type and count), fact accuracy per property, normalization accuracy, evidence verification
rate, finding outcome accuracy per rule and entity, recommendation accuracy, and the writer's faithfulness.
