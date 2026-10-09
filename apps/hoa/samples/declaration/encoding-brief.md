# Brief: encoding the sample Declaration and Use Restrictions in the rules schema

You're encoding part of a real community association's recorded Declaration (CC&Rs) into the rules schema, as typed
TypeScript data. Folder: the encoding folder (below, "the folder").

## Read first

1. `D:\hoa\apps\hoa\docs\design\schema.md`: the schema and its rules. Read sections 2 to 5 closely: kinds, labels,
   expressions and their evaluation, the four rule kinds, modality, overrides, deadlines, cure, sanctions, limits,
   remedies, request types, invariants, checks.
2. `D:\hoa\apps\hoa\docs\design\schema-examples.md`: 57 worked examples. Encode like them.
3. `..\schema\schema.ts` (from the folder): the exact types. `..\schema\examples.ts`: `coreTerms`, the core terms you
   may use without defining (parties, community, lot, request types and their fields, units).
4. The folder's `encode-types.ts` (what your file exports), `documents.ts` (document keys `declaration` and
   `use-restrictions`), and `vocab.ts` once it exists (the shared vocabulary; article encoders build on it).
5. The source: the folder's `ccrs.txt`, text of the recorded Declaration from a scanned PDF. It has OCR noise
   ("Restnctions", stray symbols, page footers like "325743 3 [11/29/01 4 22 PM]" and "ClibPDF - www.fastio.com"). Read
   through the noise; never invent content that isn't there. Don't copy signatories' or individuals' names.

## Your file

Write exactly one file in the folder (named in your task), exporting `export const part: EncodingPart = { ... }` with
`provisions`, `terms`, `coreAdditions`, `rules`, `questions`, `clauses` and `notes`. Edit nothing else.

## Conventions

