# Application review

How a homeowner's application packet is checked against the HOA's published rulebook. The pipeline separates **reading**
(models turn files into facts) from **judging** (code checks facts against typed rules and applies the decision policy).
Models also judge qualitative rules and write the feedback, but they never choose the recommendation. A single prompt
that reads, compares and decides at once is what the prototype used, and it's the hardest thing to test or trust.

## How the review is used

The review runs **before** the application reaches the committee, so the homeowner can fix problems first:

1. The homeowner creates an application, picks the project type, describes the project and uploads the packet.
2. The review runs as soon as the files are uploaded. The homeowner sees the recommendation, every finding with its
   rule, what to change, and what information is missing.
3. The homeowner can add or replace files and run the review again, as often as they like. Each run is a new review;
   earlier ones stay listed.
4. The homeowner submits the application. Nothing blocks submitting with open requests: the page says the committee may
   deny an incomplete application, and the homeowner confirms.
5. The committee sees the same review (the latest one at submission) when it decides. Its decision can also be
   "information requested", which reopens the application for the homeowner to add files, re-run the review and
   resubmit.

Statuses and server functions are in [documents.md](documents.md#applications) and
[platform.md](platform.md#server-functions).

## Stages

`runReview` starts the `ApplicationReview` workflow ([platform.md](platform.md#workflows)). Each stage id is the job's
`stage` value while it runs, and every Workflow step name starts with its stage id.

| # | Stage id | Steps | Output | Who does it |
| --- | --- | --- | --- | --- |
| 1 | `resolve-prompts` | `resolve-prompts` | Prompt versions stored on the job | Code |
| 2 | `ocr` | per file: `ocr:hash:{fileId}`, `ocr:media:{fileId}`, `ocr:submit:{fileId}:{range}`, `ocr:poll:{fileId}:{range}`, `ocr:pages:{fileId}:{range}`, `ocr:labels:{fileId}` | Page records for every file, including images extracted from Word files ([ocr.md](ocr.md)) | Code and OCR |
| 3 | `visuals` | `visuals:{fileId}:{figureId}` | Descriptions of figures and images | Vision model |
| 4 | `classify` | `classify:{fileId}` (one call per page inside the step) | A kind for every page | Small model |
| 5 | `facts` | `facts` | Components, facts and answers to text conditions, with evidence | Main model, with images |
| 6 | `documents` | `documents` | A status for each required document | Main model |
| 7 | `evaluate` | `evaluate`, plus `evaluate:{ruleId}:{componentId}` per qualitative check | One finding per applicable rule and component | Code, or a model for qualitative checks |
| 8 | `decide` | `decide` | Recommendation and action items | Code: the decision policy |
| 9 | `write` | `write` | Assessment, homeowner feedback, phrased action items | Main model, from findings only |
| 10 | `save-review` | `save-review` | Review record in R2 and D1; application `reviewed` | Code |

Classification uses the visual descriptions, not the other way round. Model results are cached per application
([platform.md](platform.md#caching)), so re-running after adding one file only pays for what changed.

### 2. OCR and images

Files are OCR'd in parallel. A file Layout can't read becomes `unreadable` instead of failing the review.

Accepted uploads are PDF, JPEG, PNG and DOCX; images up to 5 MB each. HEIF, TIFF, BMP, WebP and GIF are refused at
upload with a message asking for JPEG or PNG. An image inside a Word file in any other format (EMF or WMF drawings, for
example) is stored as `unreadable` with "unsupported image format".

For a Word file, `ocr:media` walks `word/document.xml` for embedded pictures in document order, resolves each through
`word/_rels/document.xml.rels`, and stores each JPEG or PNG as a derived application file with its `ordinal` and
`contextText`, the paragraph just before it. In the sample appendix that context is what says which photo is the
current fence, which is the proposed product, which is the gate, and which is the plat map.

### 5. Facts

The model receives every page's text with page markers, the visual descriptions, the images themselves with their
context text (at most 20 images per call, in packet order; any beyond that are passed as descriptions only), and the
homeowner's typed description. For each catalog attribute it also receives the rulebook's canonical values and aliases,
so it can map what the homeowner wrote onto them.

```ts
type Component = { id: string; kind: ComponentKind; label: string } // "segment-1", "Left side run"

type Evidence =
  | { source: "file"; fileId: string; pageIndex: number; quote?: string; figureId?: string; description?: string }
  | { source: "description"; quote: string } // the homeowner's typed description

type Fact = {
  attribute: string // catalog key, "segment.height"
  componentId: string | null // null for project attributes
  value: string | number | boolean | null // canonical value when one matched; numbers in the catalog unit
  rawValue: string | null // as written, "Trex Transcend, River Birch"
  valueMatch: "canonical" | "unlisted" | "uncertain" | null // for attributes with listed values
  status: "stated" | "inferred" | "not-provided" | "none" | "conflicting"
  evidence: Evidence[]
}

type ConditionAnswer = {
  conditionId: string // a text condition's id from rules.md
  componentId: string | null // one answer per applicable component
  answer: "true" | "false" | "unknown"
  evidence: Evidence[]
}
```

- `inferred` covers values read from a drawing or photo rather than stated in text, such as the fence route on a plot
  plan or board orientation in a product photo.
- Presence attributes (`hasLattice`, `hasArbor`, `isNewOpening`) are booleans. When the packet describes the project
  and doesn't mention a lattice, `hasLattice` is `false` (`inferred`).
- `none` is only for attributes of a feature that isn't part of the project: `latticeHeight` when `hasLattice` is
  `false`, or a gate attribute when there's no gate.
- `conflicting` covers contradictions, such as the form naming one owner while the appendix names two.
- `valueMatch`: `canonical` when the value matched a listed value or alias ("Winchester Gray" to Winchester Grey);
  `unlisted` when it's clearly a different value; `uncertain` when it might be a variant the model can't place.

The same call answers each text condition in the rulebook, once per applicable component, so no rule needs a separate
model call just to decide whether it applies.

### 6. Documents

```ts
type DocumentStatus = {
  requirement: DocumentRequirement["id"]
  componentId: string | null // for per-segment requirements such as neighbor approval
  status: "present" | "missing" | "incomplete" | "unreadable"
  problems: ("blank" | "unsigned" | "missing-signer" | "missing-statement" | "contradicts-packet")[]
  signers: string[] // roles, not names: "applicant", "co-owner", "neighbor"
  evidence: Evidence[]
}
```

The model receives the classified pages, checkbox states, the owners of record, and each applicable `required-document`
rule with its component (so it knows which side runs need neighbor approval) and its `mustState`
([rules.md](rules.md#document-requirements)).

### 7. Evaluate

Rules are evaluated once per application (`appliesTo: "project"`) or once per matching component. Conditions are decided
first, then the check, with these semantics:

| Situation | Result |
| --- | --- |
| A condition on a `none` attribute | The rule doesn't apply (`not-applicable`) |
| A condition on a `not-provided` attribute | `unclear` if the attribute is required for review, otherwise `needs-committee` |
| A condition or check on a `conflicting` fact | `unclear`, with each value as evidence |
| A text condition answered `unknown` | `needs-committee` |
| A check on a `not-provided` attribute | `unclear` if the attribute is required for review, otherwise `needs-committee` |
| A `none` addend in a `range` sum | Counts as 0 |
| `allowed-values`, `prohibited-values` | Compare canonical values. `unlisted` is outside every list; `uncertain` is `unclear` (confirm the product). Outside a list with `otherwise: committee` is `needs-committee`. |
| `allowed-values-by` | Look up the key attribute's row, then compare as above; an unknown key follows `unknownKey`. Trex in River Birch is `not-met`. |
| `range` | Sum in the catalog unit and compare |
| `matches` | Canonical values are equal |
| `required-fact` | `met` when `stated` or `inferred`, otherwise `unclear` |
| `required-document` | `met` when the document is present with no problems, otherwise `unclear`; never `not-met` |
| `qualitative` | One model call per rule and component. `met` stays `met`; `not-met` or `unclear` becomes `needs-committee` with the model's explanation, so a model's judgment never drives the recommendation by itself. A call that fails after retries is `needs-committee` with "automatic check failed". |
| `informational` | Not evaluated; passed to the writer |

A failing check becomes `needs-committee` instead of `not-met` when the rule is `recommended` ("should"), when its
`discretion` is `committee`, or when it lists free-text exceptions that might apply. The same downgrade applies to
`unclear` on a recommended or committee rule.

```ts
type Finding = {
  id: string
  ruleId: string
  componentId: string | null
  status: "met" | "not-met" | "unclear" | "needs-committee" | "not-applicable"
  explanation: string
  evidence: Evidence[]
  documentProblems: DocumentStatus["problems"] // for required-document findings
  decidedBy: "code" | "model"
}
```

### 8. Decide

The recommendation comes from a policy in code, not from a model, so the same findings always give the same answer:

1. Any `unclear` finding: **request information**. Unmet rules are still listed as changes, so the homeowner can fix
   everything at once.
2. Otherwise, any `not-met` finding: if every unmet rule `isCurable` and the HOA's `curableOutcome` is
   `approve-with-conditions` (the default), **approve with conditions**, with the changes as conditions. Otherwise
   **reject**, listing the changes. Unmet rules are noted as needing a variance where the governing documents allow
   one (in the sample, CC&R 4.5, with the Board's written consent).
3. Otherwise: **approve**.

`needs-committee` findings never change the recommendation. They're listed as decisions for the committee in every
outcome. Because findings are per component, the committee can still approve part of an application (CC&R 4.3(b)).

Code builds the action items: one `changes` item per unmet rule, one `missingInformation` item per `unclear` finding
(with its document problems as detail), and one `committeeDecisions` item per `needs-committee` finding. The writer
only phrases them.

### 9. Write

The writer receives the findings with their rules and citations, the facts, the recommendation, the action items and
the informational rules. It produces an assessment for the committee, feedback for the homeowner and a phrasing for each
action item. It can't add findings or items. Feedback cites rules by section and says exactly what to change or provide.

## The review record

```ts
type Recommendation = "approve" | "approve-with-conditions" | "request-information" | "reject"

type ActionItem = { id: string; findingIds: string[]; text: string } // chosen by code, phrased by the writer

type Review = {
  id: string
  applicationId: string
  jobId: string
  rulebookId: string
  rulebookVersion: number
  components: Component[]
  facts: Fact[]
  conditionAnswers: ConditionAnswer[]
  documents: DocumentStatus[]
  findings: Finding[]
  recommendation: Recommendation
  changes: ActionItem[] // the conditions, when the recommendation is approve-with-conditions
  missingInformation: ActionItem[]
  committeeDecisions: ActionItem[]
  assessment: string // for the committee
  feedback: string // for the homeowner
  promptVersions: Record<string, PromptVersion>
  costUsd: number // sum of the job's model calls
  durationMs: number
  sessionId: string // the job id; the UI links to the Langfuse session
  createdAt: string
}
```

The full record is stored in R2; D1's `reviews` row holds the recommendation, cost and session for lists. The
prototype's `hoa-application-review` prompt is removed from `src/ai/prompts.ts`; archive it in Langfuse.

## Errors

See [platform.md](platform.md#errors-and-retries) for retry policy. Within a review:

- A file Layout can't read is `unreadable`, and any requirement it was meant to satisfy is `unreadable`, which makes
  that document finding `unclear`.
- A failed qualitative call is `needs-committee` (above).
- A failure in `facts`, `documents` or `write` fails the review: the application keeps its status, the job is `failed`
  with the error, and the page offers **Run review again**, which answers completed model calls from the cache.

## Prompts and models

| Prompt | Trace name | Model setting | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-file-classification` | `file-classification` | `OPENROUTER_SMALL_MODEL` | `pageText`, `visualDescriptions`, `contextText`, `checkboxCount`, `fileKinds` | `{ kind: ApplicationFileKind }` |
| `hoa-fact-extraction` | `fact-extraction` | `OPENROUTER_MODEL` | `projectType`, `catalog`, `allowedValues`, `textConditions`, `description`, `pages`, plus images with their context | `{ components: Component[]; facts: Fact[]; conditions: ConditionAnswer[] }` |
| `hoa-document-check` | `document-check` | `OPENROUTER_MODEL` | `requirements` (with components), `ownersOfRecord`, `pages`, `checkboxes` | `{ documents: DocumentStatus[] }` |
| `hoa-qualitative-check` | `qualitative-check` | `OPENROUTER_MODEL` | `criterion`, `ruleStatement`, `component`, `facts`, `evidencePages` | `{ status: "met" \| "not-met" \| "unclear"; explanation: string; evidence: Evidence[] }` |
| `hoa-review-writer` | `review-writer` | `OPENROUTER_MODEL` | `recommendation`, `findings`, `facts`, `actionItems`, `informationalRules` | `{ assessment: string; feedback: string; items: { id: string; text: string }[] }` |

Visual descriptions use `hoa-visual-description` ([ocr.md](ocr.md#prompts-and-models)). Every call is traced with the
job id as its session. Model settings are fallbacks; a prompt version's `config.model` takes precedence.

## Expected result for the sample application

The sample packet is the first regression case. Facts read from images are `inferred`.

**Components** (from the route marked on the plat map):

| Id | Component | Location | Boundary with |
| --- | --- | --- | --- |
| `segment-1` | Left side run | side | unit |
| `segment-2` | Right side run | side | unit |
| `segment-3` | Rear run, along the permanent open space tract | rear | open-space |
| `segment-4` | Short run from the left side line to the garage's front corner, holding the gate | return | none |
| `gate-1` | Gate on `segment-4` | | opens to own-lot |

**Facts:**

- All segments: material composite, manufacturer Trex, color River Birch (stated in the appendix); board orientation
  horizontal (inferred from the "copy of the new fence" photo); `hasLattice` and `hasArbor` false; height, length,
  style, post color and setback not provided.
- Gate: material composite, board orientation vertical (inferred from the gate photo); `hasArbor` false;
  `isNewOpening` false (the fence replaces an existing one at the same location); height and color not provided.
- Project: replaces an existing fence (stated); owners of record conflicting (the appendix names two owners, the form
  one).

**Documents:**

- Project description present (in the appendix; the form's field is blank, and the form allows extra pages).
- Checklist incomplete: unsigned, and it contradicts the packet twice: "No" to before photos although the appendix has a
  photo of the current fence, and "Yes" to neighbor sign-off although the neighbor form is blank.
- Owner signatures incomplete (one owner signed).
- Neighbor approval missing for both side runs.
- Application form, plot plan, photos and product specification present.

**Findings:**

| Rule | Result |
| --- | --- |
| 5.3 materials, 5.3 no vinyl, 5.3.2 manufacturers | met on every segment |
| 5.4.2 composite colors | not met on every segment: River Birch is a Frame It All color, not a Trex one |
| 5.2.1, 5.2.5 no horizontal boards | not met on every segment |
| 5.9.1 gate boards coordinate | not met: vertical gate, horizontal fence |
| 5.4.2(iii) gate material matches | met |
| 5.4.2(iii) gate color matches | needs committee (gate color not given, and not required) |
| 5.2.2 K style | needs committee (style not given; a "should" rule) |
| 5.4.2(iv) posts match | needs committee (post color not given) |
| 5.5.1(i) maximum and minimum height | unclear on every segment (height is required) |
| 5.6.1(i) neighbor approval | unclear on both side runs; not applicable on the rear and return runs |
| 5.6.2(ii) front setback | needs committee on the return run (setback not given; a "should" rule) |
| 5.9.2 gate height without an arbor | needs committee (gate height not given, and not required) |
| Owner signatures, checklist | unclear |
| Application form, project description, plot plan, photos, product specification | met |
| 5.3 open metal, 5.4.1 wood finish, 5.5.1(ii) and (iii) lattice and arbor, 5.5.2, 5.6.2(i), 5.7.1, 5.9.2 with an arbor, 5.9.5 | not applicable |
| 5.1, CC&R 4.3(b) | informational |

**Recommendation:** request information. Missing information: fence height, the second owner's signature, a signed and
corrected checklist, and neighbor approval for both side runs. Changes: a listed Trex color, vertical boards, and a gate
that matches the fence. Committee decisions: gate color, K style, post color, the return run's setback and gate height.

## Privacy

The demo doesn't apply privacy controls to homeowner data: packets are stored privately per HOA and deleted after the
HOA's retention period, but model inputs and outputs, including page text, reach Langfuse in full
([documents.md](documents.md#privacy-and-retention)). Before real HOAs onboard, application stages should record
summaries only and the hosted OpenRouter workspace should use Broadcast's privacy mode.
