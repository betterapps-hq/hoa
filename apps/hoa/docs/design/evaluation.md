# Evaluation

Prompt tuning only counts when it's measured. Each model stage below has a Langfuse dataset with expected output, a
score that code computes where possible, and a regression bar that a prompt or model change must clear before it's
labeled `production` in Langfuse.

Two model stages have no dataset of their own and are measured through the stages that consume them: section structure
(through extraction recall and citation validity) and visual descriptions (through fact accuracy on inferred facts).

## Datasets

| Dataset | Item | Expected output | Source |
| --- | --- | --- | --- |
| `section-routing` | One section | Project types, topics, relevance | Sample declaration and guidelines |
| `rule-extraction` | One governing-document section | The candidate rules a careful reviewer extracts, with checks and citations | Sample fence sections, reviewed by hand |
| `rule-consolidation` | All candidates for a project type | Merges, conflicts and exception links | The gold candidates from `rule-extraction` |
| `file-classification` | One page | `ApplicationFileKind` | Redacted sample packet and variants |
| `fact-extraction` | One packet | Components, facts and text-condition answers | Redacted sample packet and variants |
| `document-check` | One packet | Document statuses | Redacted sample packet and variants |
| `qualitative-check` | One rule and component, with facts and evidence | Status | Hand-built cases |
| `review-decision` | Facts, document statuses and a rulebook | Findings, recommendation and action items | Hand-built variants; code only, no model |
| `review-writer` | Findings, recommendation and action items | None: scored by judges | Items from `review-decision` |
| `rule-corrections` | An administrator's edit or rejection | The corrected rule | Production; reviewed before it's copied into `rule-extraction` |
| `encoding-evaluation` | One split of the sample Declaration (`encoding-dev`, `encoding-test`) | The golden encoding, `samples/declaration/rules.json` | `pnpm eval:encoding:score`: one dataset run per evaluation run, a score per measure (evaluation round 1) |

The gold rulebook comes from the governing documents only: guidelines Article 5 and its exhibits, CC&R Article 4, and
the HOA's blank application form and checklist (until the HOA provides a blank copy, the packet's form pages with every
filled value removed). It follows the schema's one-requirement-per-rule convention ([schema.md](schema.md#4-rules)) and has about 45
fence rules.

Application variants start from a **complete, compliant baseline**: the redacted packet with a listed Trex color,
vertical boards in a K style, a stated 72-inch height, both owners' signatures, a signed checklist that answers "Yes" to before photos,
neighbor approval letters that state everything 5.6.1(i) requires, and a gate that matches the fence. Each variant then changes one thing, so every branch of the
decision policy is reached:

| Variant | Expected recommendation |
| --- | --- |
| Baseline | Approve |
| Frame It All color with Trex (River Birch) | Approve with conditions |
| Horizontal boards | Approve with conditions |
| 78-inch fence, no lattice | Approve with conditions |
| 60-inch fence with 18 inches of lattice | Approve |
| Gate color doesn't match the fence | Approve with conditions |
| Unlisted composite manufacturer | Approve, with a committee decision |
| Vinyl, with `curableOutcome: reject` | Reject |
| Neighbor approval missing | Request information |
| Height not given | Request information |
| The sample packet as submitted | Request information ([application-review.md](application-review.md#expected-result-for-the-sample-application)) |

The governing documents are shared with the HOA's members, but the sample application isn't: every dataset item uses
the redacted copy, with the homeowners' details replaced.

## Scores

| Score | How | Stage |
| --- | --- | --- |
| Routing accuracy | Tags equal gold | Route |
| Rule recall and precision | Match extracted rules to gold by check type, attributes, conditions and section | Extract, consolidate |
| Check accuracy | Values, ranges and keyed tables equal gold | Extract |
| Citation validity | Share of citations with an `exact` or `fuzzy` match (code; also sent from every production build) | Extract |
| Consolidation accuracy | Merges, conflicts and exception links equal gold | Consolidate |
| Classification accuracy | Page kinds equal gold | Classify |
| Fact accuracy | Per attribute and component: value, `valueMatch` and status equal gold | Facts |
| Document status accuracy | Status and problems equal gold | Documents |
| Qualitative accuracy | Status equals gold | Qualitative checks |
| Finding and recommendation accuracy | Equal gold (code) | Evaluate, decide |
| Feedback faithfulness and clarity | Model judge `hoa-eval-review-judge` (one call per review in `pnpm eval:review`): the assessment, the feedback and each action item are faithful (every statement is backed by a finding or action item; nothing is invented) and clear (the homeowner can tell exactly what to change or provide); the score is the share of parts that are both | Write |
| Encoding against the golden | Provision keys and text, coverage and no-rule reasons, term recall, validity and repair (code); rule recall, precision and pairwise quality (judge `hoa-eval-encoding-judge`, per provision); modality and check agreement on the pairs it finds (code, the engine on generated facts) | Rulebook build ([implementation-plan.md](implementation-plan.md#evaluation-round-1-encoding-quality)) |

Evaluate and decide are code, so `review-decision` also runs as ordinary unit tests; the Langfuse experiment tracks the
pipeline end to end.

## In production

- **Citation validity** is computed in the Verify stage and sent to Langfuse as a score through the SDK, on every build.
- **Feedback faithfulness** is an LLM-as-a-judge evaluator on observations, filtered to root observations whose trace
  name is `review-writer`. The root observation's input holds the findings and action items, and its output holds the
  feedback. It's sampled to control cost. (Langfuse v4 retires trace-level evaluators on November 16, 2026, so none
  are used.)
- **Administrator edits are labels.** When an administrator edits or rejects an extracted rule, the before and after go
  to the `rule-corrections` dataset. Corrections that hold up are copied into `rule-extraction` as test cases.

## Tuning loop

1. Change a prompt in Langfuse as a new version, without the `production` label. The version's `config.model` names
   its model, so a model change is a prompt version too.
2. Run the dataset experiment against it.
3. Compare scores with the current `production` version in Langfuse.
4. Move the `production` label only when nothing regresses.

Jobs resolve labels to versions when they start, so promoting a prompt (and its model) needs no deploy, and a job in
progress keeps the versions it started with. `OPENROUTER_MODEL` and `OPENROUTER_SMALL_MODEL` apply only when a prompt
version doesn't name a model.