- **Organization:** every organization term has `organizationId: ORG` (import `ORG` from `./encode-types.ts`).
- **Provisions.** One per numbered section and sub-item of your range, plus articles. Key `{document}:{label}`.
  - Declaration labels: an article is `article-3`; a section is `3.1`; its items `3.1(a)`, `3.1(a)(i)`, and so on (the
    parent's label in front). Unnumbered paragraphs inside a section are counted: `3.1/p2`. `parentLabel` is the
    enclosing provision's label (`article-3` for a section). `kind`: `article`, `section`, `point` for lettered or
    numbered items, `paragraph` for counted ones, `definition` for a defined term in Article 2, `exhibit` for an
    exhibit. `num`: `{ printed, normalized, source: "printed" }`, or `counted` for counted paragraphs.
  - Use Restrictions (Exhibit C) labels: the opening paragraphs are `p1`, `p2`, `p3`; item "(a)" is `a`; its items
    `a(i)`, `a(ii)`; deeper `a(x)(1)`. Document key `use-restrictions`.
  - `text` is the provision's verbatim wording: OCR noise fixed only where the intended characters are certain
    ("Restnctions" to "Restrictions"), page footers and headers ("325743 3 [11/29/01 4 22 PM]", "ClibPDF -
    www.fastio.com", page numbers, stray margin marks) removed, line breaks joined into normal spacing. Nothing reworded
    or summarized. A parent's text excludes its numbered children's text; an article's text is its heading line unless
    it has intro text. The result becomes one JSON file validated by a Zod schema, so every field is real.
  - `noRule` is `null` when a rule or term cites the provision. Otherwise give a reason: `heading` (only a heading),
    `recital`, `reserved`, `explanatory` (states no requirement: purpose, intent, background), `duplicate` (says what
    another provision says), or `not-evaluated` (a real requirement that no request type could evaluate), with a short
    note.
- **Terms.** Read `coreTerms` and `vocab.ts` before adding any. Add a term only when no existing one fits, under a key
  following the conventions (`thing`, `thing.property`, `set.value`), with clear labels from the document's own wording.
  Set `definedIn` to the provision keys that define or use it. Refine a core term (same key, `organizationId: ORG`) only
  to give it the document's labels, never to change its kind. `coreAdditions` is for a request type the portal would
  need that no core term covers (nature `request`, `organizationId: null`), and its fields; use it rarely.
- **Rules.** One rule per requirement. Key `{main citation's provision key}#{aspect}`. `citations: [cite("...")]`, main
  citation first. `effectiveFrom: "2001-12-04"`. `scope` and `authority` are `null` (no decision rules here).
  - `requestTypes`: where the rule would be evaluated: `architectural-application`, `violation`, `assessment`,
    `lease-registration`, `meeting`, `records-request`, `nomination`, or `compliance-period` (a duty nobody files a
    request about, such as the Association insuring the Common Area). Add a core request type only if none fits.
  - Pick the kind and modality by the schema's definitions: `norm` (obligation with a check saying what complies;
    prohibition of the subject itself, no check; permission, no check, only meaningful when it overrides another rule;
    recommendation), `discretion` ("may approve case by case", "in its sole discretion may permit"), `sanction`,
    `limit`. "Unless approved by the Board/Reviewer" is a discretion rule overriding the prohibition, decided by that
    body.
  - Checks: `test` with conditions over terms; `table`; `document`; `deadline`; `judgment` (a yes/no question phrased so
    yes complies, with `decidedBy`). Use a `judgment` for standards like "unsightly", "nuisance", "neat".
  - `remedy`: required exactly when `requestTypes` includes `architectural-application` and the bearer is `owner` or
    `applicant` (and it isn't a permission); otherwise `null`. Never `none` together with a cure.
  - Powers the Association or Board simply has ("may adopt rules", "may enter to inspect") are permissions with bearer
    `organization` or `board` when they override an owner's rights; when they override nothing, mark the provision
    `not-evaluated` or `explanatory` instead of inventing a rule.
  - Statements in house style: short, "must", "must not", "may", "should", with `{{term-key}}` links for terms.
- **Questions.** When a provision reads two ways, add an interpretation question with the candidate rules' keys.
- **Clauses.** Settings content if your range has it: precedence (conflicts between documents), time (computation of
  days), liability (owners answer for occupants and guests), the default cure period. Cite nothing in `clauses` except
  with `cite(...)` in their `citations`.
- **Notes.** One sentence per judgment call or schema gap. Start a note with "SCHEMA GAP:" when the schema can't express
  something faithfully, and encode the closest faithful form.

## Check your work

Run in PowerShell, from the folder:

```powershell
tsc -p tsconfig.PART.json; node check-ccrs.ts PART
```

Replace PART with your file's name without `.ts`. Fix every type error and every problem listed for your part. Other
parts may be missing or in progress; ignore their problems. Then reply with a short summary: counts, the schema gaps you
hit, and the judgment calls worth a human's attention.

## Migration to the revised schema (read this before editing your part)

The schema changed after the first encoding. `schema.md` is regenerated; read its sections on Modality, Approval versus
discretion, Overrides (selectors), Deadlines/cure/sanctions, Checks (`approval`), Settings, Evaluation and Drafts. Your
job: migrate your existing part file to the new schema **and re-encode every clause the new constructs now express
better**. Keep provisions, their text and keys stable unless a change below requires otherwise.

Mechanical changes:

- **Rules are drafts** (`RuleDraft`, from `../schema/schema.zod.ts`): you may omit any field whose default is null, an
  empty list or false (`appliesWhen`, `scope`, `authority`, `beneficiary`, `decidedBy`, `overrides`, `noExceptions`,
  `check`, `remedy`, `recurs`, `cure`, sanction `after`/`occurrences`/`repeats`/`cap`/`suspends`/`lasts`, limit
  `forbids`/`maxAmount`/`maxTotal`). Remove boilerplate nulls; keep fields that carry meaning.
- **Things** have `request`: null, except things of nature `request`, which carry `{ flow, governingDate, lot }` (flow
  `application` | `enforcement` | `filing` | `duty`). The core now includes `compliance-period`, `approval` (with
  `approval.by` a party, `approval.covers`, `approval.status`, `approval.on`, `approval.written`), `work`, and
  `violation.observed-on` / `violation.cured-on`; see `coreTerms` in `../schema/examples.ts`. Don't redefine those.
- **Provisions** have `intro` and `wrapUp` (both usually null). When a provision's text is a lead-in for its children
  ("The following activities are prohibited ... unless authorized by the Board:"), move that text to `intro`, leaving
  `text` empty or for any remaining words; trailing text after the children goes to `wrapUp`.
- **Sanctions**: `enforces: { rules, documents, except }` (both lists allowed); `against: [...]` (parties it's imposed
  on, default owner); `amounts` is a non-empty list, or `"none"` (not money) or `"set-by-imposer"`; new types
  `record-notice` and `acceleration`; `after: { value, unit, from }` for "available only once this long has passed"
  (e.g. more than 30 days delinquent); `repeats.from` (when repeats start; null = end of cure); `lasts` may be
  `{ atMost }`. An enforced rule must be an obligation or prohibition that shares a request type with the sanction.
- **Cure** has `curedBy` (the date property recording the cure, e.g. `violation.cured-on`, `assessment.paid-on`).
- **Settings clauses** gain `sanctionPreconditions` (the notice-and-hearing procedure every sanction needs).
- **Referenced documents**: list documents the Declaration names but that aren't uploaded (By-Laws, Articles, Board
  Rules and Regulations, Residential Design Guidelines is already `guidelines`) in your part's optional
  `referencedDocuments` (key, kind, title, definedIn). Use their keys in `enforces.documents` and override selectors.

Re-encode with the new constructs:

- **`requirement`** (modality, `bearer` omitted/null): what an act needs to take effect: vote thresholds, quorum,
  consents of the Declarant, the Class "B" Member, Mortgagees or King County, ratification. These were obligations on an
  invented bearer; convert them.
- **`approval` check** `{ type: "approval", by: [party...], prior, written }`: "requires the Reviewer's/Board's (prior,
  written) approval or consent", "unless expressly authorized by the Board". Several required consents go in one `by`
  list. This replaces discretion rules and ad hoc consent booleans for those clauses.
