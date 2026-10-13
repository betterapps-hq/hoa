# Evaluation

Prompt tuning only counts when it's measured. Each evaluation runs in process against expected data: code computes
every score it can, and the coding agent judges what needs reading for meaning, from comparison files the scripts write
([Judging by the coding agent](#judging-by-the-coding-agent)). Langfuse holds a dataset only where one is listed below.
Every run that calls a model needs the person's approval.

## Datasets

| Dataset | Where | Item | Expected output | Built and run by |
| --- | --- | --- | --- | --- |
| `encoding-evaluation` | Langfuse | One split of the sample Declaration (`encoding-dev`, `encoding-test`) | The golden encoding, `samples/declaration/rules.json` | `pnpm eval:encoding` runs the build; `pnpm eval:encoding:score <run> --record` records one dataset run per evaluation run, a score per measure code computes |
| Encoding step datasets | Local | One input of one redesigned encoding step | Derived from the golden | `pnpm eval:step` builds and runs one step's items; `pnpm eval:datasets` writes every step's items ([below](#encoding-step-datasets)) |
| Review cases | Local | One application: its project type, answers, packet and expected review | Entities, facts, documents, findings per rule and entity, recommendation and action items | `pnpm eval:review` ([below](#review-cases)) |
| `entity-facts` | Langfuse | One packet, entity and property, from a correction the review recorded | The settled fact, or null with `needsLabel` for a person to label | `pnpm review:corrections` ([application-review.md, Recognition](application-review.md#recognition)) |

The golden encoding comes from the governing documents only and follows the schema's one-requirement-per-rule
convention ([schema.md](schema.md#4-rules)).

The governing documents are shared with the HOA's members, but the sample application isn't: the fence packet's case
and every file that quotes it stay in the git-ignored `.fixtures/`.

## Scores

| Score | How | Run by |
| --- | --- | --- |
| Encoding against the golden | Code: provision keys and text, coverage and no-rule reasons, term recall, validity and repair, and modality and check agreement (the engine on generated facts) on rules paired by key or by the coding agent. The coding agent, from the run's `compare/` files: rule recall, precision and pairwise quality, per provision | `pnpm eval:encoding:score` |
| Encoding steps | Code, per step ([below](#encoding-step-datasets)); the coding agent judges faithfulness and meaning from each item's comparison file | `pnpm eval:step` |
| Review | Code (`src/evaluation/review/score.ts`): entity accuracy, fact accuracy, document accuracy, normalization accuracy, evidence verification, finding outcome accuracy per rule and entity, recommendation accuracy and action items | `pnpm eval:review` |
| Feedback faithfulness and clarity | The coding agent, from each case's `writer.md`: the assessment, the feedback and each action item are faithful (every statement is backed by a finding or action item; nothing is invented) and clear (the homeowner can tell exactly what to change or provide); the score is the share of parts that are both | `pnpm eval:review` |

Every rulebook build also sends the scores code computes on it to Langfuse
([encoding.md, Quality](encoding.md#quality)). Production evaluators are deferred.

## Judging by the coding agent

Scores are code wherever code can compute them: exact matches, structural comparisons, coverage, counts and the
engine's outcomes. What needs reading for meaning (whether two rules state the same requirement, whether a rule is
faithful to its text, whether a summary is faithful and clear) is judged by the coding agent (Claude Code) in its own
session, on the person's Claude subscription. There are no judge prompts in Langfuse and no judge calls through the
app's OpenRouter key (the person's decision of 2026-10-09 in [implementation-log.md](implementation-log.md)). Judging
needs no approval: it calls no model through the app and writes nothing to Langfuse.

The evaluation scripts write comparison files for it to the run folder under `.fixtures/eval/` (git-ignored, since they
quote the documents and packets):

- **Encoding.** `pnpm eval:encoding:score <run>` writes `report.md` and `scores.json` (the scores code computes) and
  `compare/`: `README.md` indexes one file per provision that is the main citation of a rule on either side
  (`compare/rules/<provision>.md`: the provision's text with its ancestors' lead-ins, the golden and pipeline rules side
  by side as sentences and JSON, and what code found: pairs by key or from `pairs.json`, modality, the engine's check
  agreement, the rules left unpaired), and `terms.md` lists the golden terms no key, label or pair matches with the
  pipeline terms they may be. The script calls no model, and writes to Langfuse only with `--record`.
- **Encoding steps.** `pnpm eval:step` writes `compare/<item>.md` per item
  ([below](#running-one-step)).
- **Review.** `pnpm eval:review` writes, beside each case's `review.json` and `scores.json`, a `writer.md`: the case's
  scores from code, what the writer read (the recommendation, the findings with their rules and provisions, the action
  items as the writer phrased them, the suggestions) and what it wrote (the assessment and the feedback).

The agent's loop:

1. Read the run's index, each item's comparison file or each case's `writer.md`, and every wrong and missed item.
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
   record them with the code's scores in the implementation log.

Where the pipeline and the golden disagree and the text supports the pipeline, the agent says so; a confirmed golden
error is fixed in the sample with a cited reason, as any expected-data change.

## Encoding step datasets

The build's encoding steps (B defined terms, E find the rules, C shared vocabulary, C-merge, F structure the rules with
its retry, consolidation; code in `src/encoding/steps/`, shared with the build) each have a local dataset, so a prompt
is tested on its own. `pnpm eval:step` builds its step's items from the golden in memory; `pnpm eval:datasets` (no
model call) builds every step's items from every golden in `samples/*/rules.json` and writes them to
`.fixtures/eval/datasets/<step>/items/` (git-ignored: items quote the documents) for reading; rerun it when a golden
changes. These datasets never go to Langfuse. Each item has a stable id, the step's input as the step receives it, the
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
| `consolidation` | A split | Its golden rules with every cross-section override removed, cross-references, similar pairs | The removed overrides |

**What code scores, per step** (`src/evaluation/encoding/steps/scores.ts`):

| Step | Metrics |
| --- | --- |
| B | Recall of golden things and parties, categories, refinements and criteria properties: things and categories matched by labels and overlapping citations (never by key, since code builds keys from labels), the terms under them by label within their matched parent; extra things; golden gaps (below); core duplicates; undeclared criteria |
| E | Coverage (a reason, an outline citing it, or covered outside the section); rule recall and precision (pairs by key, then kind, per provision); kind, bearer, subject (a label counts when it is the golden term's), request-type and no-rule-reason agreement |
| C | Recall of properties, value sets and values, things and categories; duplicates (two terms sharing a label in one scope) |
| C-merge | Merge recall and precision; collisions renamed; lookalikes merged |
| F | Rules structured; valid before any retry (Zod); without problems (Zod and the validator, after the retries `--retries` allows); kind agreement; check agreement through the engine; problems |
| Consolidation | Recall and precision of the removed cross-section overrides; invalid and not-allowed overrides |

## Running one step

`pnpm eval:step --stage <step>` runs one step alone, so a drafted prompt is tested cheaply before the pipeline uses it.
Without `--yes` it's a dry run: it prints the items, the estimated model calls per repeat and the pinned prompts, and
stops. That estimate is what the person approves; the script has no spending cap.

- **Golden mode** (the default): the step runs over its dataset's items, built in memory from the golden as above, so
  it's measured against perfect upstream input. `--golden <sample>` picks the golden (default `declaration`).
- **From a saved build run**: `--from <run under .fixtures/eval/encoding>` freezes that run's saved steps as the
  inputs: its structure for `defined-terms`, its sections for `rule-finding`.
- **Chained**: `--from <run under .fixtures/eval/steps>` reads an earlier step run's `handoff.json`, so steps run in
  pipeline order on accepted outputs (E's outlines and flags, then C's terms, then C-merge's frozen vocabulary for F,
  then F's rules for consolidation). Items whose ids match the dataset's are scored against it.

Options:

- `--items <id part>,...` keeps matching items.
- `--prompts <name>=<version>,...` pins versions no label points at (drafted prompts are loaded by version, labeled or
  not); other prompts load by label.
- `--repeat <n>` runs again with its own content cache per repeat to show run-to-run noise: each metric's mean with its
  min and max across repeats, per item in `scores.json` and over the items in `report.md`, so a version comparison can
  tell a change from noise.
- `--split dev,test` runs only the items of those splits (the dataset's `split` tag), to try a prompt on part of a
  step's items and keep the rest as a check.
- `--reruns 0|1` (default 1) reruns a failing B, E or C item once with its problems, as the pipeline does.
- `--retries 0-2` (default 0) runs F's retry on the rules still failing.
- `--finder <file>` gives B the provisions another finder picked (a JSON map of item id to provision keys) instead of
  the ones code picks, and `--expect all|picked` (default `picked`) scores B against every term the golden defines in
  the document, or only those in the provisions B is given, so finders can be compared (`scripts/stepFinder.ts`).
- `--rescore <step run>` calls no model and scores that run's saved outputs again against the dataset as it is now
  (B's check rerun too), into a new `<time>-<step>-rescored` folder, applying and copying the run's `judgments.json`.

Each run writes `.fixtures/eval/steps/<run id>/`: `run.json` (calls with input, cached-input, cache-write and output
tokens, cost and latency; problems), `outputs/`, `handoff.json`, `scores.json`, `report.md` (calls, cost, time, cached
tokens, problems by class, the scores by slice and the items every run got wrong) and `compare/`: per item, its
input, the expected output and each repeat's output with its score, for the coding agent.

**B's golden gaps.** A thing or category B returns that the golden lacks, citing a provision B was given as defining,
is a golden-gap candidate: its comparison file lists it. The coding agent reads the text and records its verdict in the
run folder's `judgments.json`
(`{ "goldenGaps": [{ "item": "<item id>", "label": "<preferred label>", "confirmed": true, "why": "<reason>" }] }`), then
rescores the run: `golden-gaps` counts the confirmed ones (0 until judged), and they no longer count as extra things. A
confirmed gap is also a golden error to fix with a cited reason, as any expected-data change.

**C's naming differences.** C's terms align with the golden's by key, else by label with an aligned parent, so a term
that means the same fact under another name counts as missing. The coding agent judges each missing term against the
output and records the same-meaning ones in `judgments.json` as
`{ "termPairs": [{ "item": "<item id>", "golden": "<golden key>", "pipeline": "<output key>", "why": "<reason>" }] }`;
a rescore aligns them (same kind, and an aligned parent, still required). A broader or narrower fact isn't a pair.

C's input names an outline's subjects and parties as E hands them over: by key where the core, B's terms or the known
terms (the golden's proposed core terms, which E is given too) have them, else by the golden term's preferred label, so
C adds the terms the golden expects of it rather than reading a golden key as a term that exists.

## Review cases

`pnpm eval:review [--case <id>,...]` runs the review (`reviewApplication`, the code the `ApplicationReview` Workflow
runs) in process on each case with the real models, scores it in code against the case's expected review, and writes
each case's `review.json`, `scores.json` and `writer.md`, plus `report.md`, to `.fixtures/eval/review/<run id>/`. Model
results are cached, so a rerun pays only for what changed; `--sample <n>` reads and writes its own cache, so the same
configuration can be measured on fresh model answers, and `--config` overrides a prompt version's model and effort for
an experiment without a new Langfuse version. The rules file is `scripts/reviewRulesFile.ts`: the sample Declaration
with the fence fixture's stand-in for the Design Guidelines.

The cases are the synthetic garage enclosure packets committed under `samples/garage-enclosure/` (`baseline`,
`replacement-plans`, `attic`, `fee-not-paid`:
[application-review.md, Expected result for a garage enclosure](application-review.md#expected-result-for-a-garage-enclosure))
and the fence packet's case in the git-ignored `.fixtures/eval/review/fence-application/`
([application-review.md](application-review.md#expected-result-for-the-sample-application)). The engine and the
decision policy are code, with unit tests of their own.

## Tuning and measurement

Tuning fits whatever it's measured on, so the cases a prompt is tuned on never measure it.

- **Slices.** Every case belongs to slices: its organization, its project type, and whether it's a real or a synthetic
  packet; every step dataset item has its document, split, topic areas and features. Every run reports its scores per
  slice as well as per case, and a change is judged on the held-out slices.
- **Held out.** Measurement cases are never read while tuning: no prompt, code, validation or rulebook term is written
  from what they contain or what they got wrong. Whole project types are held out, and whole organizations once there
  is more than one: a fix that only helps one organization or one type is fitting.
- **Today.** Two project types, from one organization. **The fence is held out for all prompt tuning**: prompts are
  tuned on the garage enclosure cases and measured on the fence packet. The fence is the one real packet, so it's the
  better measure of whether the prompts generalize. Its failures are recorded, but they're fixed only by a generic
  change shown on the tuning slice first, or by rulebook data with a cited reason (a definition or scope note the
  governing text supports), never by naming its terms in a prompt.
- **More data, not more checks.** Adding a customer adds cases and a slice; it never adds a check, a prompt or code.
  The plan for the next slices: more organizations' governing documents (some held out from all tuning), and a second
  packet of each project type.
- **Expected data** changes only with a cited reason, recorded in the implementation log.

## Tuning loop

One step at a time:

1. Draft the change as a new prompt version in Langfuse, with no label. The version's `config.model` names its model,
   so a model change is a prompt version too.
2. Run its step alone with `pnpm eval:step --stage <step> --prompts <name>=<version>`: a dry run first, then, with the
   person's approval, `--yes`.
3. Judge every wrong and missed item from the comparison files, not only the score.
4. Fix what the judging shows: the code or a scorer when it's wrong, the golden when the text supports the model (with
   a cited reason), the prompt otherwise. Rescore with `--rescore` when only code or the golden changed.
5. Repeat until the step is good, then move to the next step.

Move a label (`development`, which the app loads locally, then `preview` and `production`) to a version only with the
person's approval. Jobs resolve labels to versions when they start, so a job in progress keeps the versions it started
with. `OPENROUTER_MODEL` and `OPENROUTER_SMALL_MODEL` apply only when a prompt version doesn't name a model.
