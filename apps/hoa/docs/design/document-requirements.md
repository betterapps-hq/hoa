# Documents, templates and answer choices

> **Design, not built.** No prompt changes until the tests in [Testing prompt changes](#testing-prompt-changes) pass.

How a rulebook says that an application must include something (a plot plan, two sets of plans, a neighbor's signed
approval), how a form asks for it, when a form needs the association's own template, and what happens when the
governing documents don't settle how applicants show something.

## The problem

The current encoding pipeline has no way to say "this rule is met by a document". Rule finding can mark only judged
rules with a check type and pushes every other rule to name a fact; vocabulary turns that fact into a yes/no or count
property of the application; structuring can't add the missing document thing. So "the application must include a plot
plan" becomes `architectural-application.includes-plot-plan = true`. The form builder never asks for it (it builds
questions only for the work and its subjects), and the review asks the homeowner for information instead of the plan.

| Rulebook | Rules reading such facts | Document checks |
| --- | --- | --- |
| Sudden Valley, published | 7 | 0 |
| Trilogy, current pipeline | 42 | 2 |
| Trilogy, hand-checked answer key | 0 | 40, across 26 document types |

The answer key and the earlier encoder produced document checks from the same text, so this is a gap in the current
pipeline, not in the schema. Nothing marks a document as a form someone provides, so nothing suggests a template either.

## Goals

1. A requirement to provide something becomes a document requirement when the documents say so.
2. A document the documents describe as a form (a neighbor approval form) asks the administrator for its template.
3. When the documents don't settle how applicants show something, the pipeline keeps each reading and the administrator
   chooses in the form editor, highlighted, instead of the pipeline guessing.
4. Nothing specific to one association in code or prompts: what a document is and who provides it is each rulebook's
   data.
5. A prompt change ships only after the step test and back-test below.

## In the rulebook

The `document` check already has the document, `per` request or subject, what it must state and who signs. It gains
one field:

```ts
| { type: "document"; document: TermKey; per: "request" | "subject"; mustState: string[]; signedBy: TermKey[]
    form: { from: TermKey | null } | null } // filled in on a form: from the party that issues it (null: not said)
```

`form` is null when applicants bring their own file (plans, photos, a contractor's license).

A new question kind, `"evidence"`, records how applicants show a requirement when the documents allow more than one
reading. It's the existing `Question` record (schema.md): each option keeps different candidate rules.

```json
{
  "kind": "evidence",
  "question": "How do applicants show they include a plot plan?",
  "citations": [{ "provision": "declaration:4/p4" }],
  "about": { "rules": ["declaration:4/p4#plot-plan", "declaration:4/p4#plot-plan-stated"], "terms": [] },
  "options": [
    { "label": "Upload a plot plan", "keeps": ["declaration:4/p4#plot-plan"] },
    { "label": "Say the application includes one", "keeps": ["declaration:4/p4#plot-plan-stated"] }
  ],
  "answer": null
}
```

Unlike interpretation and conflict questions, an evidence question doesn't block publishing and isn't answered in the
rulebook: the published file keeps every option's candidates, and each form chooses. Option 0 is the pipeline's best
reading, used wherever nothing has chosen.

## In the encoding pipeline

These are the prompt changes, made later, one step at a time, each gated by the tests below.

- **Rule finding:** an outline can be a document requirement, the way it can be a judged rule. It names the document,
  what it must show, who signs and whether it's on a form, and names no fact. When the text doesn't settle a document
  against a stated fact, or a form against the applicant's own file, the outline gives both readings.
- **Vocabulary:** a document requirement's document becomes a document thing, not a property of the application.
- **Structuring:** a document requirement becomes a `document` check. An outline with two readings becomes one
  candidate rule per reading and an evidence question.

## Checks in code

These need no model and can be built first.

- **An advisory issue** on an applicant's obligation that tests a yes/no or count property of the request thing
  itself. Rulebook review shows it: "This may be a document to upload." It's advisory, because real facts have the same
  shape (the date it was submitted, whether staff were consulted).
- **Validation:** each option of an evidence question keeps at least one candidate, and one question's options never
  share a candidate.
- **Nothing dropped silently:** the form builder lists what the selected rules require of the application that no
  question or document covers, under "Not asked yet", with Add question and Add document filled in.

## In the form editor

- **Choices:** an evidence question that applies to a project type shows as a highlighted card in Questions or
  Documents (a "Choose" badge): "Your documents don't say how homeowners show this." Each option shows the item it
  adds, for example "Upload: Plot plan" or "Yes or no: Does your application include a plot plan?". The choice is
  saved on the type's form, keyed by its candidate rules so a rebuild keeps it, and the item then behaves like any
  other: reorder it, reword it, change its answer type.
- **Until it's chosen,** homeowners don't see the item and the review uses option 0. The type's page counts open
  choices in a callout, and the list and the dashboard count types with open choices, as they do for out-of-date types.
  A choice already made for another type prefills, not highlighted, with "Chosen for Outbuilding".
- **Templates:** a document whose check has `form` shows "Attach the form homeowners fill in", highlighted until the
  administrator attaches a template or says there isn't one. A document signed by someone other than the applicant,
  without `form`, gets a quieter suggestion: "Others sign this. Attach a form for them to fill in?" Homeowners already
  download a document's template from their checklist.

## In the review

`selectRules` takes the form's choices: for each evidence question, only the chosen option's candidates are selected,
or option 0's when nothing has chosen. Nothing else changes. A document check goes to the document reader and a test
to the facts. A review keeps the rules it selected, so a later choice doesn't change a submitted application.

## Testing prompt changes

No step's label moves until all of this holds, and each paid run is approved first, with its cost.

1. **Goldens first.** The Trilogy answer key gains `form` and evidence labels. Two or three Washington associations not
   used while drafting get document-requirement goldens, labeled by hand before any run and reviewed by you.
2. **One step at a time:** rule finding, then vocabulary, then structuring, each tested on its own. New scores:
   - document requirements found and wrongly found;
   - forms found;
   - facts wrongly turned into documents;
   - evidence questions raised, each read to check the text really allows both readings.
3. **Back-test.** The new prompt version runs against the current `development` version on every step dataset the
   current version was scored on, with the same model and effort and one repeat (two or more only to separate close
   versions). Every existing score must hold. Every wrong or missed item is read and judged before a score is
   reported.
4. **Unseen associations.** Freeze the prompt, then measure on the associations it wasn't drafted on. Change it again
   only for patterns that recur across associations.
5. **End to end.** Rebuild Sudden Valley and Trilogy and diff each rulebook against the current one: only document
   requirements, forms and evidence questions should change.

## Build order

1. **Code only, no model spend:**
   - the schema (`form`, evidence questions) and its validation;
   - the advisory issue and "Not asked yet";
   - choice cards and template prompts;
   - choices in rule selection.

   This is all built and tested on hand-written rulebooks and checked in the browser.
2. **Goldens.**
3. **Prompt changes,** step by step, as above.
4. **Rebuild and diff.**

## Open questions

1. "Two complete sets of plans": a `copies` count on the document check, or part of what it must show?
2. Choices are made per project type, with prefill from other types. Should one choice cover every type instead?
3. Fees ("the filing fee must accompany the application") have the same shape. Should they map to the fee answer type
   in the same way, or wait?