- **`discretion`** only for "considered case by case", "variations may be considered", "in its discretion may permit".
  It now applies only in application-flow requests.
- **Override selectors** `{ documents, provisions, adoptedAfter, except }`: use them where one sentence overrides a
  whole document or article (variance powers, Declarant exemptions, grandfathering against later amendments such as
  3.5(f) and 4.3(a)/p3). Collapse per-subject fan-outs into one rule where the selector expresses it; a selector rule
  may omit `appliesTo` (null = the subjects of the selected rules).
- **`recurs`** (a schedule operand) on duties nobody files a request about (annual meeting, budget, insurance review),
  with request type `compliance-period`.
- **Party-valued properties** `{ type: "party", among }` instead of a boolean per party ("declarant-owned",
  "by-declarant", "builder-owned"): e.g. `lot.owned-by`, `work.performed-by`. The vocab part defines the shared ones;
  other parts use them.

For every `SCHEMA GAP:` note in your file: re-encode the clause if the new schema now expresses it and delete the note;
otherwise keep the note, updated. Add a note per remaining gap only. Finish with the check commands (type check and
`node check-ccrs.ts PART`) clean for your part.

## Approvals, sanction preconditions and liability (the latest schema change)

Read the updated `schema.md` sections: Approval versus discretion, Expressions item 9 (`approved`), Sanctions,
Invariants 8, Checks, Settings. Every part already compiles: approval checks got `needs: "all"`, liability entries got
`appliesWhen: null, until: null, except: []`, and part-assoc's precondition became a one-entry list for `violation`. Now
use the new constructs where the text calls for them, and delete each SCHEMA GAP note they resolve.

- **`approval.covers` references any thing** (core term, `to: null`). Notes saying an approval can only cover work are
  resolved: delete them, and drop any workaround they describe.
- **`needs: "any"`** on an approval check: "approval of A or B", "the Class B Member or its assignee". Several parties
  that must all consent stay `needs: "all"`. "A and (B or C)" is two rules.
- **`approved` condition** `{ type: "approved", from?, path, by, needs, prior, written }`: true when the thing at the
  path has the approvals; no approval is false. Use it where a rule depends on an approval already given ("previously
  approved", "approved improvements aren't affected").
- **`sanctionPreconditions` is a list**, each `{ requestTypes, condition, except, citations }`. Scope each procedure to
  the request types it governs, and except (by rule key, or a selector) the sanctions the text exempts. A waived hearing
  that keeps the notice is a separate entry for notice alone, with the waived sanctions excepted from the hearing entry.
- **Liability** entries take `appliesWhen` (sanction's request as subject), `until` (a date path it ends on) and
  `except` (sanctions it doesn't extend to).
- Every `except` list in clauses names sanction rules (checked).

Same checks as before: type check and `node check-ccrs.ts PART` clean for your parts.
