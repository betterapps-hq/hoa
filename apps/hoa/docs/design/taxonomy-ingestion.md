# Taxonomy-first ingestion (experiment)

> **Status: being tested, alongside the current pipeline.** Nothing here replaces [encoding.md](encoding.md) until step 6
> proves it. The tasks and their state are at the end.

A second way to turn governing documents into rules, built to rely less on large model calls as the number of
organizations grows. Instead of asking a model to read every provision, it first learns what kinds of rules HOA
documents contain, across many organizations, then sorts each new provision into one of those kinds with small local
models, extracts the kind's fields, and sends a provision to a large model only when it doesn't fit.

## Why

The current pipeline ([encoding.md](encoding.md)) reads every provision of every document with a large model. That
works and is accurate, but its cost and time grow with every page and every organization, and most HOA rules repeat
the same handful of subjects in different words: fences, parking, pets, signs, leasing, assessments, architectural
approval. A shared catalog of those subjects, learned once, makes each new organization cheaper and its rules
comparable across organizations ("your fence limit against the other nine").

Benchmarks so far support the split this design relies on: small fine-tuned models (GLiNER 2.5, GLiNER2.5-Decide) are
good at sorting text ("what kind of paragraph is this?") and weak at interpreting it; the large model is far better at
conditions, exceptions and cross-references.

## The two phases

```text
 Phase A: discovery (offline, periodically, across organizations)
   provisions ─> embeddings ─> clusters (BERTopic) ─> reviewed taxonomy of rule kinds
                                                       └─> labeled training data

 Phase B: production (every new document)
   provisions ─> rule gate (has a rule?) ─> kind classifier ─> kind's schema fields (GLiNER)
                                              │ low confidence or no kind fits
                                              └─> large model, as today ─> the rules schema
```

- **Provisions** come from the structure stage that exists today: Azure Layout paragraphs and the numbering parser,
  with the size and nesting checks that send a misparsed document to repair. Discovery may not need the parser at all
  (step 1 tests that); production does, because every rule cites a provision key.
- **Embeddings** are one per provision, with its heading path and its list's lead-in as context, never fixed-size text
  windows: a window mixes and splits rules and has no citation.
- **The taxonomy** is data, not prompts or code: rule kinds with descriptions and, for kinds that template well, a
  field schema. It grows when provisions that fit no kind cluster into a new one.
- **Kind schemas are views onto the rules schema** ([schema.md](schema.md)). A fence-height field becomes the same
  terms, checks and citations the rules file holds today, so review, the rulebook and application review don't change.
- **The large model stays the fallback** for provisions the small models are unsure of or that don't template:
  conditions, exceptions, cross-references and discretion. How much stays with it decides how much this saves.

## What's in and what's ruled out

