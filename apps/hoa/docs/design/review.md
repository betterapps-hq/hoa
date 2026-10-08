# Application review

How a homeowner's application packet is checked against the HOA's published rulebook. The pipeline separates **reading**
(models turn files into facts) from **judging** (code checks facts against typed rules and applies the decision policy).
Models also judge qualitative rules and write the feedback, but they never choose the recommendation. A single prompt
that reads, compares and decides at once is what the prototype used, and it's the hardest thing to test or trust.

## Stages

Submitting an application starts the `ApplicationReview` workflow ([platform.md](platform.md#workflows)). Stage ids are
also the Workflow step names and the job's `stage` values.

| # | Stage id | Output | Who does it |
| --- | --- | --- | --- |
| 1 | `resolve-prompts` | Prompt versions stored on the job | Code |
| 2 | `ocr` | Page records for every file, including images extracted from Word files ([ocr.md](ocr.md)) | Code and OCR |
| 3 | `visuals` | Descriptions of figures and images | Vision model |
| 4 | `classify` | A kind for each page and file (`ApplicationFileKind`) | Small model |
| 5 | `facts` | Components, facts and answers to text conditions, with evidence | Main model, with images |
| 6 | `documents` | A status for each required document | Main model |
| 7 | `evaluate` | One finding per applicable rule and component | Code, or a model for qualitative checks |
| 8 | `decide` | Recommendation and action items | Code: the decision policy |
| 9 | `write` | Committee assessment, homeowner feedback, phrased action items | Main model, from findings only |
| 10 | `save-review` | Review record in R2 and D1; application `reviewed` | Code |

### 5. Facts

The model receives every page's text with page markers, the visual descriptions, and the images themselves (photos,
product shots, the plot plan), plus the homeowner's typed description. For each catalog attribute it also receives the
rulebook's canonical values and aliases, so it can map what the homeowner wrote onto them.

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
```

- `inferred` covers values read from a drawing or photo rather than stated in text, such as the fence route on a plot
  plan or board orientation in a product photo.
- `none` means the feature isn't part of the project: no lattice, no arbor, no gate. Presence attributes (`hasLattice`,
  `hasArbor`) are `none` when the packet describes the project and never mentions the feature.
- `conflicting` covers contradictions, such as a checklist answering "No" to before photos when the packet includes
  one.
- `valueMatch`: `canonical` when the value matched a listed value or alias ("Winchester Gray" to Winchester Grey);
  `unlisted` when it's clearly a different value; `uncertain` when it might be a variant the model can't place.

The same call answers each `text` condition in the rulebook (`true`, `false` or `unknown`, with evidence), so no rule
needs a separate model call just to decide whether it applies.

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

The model receives the classified pages, checkbox states, the owners of record, and each required document's
definition and `mustState` ([rules.md](rules.md#document-requirements)). A `required-document` check is met when the
status is `present` with no problems.

### 7. Evaluate

Rules are evaluated once per application (`appliesTo: "project"`) or once per matching component. `appliesWhen`
conditions are decided from facts first: a condition on a fact that's `none` makes the rule not applicable; a condition
on a required attribute that's `not-provided` makes the finding `unclear`.

| Check | Evaluation |
| --- | --- |
| `allowed-values`, `prohibited-values` | Compare canonical values. `unlisted` counts as outside every list; `uncertain` is `unclear` (ask the homeowner to confirm the product). A value outside an `allowed-values` list with `otherwise: committee` is `needs-committee`. |
| `allowed-values-by` | Look up the key attribute's row, then compare as above; an unknown key follows `unknownKey`. Trex in River Birch is `not-met`. |
| `range` | Sum the attributes in the catalog unit and compare. |
| `matches` | Canonical values are equal. |
| `required-fact` | Met when the fact is `stated` or `inferred`. |
| `required-document` | From the Documents stage. |
| `qualitative` | One model call per rule and component, with the relevant facts and evidence pages. `met` stays `met`; `not-met` or `unclear` becomes `needs-committee` with the model's explanation, so a model's judgment never drives the recommendation by itself. |
| `informational` | Not evaluated; passed to the writer. |

When a typed check's attribute is `not-provided`: if the catalog marks it `isRequiredForReview`, the finding is
`unclear` (the homeowner must supply it); otherwise it's `needs-committee` (the committee should verify it).

A failing check becomes `needs-committee` instead of `not-met` when the rule is `recommended` ("should"), when its
`discretion` is `committee`, or when it lists free-text exceptions that might apply.

```ts
type Finding = {
  id: string
  ruleId: string
  componentId: string | null
  status: "met" | "not-met" | "unclear" | "needs-committee" | "not-applicable"
  explanation: string
  evidence: Evidence[]
  decidedBy: "code" | "model"
}
```

### 8. Decide

The recommendation comes from a policy in code, not from a model, so the same findings always give the same answer:

1. Any `unclear` finding, or any required document that's missing, incomplete or unreadable: **request information**.
   Completeness comes first (the sample guidelines review only complete applications, 3.1.5). Unmet rules are still
   listed as changes, so the homeowner fixes everything in one resubmission.
2. Otherwise, any `not-met` finding: if every unmet rule `isCurable` and the HOA's `curableOutcome` is
   `approve-with-conditions` (the default), **approve with conditions**, with the changes as conditions. Otherwise
   **reject**, listing the changes. Unmet rules are noted as needing a variance where the governing documents allow
   one (in the sample, CC&R 4.5, with the Board's written consent).
3. Otherwise: **approve**.

`needs-committee` findings never change the recommendation. They're listed as decisions for the committee in every
outcome. Because findings are per component, the committee can still approve part of an application (CC&R 4.3(b)),
which it records as its decision.

Code builds the action items from findings: one per unmet rule (`changes`), per unclear finding or document problem
(`missingInformation`), and per `needs-committee` finding (`committeeDecisions`). The writer only phrases them.

### 9. Write

The writer receives the findings with their rules and citations, the facts, the recommendation, the action items and
the informational rules. It produces the committee assessment, the homeowner feedback and a phrasing for each action
item. It can't add findings or items. Feedback cites rules by section and says exactly what to change or provide.

## The review record

```ts
type Recommendation = "approve" | "approve-with-conditions" | "request-information" | "reject"

type ActionItem = { id: string; findingIds: string[]; text: string } // chosen by code, phrased by the writer

type Review = {
  id: string
  applicationId: string
  rulebookId: string
  rulebookVersion: number
  components: Component[]
  facts: Fact[]
  documents: DocumentStatus[]
  findings: Finding[]
  recommendation: Recommendation
  changes: ActionItem[] // the conditions, when the recommendation is approve-with-conditions
  missingInformation: ActionItem[]
  committeeDecisions: ActionItem[]
  assessment: string // for the committee
  feedback: string // for the homeowner
  promptVersions: Record<string, number>
  costUsd: number // sum of the job's model calls
  durationMs: number
  sessionId: string // the job id; the UI links to the Langfuse session
  createdAt: string
}
```

`Recommendation` matches the prototype's `src/review/review.ts`. The full record is stored in R2; D1's `reviews` row
holds the recommendation, cost and session for lists. When the staged review ships, the prototype's
`hoa-application-review` prompt and its fallback text are removed from `src/ai/prompts.ts`, and the Langfuse prompt is
archived.

## Errors

See [platform.md](platform.md#errors-and-retries) for retry policy. Within a review:

- A file Layout can't read becomes an `unreadable` file, and any requirement it was meant to satisfy is `unreadable`,
  which leads to request information.
- A qualitative call that fails after retries becomes `needs-committee` with "automatic check failed".
- A failure in `facts`, `documents` or `write` fails the review: the application is `failed` with the error, and the
  page offers **Retry**, which re-runs the workflow with completed model calls answered from the cache.

## Prompts and models

| Prompt | Trace name | Model setting | Variables | Output |
| --- | --- | --- | --- | --- |
| `hoa-file-classification` | `file-classification` | `OPENROUTER_SMALL_MODEL` | `pageText`, `visualDescription`, `checkboxCount`, `fileKinds` | `{ kind: ApplicationFileKind }` |
| `hoa-fact-extraction` | `fact-extraction` | `OPENROUTER_MODEL` | `projectType`, `catalog`, `allowedValues`, `textConditions`, `description`, `pages`, plus images | `{ components: Component[]; facts: Fact[]; conditions: { conditionId: string; answer: "true" \| "false" \| "unknown"; evidence: Evidence[] }[] }` |
| `hoa-document-check` | `document-check` | `OPENROUTER_MODEL` | `requirements`, `ownersOfRecord`, `pages`, `checkboxes` | `{ documents: DocumentStatus[] }` |
| `hoa-qualitative-check` | `qualitative-check` | `OPENROUTER_MODEL` | `criterion`, `ruleStatement`, `component`, `facts`, `evidencePages` | `{ status: "met" \| "not-met" \| "unclear"; explanation: string; evidence: Evidence[] }` |
| `hoa-review-writer` | `review-writer` | `OPENROUTER_MODEL` | `recommendation`, `findings`, `facts`, `actionItems`, `informationalRules` | `{ assessment: string; feedback: string; items: { id: string; text: string }[] }` |

Visual descriptions use `hoa-visual-description` ([ocr.md](ocr.md#prompts-and-models)). Every call is traced with the
job id as its session, and application stages record summaries rather than content ([documents.md](documents.md#privacy-and-retention)).
Model settings are fallbacks; a prompt version's `config.model` takes precedence.

## Expected result for the sample application

The sample packet is the first regression case. Facts read from images are `inferred`; the product photo may be
illustrative, which is exactly what the committee should check.

- **Components:** two side runs on lot lines shared with neighboring Units, one rear run along the permanent open space
  tract, and one gate near the front corner of the garage (from the route marked on the plot plan).
- **Facts:**
  - material composite, manufacturer Trex, color River Birch (stated in the appendix);
  - board orientation horizontal (inferred from the appendix's "copy of the new fence" photo);
  - gate composite with vertical boards (inferred from the appendix's gate photo);
  - replaces an existing fence at the same location (stated);
  - owners of record: two (conflicting: the appendix names two owners, the form names one);
  - height, length, product line, post color and gate size not provided; lattice and arbor none.
- **Documents:**
  - project description present (in the appendix; the form's field is blank, and the form allows extra pages);
  - checklist incomplete (unsigned), and it answers "No" to before photos although the appendix includes a photo of the
    current fence (contradicts packet);
  - owner signatures incomplete (one of two owners signed);
  - neighbor approval missing for both side runs (the neighbor form is blank);
  - plot plan and photos present.
- **Findings:**
  - 5.3 material and 5.3.2 manufacturer met;
  - 5.4.2 color not met: River Birch isn't a Trex color (it's listed for Frame It All);
  - 5.2.5 horizontal style not met on every segment;
  - 5.5.1 height unclear on every segment (height is required for review);
  - 5.4.2(iii) gate match needs committee (gate color isn't given, and isn't required); 5.2.2 K style needs committee;
    5.6.2(ii) setback needs committee (the plot plan places the gate near the front of the garage);
  - 5.1 and CC&R 4.3(b) informational.
- **Recommendation:** request information (fence height, the second owner's signature, a signed checklist, and neighbor
  approval for the side runs), naming the color and the horizontal style as changes to make before resubmitting.

## Privacy

Application packets contain homeowners' names, addresses and signatures. They're stored privately per HOA, never used
as model training data, kept only as long as the HOA's retention setting, and traced in Langfuse as summaries without
page text or personal quotes ([documents.md](documents.md#privacy-and-retention)).
