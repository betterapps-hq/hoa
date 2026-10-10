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
| `review-writer` | Findings, recommendation and action items | None: judged by the coding agent ([below](#judging-by-the-coding-agent)) | Items from `review-decision` |
| `rule-corrections` | An administrator's edit or rejection | The corrected rule | Production; reviewed before it's copied into `rule-extraction` |
| `encoding-evaluation` | One split of the sample Declaration (`encoding-dev`, `encoding-test`) | The golden encoding, `samples/declaration/rules.json` | `pnpm eval:encoding:score <run> --record`: one dataset run per evaluation run, a score per measure code computes (evaluation round 1) |
| Encoding step datasets (local) | One input of one redesigned encoding step | Derived from the golden | `pnpm eval:datasets`, local files only ([below](#encoding-step-datasets)) |

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
| Feedback faithfulness and clarity | The coding agent, from each case's `writer.md` ([below](#judging-by-the-coding-agent)): the assessment, the feedback and each action item are faithful (every statement is backed by a finding or action item; nothing is invented) and clear (the homeowner can tell exactly what to change or provide); the score is the share of parts that are both | Write |
| Encoding against the golden | Code: provision keys and text, coverage and no-rule reasons, term recall, validity and repair, and modality and check agreement (the engine on generated facts) on rules paired by key or by the coding agent. The coding agent, from the run's `compare/` files: rule recall, precision and pairwise quality, per provision | Rulebook build ([implementation-plan.md](implementation-plan.md#evaluation-round-1-encoding-quality)) |

Evaluate and decide are code, so `review-decision` also runs as ordinary unit tests; the Langfuse experiment tracks the
pipeline end to end.

## Judging by the coding agent

Scores are code wherever code can compute them: exact matches, structural comparisons, coverage, counts and the
engine's outcomes. What needs reading for meaning (whether two rules state the same requirement, whether a rule is
faithful to its text, whether a summary is faithful and clear) is judged by the coding agent (Claude Code) in its own
session, on the person's Claude subscription. There are no judge prompts in Langfuse and no judge calls through the
app's OpenRouter key. Judging needs no approval: it calls no model through the app and writes nothing to Langfuse.

The evaluation scripts write comparison files for it to the run folder under `.fixtures/eval/` (git-ignored, since they
quote the documents and packets):

- **Encoding.** `pnpm eval:encoding:score <run>` writes `report.md` and `scores.json` (the scores code computes) and
  `compare/`: `README.md` indexes one file per provision that is the main citation of a rule on either side
  (`compare/rules/<provision>.md`: the provision's text with its ancestors' lead-ins, the golden and pipeline rules side
  by side as sentences and JSON, and what code found: pairs by key or from `pairs.json`, modality, the engine's check
  agreement, the rules left unpaired), and `terms.md` lists the golden terms no key, label or pair matches with the
  pipeline terms they may be. The script calls no model, and writes to Langfuse only with `--record`.
- **Review.** `pnpm eval:review` writes, beside each case's `review.json` and `scores.json`, a `writer.md`: the case's
  scores from code, what the writer read (the recommendation, the findings with their rules and provisions, the action
  items as the writer phrased them, the suggestions) and what it wrote (the assessment and the feedback).

The agent's loop:

1. Read the run's index or each case's `writer.md`.
2. **Encoding:** for each provision, pair every golden rule with the pipeline rule stating the same requirement, if
   any (rule recall); say whether each pipeline rule is faithful to the text (rule precision); and say whether the
   pipeline's encoding of the provision is better than, equal to or worse than the golden (pairwise quality). In
   `terms.md`, pair the golden terms with the pipeline terms that mean the same.
3. Record the pairs found by meaning in the run folder's `pairs.json`
   (`{ "rules": [{ "reference": "<golden rule key>", "pipeline": "<pipeline rule key>" }], "terms": [{ "golden": "<key>", "pipeline": "<key>" }] }`,
   either list optional), then rerun `pnpm eval:encoding:score <run>`: modality, check agreement and term recall now
   cover those pairs, and `terms.md` offers the members of newly paired terms.
4. **Review:** for the assessment, the feedback and each action item, say whether it's faithful and clear; the writer
   score is the share of parts that are both.
5. Write the judged scores, with the keys behind each miss and the reasons, to `judgment.md` in the run folder, and
   record them with the code's scores in the implementation log. A judged score clears its bar the same way a code
   score does.

Where the pipeline and the golden disagree and the text supports the pipeline, the agent says so; a confirmed golden
error is fixed in the sample with a cited reason, as any expected-data change.

## Encoding step datasets

The redesigned encoding steps (B defined terms, E find the rules, C shared vocabulary, C-merge, F structure the rules
and its retry, consolidation; prompt code in `src/encoding/steps/`) each have a local dataset, so a prompt is tested on
its own before it's wired into the build. `pnpm eval:datasets` (no model call, nothing to Langfuse) builds the items from
every golden in `samples/*/rules.json` and writes them to `.fixtures/eval/datasets/<step>/` (git-ignored: items quote
the documents); rerun it when a golden changes. Each item has a stable id, the step's input as the step receives it, the
expected output derived from the golden, and slice tags: document, split (dev, test, or `other` for provisions in
neither, such as the guidelines), topic areas (rule domains) and features present (check types, override, sanction,
judgment, cross-reference, amendment, text condition, no-rule reason).

| Step | Item | Input | Expected |
| --- | --- | --- | --- |
| `defined-terms` | A document | Its definitions (none: candidates only) and candidates | The golden terms citing a provision the step is given as defining (its definitions, the provisions candidates are defined in) under a name the document defines (a candidate's phrase or a definition's heading): things, parties, categories, refinements, defined types as values; with the terms criteria read and the things categories are of |
| `rule-finding` | A section, planned from the golden | Its provisions, context and references, every definition | Each provision's outlines (with reads) or no-rule reason |
| `shared-vocabulary` | A group of sections | The golden outlines with their reads, the defined terms | The terms those outlines read, with the outlines each serves |
| `vocabulary-merge` | The synthetic set | Golden terms, planted duplicates (an alternative wording rekeyed), same-key value-type collisions | The merges, the renames, lookalikes kept apart |
| `rule-structuring` | A batch of about 15 golden outlines | The outlines with their term keys, the whole vocabulary, cited provisions, settings flags | The golden rules |
| `rule-retry` | A failing rule a saved run recorded | The rule, its problems (paths inside it), its provisions and vocabulary | Fixed, with nothing changed outside the problems |
| `consolidation` | A split | Its golden rules with every cross-section override removed, cross-references, similar pairs | The removed overrides |

**The v3 and v5 columns.** The same command scores each item against what the old pipeline's saved runs produced for
the same input (`--runs`; by default v3 `2026-10-09T22-47-00-dev` and `22-45-54-test`, v5 `23-14-52-dev`). The old
pipeline had other steps, so code maps them: its vocabulary step to B, its encode answers (before repair) to E's outlines
(kind, modality, bearer, subject, request types, citations per rule) and to F's structured rules, its first repair to
F's retry, its consolidation to consolidation; C and C-merge have no equivalent and say so. Each item gets a verdict per
run: correct, partly correct (the notes say what's wrong), wrong, missing (no old result: the run never encoded the
item's document or section, as with the guidelines), or no equivalent. `results.json` holds every verdict and metric,
`summary.md` the counts by slice, each run's accuracy per metric and per slice, and the items every run got wrong (the
most useful test items), and `compare/<item>.md` the input, the expected output and each run's output for the coding
agent to judge what code can't (faithfulness, whether two terms or rules mean the same).

**What code scores, per step** (`src/evaluation/encoding/steps/scores.ts`):

| Step | Metrics |
| --- | --- |
| B | Recall of golden things and parties, categories, refinements and criteria properties: things and categories matched by labels and overlapping citations (never by key, since code builds keys from labels), the terms under them by label within their matched parent; extra things; golden gaps (below); core duplicates; undeclared criteria |
| E | Coverage (a reason, an outline citing it, or covered outside the section); rule recall and precision (pairs by key, then kind, per provision); kind, bearer, subject (a label counts when it is the golden term's), request-type and no-rule-reason agreement |
| C | Recall of properties, value sets and values, things and categories; duplicates (two terms sharing a label in one scope) |
| C-merge | Merge recall and precision; collisions renamed; lookalikes merged |
| F | Rules structured; valid before any retry (Zod); without problems (Zod and the validator); kind agreement; check agreement through the engine; problems |
| F retry | Fixed; collateral changes (a structural diff outside the problem paths; title and statement reported apart) |
| Consolidation | Recall and precision of the removed cross-section overrides; invalid and not-allowed overrides |

## Running one step

`pnpm eval:step --stage <step>` runs one step alone, so a drafted prompt is tested cheaply before the pipeline uses it.
Without `--yes` it only prints what it would run (items, calls, pinned prompts) and stops: every model run needs the
person's approval.

- **Golden mode** (the default): the step runs over its dataset's items, built in memory from the golden as above, so
  it's measured against perfect upstream input. `--golden <sample>` picks the golden (default `declaration`).
- **From a saved build run**: `--from <run under .fixtures/eval/encoding>` freezes that run's saved steps as the
  inputs: its structure for `defined-terms`, its sections for `rule-finding`, its recorded failures for `rule-retry`.
- **Chained**: `--from <run under .fixtures/eval/steps>` reads an earlier step run's `handoff.json`, so steps run in
  pipeline order on accepted outputs (E's outlines and flags, then C's terms, then C-merge's frozen vocabulary for F,
  then F's rules for consolidation). Items whose ids match the dataset's are scored against it.
- **Replays of today's build stages** (`vocabulary`, `encode`, `repair` round 1, `consolidate`, `--from <build run>`):
  the run's saved steps are the frozen inputs and its prompt versions are pinned; with the content cache a replay calls
  no model and must give back exactly what the run saved (`reproduced`, compared as the runner writes JSON;
  `replay.test.ts`).

Options: `--items <id part>,...` keeps matching items; `--prompts <name>=<version>,...` pins versions no label points
at (drafted prompts are loaded by version, labeled or not); `--repeat <n>` runs again with its own content cache per
repeat to show run-to-run noise (each metric's mean with its min and max across repeats, per item in `scores.json` and over the items in `report.md`, so a version comparison can tell a change from noise); `--reruns 0|1` reruns a failing B, E or C item once with its problems;
`--retries 0-2` runs F's retry on the rules still failing; `--rescore <step run>` calls no model and scores that run's saved
outputs again against the dataset as it is now (B's check rerun too), into a new `<time>-<step>-rescored` folder, applying and copying the run's `judgments.json`. Each run writes `.fixtures/eval/steps/<run id>/`: `run.json`
(calls with input, cached-input, cache-write and output tokens, cost and latency; problems), `outputs/`,
`handoff.json`, `scores.json`, `report.md` (calls, cost, time, cached tokens, problems by class, the scores beside the
dataset's v3 and v5 columns) and `compare/`.

**B's golden gaps.** A thing or category B returns that the golden lacks, citing a provision B was given as defining,
is a golden-gap candidate: its comparison file lists it. The coding agent reads the text and records its verdict in the
run folder's `judgments.json`
(`{ "goldenGaps": [{ "item": "<item id>", "label": "<preferred label>", "confirmed": true, "why": "<reason>" }] }`), then
rescores the run: `golden-gaps` counts the confirmed ones (0 until judged), and they no longer count as extra things. A
confirmed gap is also a golden error to fix with a cited reason, as any expected-data change.

## In production

- **Citation validity** is computed in the Verify stage and sent to Langfuse as a score through the SDK, on every build.
- **Feedback faithfulness** (deferred until after the demo; implementation-plan.md, 8.8) is an LLM-as-a-judge evaluator on observations, filtered to root observations whose trace
  name is `review-writer`. The root observation's input holds the findings and action items, and its output holds the
  feedback. It's sampled to control cost. (Langfuse v4 retires trace-level evaluators on November 16, 2026, so none
  are used.)
- **Administrator edits are labels.** When an administrator edits or rejects an extracted rule, the before and after go
  to the `rule-corrections` dataset. Corrections that hold up are copied into `rule-extraction` as test cases.

## Tuning and measurement

Tuning fits whatever it's measured on, so the cases a prompt is tuned on never measure it.

- **Slices.** Every case belongs to slices: its organization, its project type, and whether it's a real or a synthetic
  packet. Every run reports its scores per slice as well as per case, and a change is judged on the held-out slices.
- **Held out.** Measurement cases are never read while tuning: no prompt, code, validation or rulebook term is written
  from what they contain or what they got wrong. Whole project types are held out, and whole organizations once there
  is more than one: a fix that only helps one organization or one type is fitting.
- **Today.** Two project types, from one organization. **The fence is held out for all prompt tuning**: prompts are
  tuned on the garage enclosure cases and measured on the fence packet. The fence is the one real packet and the type
  the first round of tuning fitted to, so it's the better measure of whether the prompts generalize. Its failures are
  recorded, but they're fixed only by a generic change shown on the tuning slice first, or by rulebook data with a
  cited reason (a definition or scope note the governing text supports), never by naming its terms in a prompt.
- **More data, not more checks.** Adding a customer adds cases and a slice; it never adds a check, a prompt or code.
  The plan for the next slices: more organizations' governing documents (some held out from all tuning), and a second
  packet of each project type.
- **Expected data** changes only with a cited reason, recorded in the implementation log.

## Tuning loop

1. Change a prompt in Langfuse as a new version, without the `production` label. The version's `config.model` names
   its model, so a model change is a prompt version too.
2. Run the dataset experiment against it, on the tuning cases while iterating.
3. Measure on the held-out slices, and compare scores per slice with the current `production` version in Langfuse.
4. Move the `production` label only when nothing regresses.

Jobs resolve labels to versions when they start, so promoting a prompt (and its model) needs no deploy, and a job in
progress keeps the versions it started with. `OPENROUTER_MODEL` and `OPENROUTER_SMALL_MODEL` apply only when a prompt
version doesn't name a model.