| Part | Choice | Ruled out, and why |
| --- | --- | --- |
| Structure | Azure Layout and the numbering parser (today's) | Docling: benchmarked, no gain over Azure with the parser |
| Embeddings | OpenAI text-embedding-3 or Voyage 4, through OpenRouter; chosen by step 2 | Other providers, for now |
| Discovery | BERTopic (UMAP and HDBSCAN) over provision embeddings; clusters named in a manual review | A paid model naming clusters: the review does it |
| Classifiers | GLiNER2.5-Decide fine-tuned on the reviewed kinds; GLiNER 2.5 for fields | A separately fine-tuned ModernBERT (redundant with Decide); spaCy pattern rules (the edge-case treadmill) |
| Fallback | The large model and the current prompts | NuExtract (slower on CPU, no confidence, weaker than the large model) |
| Storage | D1 for rules, Cloudflare Vectorize for embeddings | PostgreSQL and pgvector (same capability, a migration for nothing) |
| Hosting the small models | A small Python service, CPU, 2 to 4 GB of memory | — |

## Steps, each answering one question

Each step has a gate. The next step starts only when the gate is met.

| Step | Question | Gate |
| --- | --- | --- |
| 1. Units | Do the categories depend on our parser? Cluster parser provisions and raw Azure paragraphs with their headings, and compare. | The same categories from both: discovery doesn't need the parser |
| 2. Discovery | Do coherent rule kinds emerge across organizations, and which embedding model is best? Four models, then a manual review that names, merges and splits clusters and lists what's missing. | Most clusters coherent and spanning several organizations |
| 3. Coverage | What share of rules fall in clear kinds, what share template into fields, and what share are complex one-offs? | A large enough templated share to matter |
| 4. Kind classifier | Can Decide, fine-tuned on the reviewed kinds, sort an unseen organization's rules? | High accuracy on the held-out organizations, after error review |
| 5. Kind schemas and fields | For templated kinds, can GLiNER fill the fields correctly? Scored first against the sample's golden rules, then a hand-labeled sample from other organizations. | Field accuracy close to the large model's on those kinds |
| 6. Routing, end to end | Does small models first, the large model where needed, match today's quality, and at what cost? One large-model run per pipeline on several organizations. | Equal or better quality, at lower cost |

## How it's measured

- The goldens: the sample organization's full encoding plus golden defined terms and per-provision rule labels for nine
  other organizations' declarations, kept out of the repository (`.fixtures/goldens/`). Two organizations are held out
  from all training and tuning and used only as the final test.
- Every result is reported as right, wrong and missed, with F1, never recall alone.
- Every wrong and missed item is reviewed before a score is reported: a real error counts; an error in the golden is
  fixed, with its reason, and every result is rescored; corrected labels flow back into the training data, since a
  real definition the golden missed would otherwise be trained as a negative.
- Paid calls only when they answer the step's question: steps 1 to 5 cost cents (embeddings); step 6 is the one
  large-model comparison.

## Tasks

Runs in parallel with the defined-terms finder: GLiNER and Decide picking the paragraphs step B reads, compared with
today's code finder. On 2026-10-11, after the paragraph truth was audited and the models retrained on it, every
held-out error was judged: on the two held-out organizations (little text shared with training), GLiNER base found
defining paragraphs at precision 0.85 and recall 0.86 (F1 0.86), Decide at 0.75 and 0.96 (F1 0.84), and the code
finder at F1 0.69. Both models' main false flag is a numbered run-in heading. Next for the finder: a large-model run of
step B on GLiNER's candidates against the code finder's, and unique provision keys for the held-out answer keys.

| # | Task | Step | State |
| --- | --- | --- | --- |
| 1 | Goldens for nine more organizations: defined terms and per-provision rule labels; two held out | — | Done |
| 2 | Embedding units from the goldens: rule-bearing provisions with heading path and lead-in | 1 | Done (1,905 units) |
| 3 | The same units from raw Azure paragraphs and headings, without the parser | 1 | Running |
| 4 | Embed with text-embedding-3-small and -large, Voyage 4 and 4-large; cluster each with BERTopic | 2 | Embedded (7 cents); clustering running |
| 5 | Manual review: name, merge and split clusters; list missing kinds; choose the embedding model | 2 | To do |
| 6 | Draft taxonomy: kinds with descriptions, which template and which don't | 3 | To do |
| 7 | Coverage: share of rules per kind, templated share, outliers | 3 | To do |
| 8 | Label every golden rule provision with its kind; fine-tune Decide; test on the held-out organizations; review errors | 4 | To do |
| 9 | Field schemas for the templated kinds, as views onto the rules schema | 5 | To do |
| 10 | GLiNER field extraction against the sample's golden rules, then a labeled sample from other organizations; review errors | 5 | To do |
| 11 | Routing by confidence; one large-model run comparing it with today's pipeline on several organizations; review errors | 6 | To do |
| 12 | If step 6 passes: design the production version (Python service, Vectorize, where it sits in RulebookBuild) | — | To do |
