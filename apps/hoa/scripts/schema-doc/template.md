# Rules schema

> **First pass, for review.** The schema for an organization's governing documents and the rules in them: the
> documents, the organization's terms, the rules with their checks, and how a rule is evaluated. It
> replaces the first build's rule model, and the vocabulary and rule record in the
> [rule engine proposal](https://github.com/AndrewCraswell/hoa/pull/31) where they differ. The types, validators and examples
> are built in `src/schema/`; the pipelines aren't yet. The
> types on this page are generated from a file that type-checks against all __EXAMPLE_COUNT__ examples in
> [schema-examples.md](schema-examples.md), with every term and rule they reference defined.

| Part | What it holds | Concepts borrowed from |
| --- | --- | --- |
| [Sources](#1-sources) | Governing documents and their numbered provisions | Akoma Ntoso |
| [Vocabulary](#2-vocabulary) | Each organization's terms: things, properties, values, categories, units, and every way they're written | SKOS, SBVR |
| [Expressions](#3-expressions) | Conditions and arithmetic over facts, with missing facts handled exactly | DMN |
| [Rules](#4-rules) | What's required, prohibited, permitted or recommended, of whom, with exceptions, deadlines and sanctions | LegalRuleML, SBVR |
| [Checks](#5-checks) | How code decides whether a rule is met | DMN |
| [Evaluation](#7-evaluation) | The boundary with the rest of the portal: facts go in, findings come out | |

**Not in this schema:** what happens in an organization. Applications, violations, notices, hearings, fines imposed,
charges and payments, votes, decisions and appeals are each a feature's own records. Those features refer to rules by
key, send facts to be evaluated, and keep the findings that come back. See [Out of scope](#11-out-of-scope).

**Not versioned.** A rules file holds the documents as they read when it was generated. When they change, a new file is
generated; the portal keeps every file, and approvals and findings link to the exact one. Nothing inside a file records
history.

The standards are in [../standards/](../standards/README.md). The schema uses their concepts, not their formats.

## Principles

1. **The language is the product; the vocabulary is each organization's.** The schema fixes how rules are stated.
   The terms they're stated in come from each organization's documents, and its administrators edit them. Only the
   terms the portal itself depends on (parties, request types, units) are shared.
2. **Every meaning is explicit.** Every enumerated value is defined on this page, and nothing depends on the reader:
   "majority" says of what, "days" says which days, "may" says whether it restricts or only permits.
3. **Missing is never failing.** Every condition is true, false or unknown, and unknown never becomes "not met".
4. **One way to say each thing.** Each kind of clause has one encoding, so the extraction model can't express the
   same sentence two ways that evaluate differently.
5. **Exceptions are rules.** A stated exception, "case by case", a variance and a statutory override are each a rule
   with its own citation and an explicit override. Evaluation never settles a conflict by guessing.
6. **Keys link; labels show.** Documents, provisions, rules and terms have readable keys, and every link uses them.
   Screens show labels, so relabeling a term changes no link.
7. **Rules, not records.** The schema holds what the documents say. Facts about the world arrive with each evaluation
   request, from whichever feature owns them, and findings go back.
8. **Traceable.** Every finding names its rule, every rule cites the words it came from, and every document lists the
   files its text came from, with their hashes.

## Overview

```text
__DIAGRAM__
```

## Conventions

__TYPES:Conventions__

- **Keys and ids.** Governing documents, provisions, rules and terms have keys: `guidelines`, `guidelines:5.4.2(i)`,
  `guidelines:5.4.2(i)#colors`, `fence-run.height`. A key is readable and unique within the file, and links always use
  keys; screens show labels. An `id` names a record outside the file, such as an uploaded file, a lot or a user.
- **Term keys** are lowercase words joined by hyphens, with a dot between a thing and its property or a set and its
  value: `fence-run`, `fence-run.height`, `composite-color.winchester-grey`.
- **A rule key** is `{its main citation's provision key}#{aspect}`, where the aspect is a short name unique within that
  provision, such as `colors` or `max-height`.
- **Dates** are the organization's local calendar dates, in the time zone its settings name.
- **Money** is an amount in `usd`, rounded half up to the cent wherever an amount is charged.
- **Fractions** are exact: two thirds is `{ numerator: 2, denominator: 3 }`, never 0.667.

## 1. Sources

__TYPES:Sources__

- **A governing document** is the Declaration, the guidelines, the By-Laws, one decision letter. Its `edition` is the
  text the file holds: when it was adopted and took effect, and the files it came from. `adoptedBy` cites the
  resolution or minutes that adopted it, when the organization has them.
- **Kinds:** `statute` and `ordinance` are state and local law. `declaration` is the recorded covenants (CC&Rs);
  `supplemental-declaration` adds to them for part of the community, which its `governs` condition names; `plat` is the
  recorded subdivision map. `articles` are the articles of incorporation; `bylaws` say how the organization governs
  itself. `rules`, `policy`, `design-guidelines` and `resolution` are adopted by the board or a committee. `minutes` count only where they record a binding decision; `decision` is a decision on
  one request, such as a variance.
- **Provision kinds:** `article`, `section` and `point` are numbered levels; `paragraph` is unnumbered text within one;
  `definition` defines a term; `table` and `row` are tables and their rows; `exhibit` is an attachment such as a plat
  or a form; `recital` is a "whereas" clause.
- **A label** is a provision's number as printed, normalized: "5.4.2." becomes `5.4.2` and "Section 5.4.2 (i)" becomes
  `5.4.2(i)`. An item printed only as "(i)" or "a)" takes its parent's label in front: `5.4.2(i)`, `5.4.2(i)(a)`.
  Sections numbered within articles take the article number: Article 5, Section 2 is `5.2`. Articles and exhibits use
  their names (`article-5`, `exhibit-n`), and an unnumbered paragraph is counted within its parent (`exhibit-n/p3`). A
  label is unique within its document.
- **`num.source`** says how far to trust a number. `printed` is as it appears; `inferred` means code repaired an
  implausible sequence, such as "5.42" between 5.4.1 and 5.4.3; `counted` means the passage has no number and was
  counted among its siblings. Inferred and counted numbers are shown to the administrator to confirm.
- **A provision key** is `{document key}:{label}`: `guidelines:5.4.2(i)`.
- **Amendments.** A file holds each document as it reads when the file is generated. An amended document's text is
  consolidated: the original with each amendment applied, `basis: "consolidated"`, listing the original's file and each
  amendment's file in order. A rule's `effectiveFrom` is when its words took effect, so a rule an amendment changed
  takes effect from the amendment's date, and grandfathering selectors (`adoptedAfter`) compare against it. Applying
  amendments is part of generating a file, not part of the schema.
- **Referenced documents.** A document other documents name but nobody has uploaded yet (the By-Laws, the Board
  Rules) is a governing document with `edition: null`, so rules can name it by key and coverage
  can list it as missing. A document key nothing resolves raises `undefined-document`.
- **Lead-ins and wrap-ups.** A provision's `intro` is the text that governs its children ("The following activities
  are prohibited unless authorized by the Board:"), and `wrapUp` is text after them that finishes them. A citation of a
  child shows its ancestors' intros, its own text and their wrap-ups, so the operative words are never dropped.
- **Coverage.** Every provision is cited by a rule, a term or a setting, or has `noRule` with a reason an administrator
  approved: `heading`, `recital`, `reserved` ("[Reserved]"), `explanatory` (states no requirement), `duplicate` (says
  what another provision says) or `not-evaluated` (a requirement the portal doesn't evaluate yet). Any other provision
  is uncovered, and an organization's rules aren't complete while one is. This is what catches whole sections an
  extraction skipped, like the privacy screens and walls the phase 1 build missed.
- **A citation** points at a provision by key, with an optional highlight of the operative words, or a
  `region` on a drawing or plat (a box in fractions of the page). The quote shown is always the provision's own text,
  so it can't be typed or clipped.

## 2. Vocabulary

__TYPES:Vocabulary__

### Core and organization terms

- **Core terms** (`organizationId: null`) ship with the portal and are the same for every organization. A term is core
  only if portal code reads or writes it: the parties (owner, tenant, guest, occupant, applicant, organization,
  members, board, committee), the community and its lots, the request types with the fields their features supply
  (submitted on, notice delivered on, due on, total votes), and units.
- **Organization terms** are generated from one organization's documents and edited by its administrators: everything
  its documents define or regulate, such as fence runs, composite colors, Trex, return fences and commercial vehicles.
- **Refining a core term.** An organization term with a core term's key replaces the core term's labels, definition,
  citations and derivations for that organization. Its kind and value type must stay the same, because code depends on
  them. That's how the sample organization's documents make "Unit" the label for `lot`. Looking up a key finds the
  organization's term first, then the core one.

### Kinds

| Kind | Meaning | Example |
| --- | --- | --- |
| `thing` | Something rules talk about. Its `nature` is `party` (a person or body that can bear a rule: owner, board), `request` (something a feature asks to have evaluated: an application, a violation, an assessment), `event` (something that happens at a time: a parking, a vote), `document` (a file a requester provides: a site plan) or `object` (anything else: a fence run, a lot). A request thing carries its `request` data | fence run |
| `category` | A kind of another thing, with criteria that decide membership | return fence |
| `property` | A characteristic of a thing, with a value type; `many` for lists | fence height |
| `value` | A named value in a set; `broader` groups values ("grey tones") | Winchester Grey |
| `value-set` | The values a choice can take. A complete set rejects anything else; an open set accepts unlisted values | composite colors |
| `unit` | A unit of measure; converts only within its dimension | foot |

**Request types are data.** A thing of nature `request` says how its requests work: its `flow` is `application` (an
owner asks for approval), `enforcement` (a violation or a delinquency), `filing` (a meeting, a records request, a
nomination) or `duty` (a compliance period the portal creates for a recurring duty); `governingDate` names the property
that sets its governing date; and `lot` says whether its requests concern a lot (`required`, `optional`, `none`).
Rules about applications, remedies, discretion and the recommendation all key on `flow`, never on a list of names.

**Parties as values.** A property whose value is a party (`{ type: "party" }`, optionally limited by `among`) says who
did, owns or approved something: `lot.owned-by`, `work.performed-by`, `approval.by`. A fact names the party term, and
`=` and `in` match it, with a category of a party (an affiliate of the Declarant) counting like a broader value. Use it
instead of a yes-or-no flag per party ("declarant-owned").

### Labels

- Exactly one `preferred` label, which is what every screen shows. `alternative` labels are synonyms and spelling
  variants the matcher accepts ("fence segment", "Winchester Gray"). `hidden` labels are misspellings it accepts but
  never shows. `avoid` labels are words this organization doesn't use for the term; they're flagged if they appear in
  a rule.
- After normalizing case, spacing, punctuation and quote marks, a text appears at most once on a term, and resolves to
  one term within a scope: the things, the properties of one thing, or the values of one set. A collision is an
  `ambiguous-label` issue unless `context` tells the terms apart.
- Word-order and possessive variants ("height of fence", "fence's height") are generated by code from the thing's and
  property's labels. They're never stored.
- A rule's statement links terms as `{{fence-run}}` or `{{lot:plural}}`, and shows the current preferred label, so
  relabeling a term updates every statement.
- A term's `definition` is a phrase that could replace the term in a rule without changing its meaning; `scopeNote`
  says where it applies and doesn't.

### Values, units and silence

- A choice fact names a value term. In an open set, a value that matches no term is kept as text (`term: null`), and
  text is never equal to or in any listed value. In a complete set, a value that matches no term makes the fact
  `uncertain` and raises `invalid-value`.
- Units convert by `perBase`, an exact decimal count of the dimension's base unit: inch, square inch, cubic inch,
  pound, mile per hour, US dollar, 1 for ratios (a percent is 0.01), calendar day for elapsed time and month for
  calendar periods. Months and years never convert to days, and business days never convert to anything; both are
  applied by date arithmetic ([section 3](#3-expressions)).
- **`ifUnstated`** says what silence means for a property. `unknown`: not stated is missing (a fence's height).
  `absent`: not stated means there is none (lattice). It's set per property, because only the organization's documents
  and practice can say which.
- A derived property takes the value of its first derivation whose `when` holds, and is unknown if none does. Derived
  properties are never stated. A deeming clause ("notice is deemed delivered three days after mailing") is a derived
  property of its own, so the actual date can still be stated alongside it.

### Editing terms

- **Merge**: the surviving term keeps its preferred label; the other's preferred and alternative labels become
  alternatives and its hidden labels stay hidden. The other term is removed, and every rule that used it now uses the
  survivor.
- Every label records where it came from.

## 3. Expressions

__TYPES:Expressions__

How expressions evaluate:

1. **Paths.** A path starts at its root: `subject` is the thing the rule is being evaluated on, `request` the request
   itself, `lot` the request's lot, `community` the whole community. Each step is a property of the thing the previous
   step reached, and a reference property moves on to the thing it references. An empty path is the root itself. A
   many-valued step can only be counted, aggregated or quantified.
2. **Three values.** Every condition is true, false or unknown. A path is unknown when its fact is missing,
   `conflicting`, or `uncertain` (below the organization's fact confidence threshold).
3. **Logic.** `all` is false if any part is false, otherwise unknown if any part is unknown, otherwise true. `any` is
   the mirror image. `not` swaps true and false and leaves unknown. `every`, `some` and `none` apply `all`, `any` and
   `not any` to the items that satisfy `where`; an item whose `where` is unknown counts as unknown.
4. **Numbers with unknowns are ranges.** An unknown quantity, count or amount of money is anywhere from 0 up, and an
   unknown date is any date. Arithmetic carries the range through, and a comparison is true or false only when every
   value in the range agrees. So a 95-inch fence fails "fence plus lattice at most 90 inches" even when its lattice
   height is unclear.
5. **Lists.** A many-valued fact says whether its values are `complete`. `count`, `sum-of`, `greatest-of` and
   `least-of` over an incomplete list are open-ended ranges, so "at most three pets" over a partial list can only be
   not met or unknown, never met.
6. **Absent.** An absent quantity or count is 0. An absent value, reference or date makes `in` and every comparison
   false, except `!=`, which is true.
7. **Units and arithmetic.** A quantity converts to the other side's unit before comparing. `sum`, `difference`,
   `greatest` and `least` need operands of one dimension. `product` multiplies a quantity by a number or fraction.
   `quotient` of two quantities of one dimension, or of two counts, is a ratio. `shift` adds an amount of time to a
   date. Anything else is a `type-mismatch` when the rule is saved, never something evaluation has to handle.
8. **Values.** `=` compares value terms exactly. `in` also accepts a value whose broader terms include a listed one.
9. **`exists`** asks whether there is one: true when known, false when absent, unknown when unknown.
   **`approved`** is true when the approvals covering the thing at its path satisfy the test (every party in `by`
   approved, or any one with `needs: "any"`; in writing when `written`; on or before the governing date when `prior`),
   and false otherwise. The feature that records approvals sends every approval it has for the request's things, so no
   approval is false, not unknown; a conflicting or uncertain approval fact, or an unknown thing at the path, is
   unknown.
10. **Time windows** use the organization's local time. A `daily` window whose end is before its start wraps past
    midnight, and an `annual` one wraps the year end. A `recurring` window has one occurrence around each date of its
    schedule. `within` means the whole span falls inside one occurrence; `overlaps` means any part of it does. An
    unknown end means the span may run on indefinitely. A window around a single date is a deadline, not a window.
11. **Date arithmetic.** Calendar days add days. Business days skip weekends and the organization's holidays. Months
    and years keep the day of the month, clamped to the month's last day. A bound without `at` covers the whole day;
    `at` pins the time.
12. **Two dates.** `governing-date` is the request's governing date, so a condition about age or elapsed time ("a pet
    over 4 months old", "owned a lot for 12 months") is judged as of the date that matters, and always gives the same
    answer. The evaluation date, when the portal runs the check, is never readable by a condition: only deadlines and
    cure periods use it, to tell whether time has run out.
13. **`text`** conditions are allowed only in applicability (`appliesWhen` and category criteria). A model judges them
    from the request, and every one is counted, per organization and across organizations: they're the measure of
    what the language can't yet express. A question about compliance is a `judgment` check instead.

## 4. Rules

__TYPES:Rules__

One rule as the [examples](schema-examples.md) show it, without bookkeeping fields (5.5.1(i)):

__EXAMPLE:Boundary and return fences at most 72 inches (5.5.1(i))__

### Kinds of rule

| Kind | What it says | Example |
| --- | --- | --- |
| `norm` | What a party must, must not, may or should do, or what an act needs to take effect | Fences on a boundary at most 72 inches |
| `discretion` | That a body may decide case by case when other rules aren't met. It can't make anything compliant; it sends the finding to `decidedBy` | "Other manufacturers considered case by case" |
| `sanction` | What may or must be imposed when other rules aren't met: a fine, a fee, interest, a charge, a suspension, self-help, towing, a lien or legal action | A fine schedule |
| `limit` | That law or a higher document forbids or caps sanctions while its conditions hold | A statutory cap on fines |

### Modality

| Modality | Means | A failed check is |
| --- | --- | --- |
| `obligation` | must, or must not, as its check states: the check always says what complies | not met |
| `prohibition` | the subject itself is prohibited (vinyl fences, front-yard sheds); never has a check | not met |
| `permission` | may; it only has effect by overriding another rule, otherwise it's advice and isn't evaluated | |
| `recommendation` | should | advisory |
| `requirement` | what an act needs to take effect: a vote's threshold, a consent, a ratification; no `bearer`, no remedy or cure, never sanctioned | not met: the act doesn't take effect |

"Must not park between 2 and 5 a.m." is an obligation whose check is "not parked then". "May … only if" and "limited
to" restrict rather than permit, so they're obligations too: the composite colors in 5.4.2(i) are an obligation.

**Approval versus discretion.** "Requires the Reviewer's prior approval" and "unless authorized by the Board" are an
`approval` check: whether that body approved this subject (approvals arrive as facts, from the feature that records
them, each covering any thing: work, a vote, a pet, a parked vehicle). `needs: "all"` requires every party in `by`
("the Declarant's and the Board's consent"); `needs: "any"` requires one ("Article 4 approval or the Board's
authorization"). The same test is a condition, `approved`, for a rule that depends on an approval already given
("improvements approved before the amendment aren't affected"). "Considered case by case" and "variations may be considered" are a `discretion` rule. Discretion only applies
in requests whose flow is `application`, where a body is about to decide; in a violation, a rule a discretion rule
covers is simply not met unless an approval was recorded, so it can still be enforced.

**Exceptions.** Every rule can be overridden by an exception, a more specific rule or a variance, unless
`noExceptions` cites the passage that rules them out ("no variance will be granted"). Only law can override such a
rule.

### Parties, domains, request types and remedies

- **`bearer`** is who must comply, and must be a party; a `requirement` has none. **`beneficiary`** is who the rule is owed to or involves: the
  neighbor who signs, the owner who asked for records. **`decidedBy`** is who decides a judged or case-by-case finding.
  Who answers for a violation by someone else (a tenant, a guest) is a setting, not a rule field.
- **Domains:** `architectural` (changes to lots and buildings, and the review process), `use` (conduct and how lots are
  used: parking, pets, leasing, nuisance), `maintenance` (upkeep and who maintains what), `financial` (assessments,
  fees, collection), `governance` (meetings, voting, elections, records, the board and committees), `enforcement`
  (notices, hearings, fines, self-help), `general` (interpretation, definitions, severability).
- **`requestTypes`** are the kinds of request a rule is evaluated in. A fence rule runs in applications and in
  violations, so an existing fence is judged by the same rule as a proposed one; a pet limit runs only in violations.
- **Remedies** say what fixes a finding:

| Remedy | Means | Set by |
| --- | --- | --- |
| `provide-information` | A fact the rule needs is missing | evaluation |
| `provide-document` | A document the rule needs is missing or doesn't say what it must | evaluation |
| `change-detail` | A change within the same design: a color, a height, a setback | the rule |
| `redesign` | A different design: another material, location or type | the rule |
| `none` | Nothing the applicant changes fixes it: a prohibited use | the rule |

A rule has a remedy exactly when it runs in applications and binds the owner or applicant. Violations use cure
periods instead.

### Overrides

`overrides` lists rule keys, or a **selector**: every rule from some `documents`, or under some `provisions` (and
their descendants), optionally only rules whose `effectiveFrom` is after the date at `adoptedAfter` (grandfathering: "existing
improvements aren't affected by later amendments"), minus `except`. A selector is resolved at evaluation; findings record the resolved keys. A rule with a selector may leave `appliesTo` null, meaning the
subjects of whichever rules it selects.

When rules override rule B on a subject, only the ones that apply to that subject count, and a rule that is itself
displaced or exempted there has no effect. Then, in this order:

1. **Displaced.** If an `obligation`, `prohibition` or `recommendation` overrides B, B is `not-applicable` and that
   rule's own check decides instead: a variance, a more specific limit. If several do, the highest-ranked wins, then the
   latest effective.
2. **Exempt.** Otherwise, if a `permission` overrides B, B is `exempt`: grandfathering, a statutory protection.
3. **Decided by.** Otherwise B is evaluated, and if it isn't met and a `discretion` rule overrides it, it goes to that
   rule's `decidedBy` as `committee`.

If it's unknown whether an overriding rule applies, and knowing would change B's outcome, B is `missing-information`,
naming the facts that rule needs.

### Rank and conflicts

- **Rank.** A rule's rank is the position of its main citation's document kind in the organization's precedence. A
  decision rule ranks as the document of its `authority`, the
  provision granting the power it used. "Law" means `statute` and `ordinance`.
- **Valid overrides.** An override is valid only when the overriding rule ranks at or above the rule it overrides, and
  only law overrides a rule with `noExceptions`. Overrides can't form a cycle. Selectors are checked on what they
  resolve to. Anything else is `override-not-allowed`.
- **Conflicts.** Two rules conflict when no subject can satisfy both. Code checks the case it can decide: two rules on
  the same kind of subject whose checks compare the same path with constants that can't both hold, such as at most 72
  inches and at least 80. Other conflicts are found in review. A resolution is proposed as an override: the higher rank
  wins, then the later effective date. Rules that can both be satisfied aren't in conflict, even when one is stricter:
  every rule in force applies at once.

### Deadlines, cure, sanctions and limits

- **Deadlines** are checks ([section 5](#5-checks)): an act, an anchor date and a window around it. They cover response
  times, notice periods, completion deadlines, appeal windows and due dates, on any party. A rule with `recurs` (a
  schedule) is a duty nobody files a request about, such as holding the annual meeting: the portal creates one
  `compliance-period` request for that rule on each date of the schedule, and an anchor that's a schedule uses the
  occurrence on the request's governing date, or the latest before it.
- **Cure.** A violation of a rule about an event (a parking, a party, fireworks) is over, so it can't be cured. Any
  other violation has a cure period: the rule's `cure`, or the organization's default, counted from the date at its
  `after` path (the notice, or the missed due date); a period of 0 days ends on that date, such as a deadline the notice
  sets. `curedBy` names the date the violation was cured, when the request carries one: a cure within the period makes
  the sanctions that enforce the rule not applicable. With no cure on the rule and none in the settings, there's no
  cure period. `cure: "none"` is for health and safety. A rule with a cure period can't have the remedy `none`.
- **Sanctions** are available on a not-met finding of a rule they enforce, in the same request, once any cure period
  has passed, every sanction precondition for the request's type holds unless it excepts the sanction (notice
  delivered, a hearing held if one was requested),
  the sanction's own `appliesWhen` holds, and any `after` period has run to the evaluation date ("more than 30 days
  delinquent"). A sanction `enforces` listed rules, whole documents by key, or both, minus `except`; enforced rules are
  obligations or prohibitions that run in the sanction's request type. It's imposed on the parties in `against`, plus
  whoever the liability settings make answer for them: a liability applies to a sanction it doesn't except, while its
  `appliesWhen` holds and before its `until` date. A sanction's `appliesTo` is the request type it runs in. Its
  amount is the entry in `amounts` for this occurrence (the last entry covers every later one), `none` for a sanction
  that isn't money, or `set-by-imposer` when the documents leave the amount to the body that imposes it; plus
  `repeats` for each period from `repeats.from` (by default, the end of the cure period) until the violation is cured
  or the evaluation date, up to `cap`. The occurrence number comes in as a fact (`violation.occurrence`), counted by the enforcement
  feature as `occurrences` defines: within a period, the same rule or any enforced rule, per owner or per lot, and
  whether violations cured in time count. `lasts` says how long a suspension runs, or at most how long. A `permission` sanction is the
  imposing body's choice; an `obligation` one must be imposed.
- **Limits** apply to the sanction rules they name while their conditions hold: `forbids` blocks the sanction, and
  `maxAmount` and `maxTotal` cap it.

### Decision rules

A variance or a condition of approval is a rule whose main citation is a `decision` document. It has a `scope`: the lot
and, usually, the approved improvement it covers (by its id in the feature that approved it), so it ends when that
improvement is removed or replaced, not when the lot changes hands. It cites its `authority`, which sets its rank. It
applies to its scope from the moment it's approved, whatever the request's governing date, so a variance governs the
very application that asked for it.

### Invariants

Checked by code whenever a rule is saved:

1. At least one citation before approval. When a rule is created, its key starts with its main citation's provision
   key.
2. `obligation`, `recommendation` and `requirement` have a check; `permission` and `prohibition` never do. A
   `requirement` has no bearer, remedy or cure, and no sanction enforces it; every other norm has a bearer.
3. A `discretion` rule has a `decidedBy` and at least one override. A `judgment` check has a `decidedBy`.
4. Every term key resolves (`undefined-term`); every path step is a property of the thing before it; arithmetic and
   comparisons follow the typing rules (`type-mismatch`); values belong to their property's set (`invalid-value` for
   complete sets).
5. `bearer`, `decidedBy` and `imposedBy` are parties: things of nature `party`, or categories of them.
6. Overrides are valid and acyclic (`override-not-allowed`), and table rows don't overlap (`table-overlap`).
7. A remedy is present exactly when the rule runs in applications and binds the owner or applicant.
8. A sanction's `appliesTo` is one of its request types; it enforces at least one rule or document, every document
   key resolves (`undefined-document`), and every enforced rule is an obligation or prohibition sharing that request
   type. A limit names only sanction rules, and so does a sanction precondition's or a liability's `except` list (a
   selector there counts only the sanctions it selects). `appliesTo`
   is null only with an overrides selector.
9. Decision rules have a `scope` and an `authority`; no other rule has either.
10. A `text` condition raises `text-condition`, and a property that's `absent` when unstated in the `appliesWhen` of an
    overriding rule raises `absent-in-exception`, because silence would quietly deny the exception. Neither blocks
    approval; both are measured.

| Issue | Raised when | Blocks approval |
| --- | --- | --- |
| `citation-not-found` | A highlight doesn't match its provision's text | yes |
| `undefined-term` | A key doesn't resolve in the organization's vocabulary | yes |
| `avoided-label` | The statement uses a label the organization avoids for that term | no |
| `type-mismatch` | Arithmetic or a comparison breaks the typing rules, or a path step isn't a property of the thing before it | yes |
| `invalid-value` | A value isn't in its property's complete set | yes |
| `ambiguous-label` | A label resolves to more than one term in the same scope | no |
| `conflict` | No subject can satisfy this rule and another one | yes, until resolved |
| `override-not-allowed` | An override breaks precedence, targets a rule with `noExceptions`, or forms a cycle | yes |
| `table-overlap` | Two table rows can match the same inputs | yes |
| `text-condition` | A condition or category's criteria are free text | no |
| `absent-in-exception` | An exception depends on a property that's absent when unstated | no |
| `undefined-document` | A document key doesn't resolve to a governing document | yes |
| `unencoded-quantity` | An amount, percentage, count or duration in a cited provision appears in no rule, term or clause, and no note explains it | yes, until resolved |
| `modality-cue-mismatch` | A rule's modality disagrees with the deontic cues of the sentences it cites | no |

## 5. Checks

__TYPES:Checks__

| Check | Complies when |
| --- | --- |
| `test` | The condition is true |
| `table` | The row that matches the inputs says `met`, or no row matches and `otherwise` is `met`. Lists keyed by another value, such as colors by manufacturer |
| `document` | A document of the type is in the request, one per subject when `per` is `subject`; the document reader confirms each `mustState` statement with a quote; every `signedBy` party signed |
| `deadline` | The act happened between `anchor + earliest` and `anchor + latest` |
| `judgment` | A model answers the question "yes" from the `evidence`; the question is always phrased so that yes complies |
| `approval` | Every party in `by` approved the subject, or any one of them with `needs: "any"`: an `approval` fact covering it, with status approved, in writing when `written`, dated on or before the governing date when `prior` |

### Evaluating a request

1. **Rules.** The rules whose `requestTypes` include the request's type and whose `effectiveFrom` is on or before the
   governing date. Decision rules apply to their scope from approval, whatever the date.
2. **Subjects.** Each entity whose type is the rule's `appliesTo`. When `appliesTo` is a category, each entity of the
   category's underlying thing, with membership decided by its criteria. A decision rule only sees the entity its
   scope names.
3. **Applies.** The request's lot is one the rule's document governs, and `appliesWhen` holds. False is
   `not-applicable`. Unknown is remembered.
4. **Overrides**, as in [Overrides](#overrides).
5. **Check.**
   - `test`: the condition's value.
   - `table`: a matching row's result; if every row is false, `otherwise`; if some rows are unknown, the result is
     still known when every possible result is the same, and unknown otherwise.
   - `document`: a missing document, or an unconfirmed statement, is unknown; a statement the document contradicts
     (the neighbor objects) fails; otherwise it complies.
   - `deadline`: an act inside the window complies and one outside it fails. An act stated `absent`, or not stated
     when its property is `absent` when unstated, hasn't happened: `pending` until the window ends, failing after it.
     An act not stated when its property is `unknown` when unstated is `pending` until the window ends and unknown
     after it, so a feature that doesn't send the date never causes a failure. A conflicting or uncertain act, or an
     unknown anchor, is unknown. When it fails, the finding reports the `onMiss` effects, dated
     when the window closed; the feature that owns the target records them.
   - `judgment`: an answer at or above the organization's judgment confidence threshold decides it; anything else is
     unknown.
   - `approval`: the test is satisfied: complies. It can no longer be (one denied with `needs: "all"`, every one
     denied with `needs: "any"`): fails. Otherwise, in a request whose flow is `application` the outcome is
     `committee` (the body is about to decide), and elsewhere it fails.
   - No check (an outright prohibition): fails.
6. **Outcome.**
   - Complies: `met`, even if applicability was unknown.
   - Pending: `pending`.
   - Fails: `missing-information` if applicability, or an overriding rule's applicability, is unknown; otherwise
     `committee` if a discretion rule applies and the request's flow is `application`; otherwise `advisory` for a
     recommendation; otherwise `not-met`.
   - Unknown: `committee` for a judgment, `missing-information` for anything else.
7. **Remedy.** `not-met` takes the rule's remedy. `missing-information` is `provide-document` for a document check and
   `provide-information` otherwise.
8. **Sanctions and limits**, for each `not-met` finding, as in [Deadlines, cure, sanctions and
   limits](#deadlines-cure-sanctions-and-limits): `available` with the amount, `blocked` when a limit forbids it,
   `missing-information` when a condition is unknown, or `not-applicable`.

| Outcome | Means |
| --- | --- |
| `met` | Complies |
| `not-met` | Doesn't comply, and nothing makes an exception |
| `advisory` | Doesn't follow a recommendation |
| `missing-information` | Can't be decided until a fact or document is provided |
| `committee` | The committee or board decides: a discretion rule applies, or a judgment couldn't be made confidently |
| `pending` | A deadline that hasn't passed |
| `exempt` | A permission exempts the subject |
| `not-applicable` | Doesn't apply, or a more specific rule displaced it |
| `available` | A sanction may (or must) be imposed, with its amount |
| `blocked` | A limit forbids the sanction |

### From findings to a recommendation

For an application, each finding whose bearer is the applicant or owner maps to an action: `not-met` to the
organization's decision policy for its remedy, `missing-information` to request information, `committee` to refer to
the committee, and anything else to approve. The recommendation is the first action that occurs, in this order: deny,
request information, refer to the committee, approve with conditions, approve. Advisory findings are listed as
suggestions. Findings about the committee or board, such as their own deadlines, never count against the applicant. Nor does an
`approval` check by the party the organization's `deciders` name for the request type: that approval is the decision
the application asks for, so its finding is shown to the committee but doesn't set the recommendation.

## 6. Settings and questions

__TYPES:Organization settings__

__TYPES:Questions__

- **Settings** hold two things. `clauses` are what the documents and law say about how rules work, each cited:
  `precedence` (from the conflicts clause and state law; decisions take their rank as described above),
  `time` (what an unqualified "days" means, whether a deadline on a weekend or holiday rolls to the next business day,
  the holiday calendar and the time zone), `liability` (who answers for whom: an owner for a tenant or a guest, a seller
  until the board receives notice of the sale, with the sanctions it doesn't reach), `deciders` (who decides each request type: the committee decides architectural applications), the default `cure`
  period (none when it's null) and `sanctionPreconditions`, the procedures sanctions need first (notice, and a hearing if one was
  requested), each for some request types and with the sanctions it exempts, so none is copied into each sanction. `policy` is the organization's own operating choices: the decision policy for applications
  and the confidence thresholds.
- **Interpretation questions** come from extraction when a provision reads two ways. Each option keeps different
  candidate rules, which stay `proposed`; answering approves the kept rules and rejects the others, and the answer is
  the record of why.
- **Conflict questions** ask the administrator to resolve a `conflict` issue. The answer approves an override or
  rejects one of the rules, and resolves the issue on both.

## 7. Evaluation

__TYPES:Evaluation__

- **A request** is what a feature sends to be evaluated: an application, a violation, an assessment, a lease
  registration, a meeting, a records request, a nomination, or a compliance period. Its type is a core term.
- **The governing date** is the date the request is judged as of: a rule applies only from its `effectiveFrom`, and
  the feature picks the rules file in force on that date. Each request type's `governingDate` names the property that sets
  it: the submission date of an application, the date a violation was observed, an assessment's due date, a meeting's
  date, a compliance period's scheduled date. A draft evaluated before submission uses the evaluation date and is
  provisional.
- **Entities** are the things in the request: `request` itself, its `lot`, the `community`, and one per thing it
  concerns (`run-1`, `gate-1`, a vehicle, a pet). `ref` is the entity's id in the feature that supplied it, which is
  how a decision rule finds the approved improvement it covers.
- **Facts from outside the request.** Some rules need data that other features hold: the number of leased lots, the
  total voting power, approvals already granted, how many times this owner has violated a rule. The feature that
  owns that data supplies it as facts, keyed by terms like any other fact, as of the governing date and with `system`
  provenance. The schema defines the terms; it never stores the data or queries other requests.
- **Facts** are `known`, `absent` (stated as none), `conflicting` (the sources disagree) or `uncertain` (below the
  confidence threshold, or a value a complete set doesn't contain). A property with no fact is unknown, or absent when
  the property's `ifUnstated` says so. A many-valued fact says whether its list is `complete`.
- **Documents** are the requester's files, classified by type, each linked to the subjects it covers and the entities
  who signed it. Document checks read them.
- **Findings** go back to the feature, which keeps them in its own records. Each one names the rule, the
  subject, the outcome and remedy, every fact it read (for applicability and the check), the rules that modified it,
  a judgment's answer, a document's confirmed statements, the effects of a missed deadline, and a sanction's amount.

### The rules file

One organization's documents, provisions, terms, rules, settings and questions travel as a single JSON file. A Zod
schema validates it, and the Zod schema's output type is checked to equal the types on this page, both ways. Core terms
ship with the portal and aren't in the file, and the organization's `settings` are one object; `proposedCore` holds core terms extraction needed that the portal doesn't have yet, for review.

**Drafts.** Extraction and the editor send drafts, not stored records. A draft leaves out what code fills
(provenance, review, issues) and may omit any field whose default is null, an empty list or false. The
Zod draft schemas fill the defaults, and their output is checked to equal the stored types minus the bookkeeping.

__TYPES:Rules file__

## 8. Traceability

- **Back from a finding:** its rule → the rule's citations → the provisions, highlighted → the document's edition → its
  files, with their hashes.
- **New documents, new file.** When a document is amended, restated or added, a new rules file is generated from the
  documents as they then read. The portal keeps every file, and an approval or finding records the file it was
  evaluated against, so evaluating the same request with the same facts and the same file always gives the same
  findings.

## 9. Coverage

How the clauses governing documents contain are encoded. Each name in the last column is an example in
[schema-examples.md](schema-examples.md). Rules from outside the sample's guidelines are illustrative.

| Clause | Encoding | Example |
| --- | --- | --- |
| Allowed values keyed by another value | `table` check | Colors by manufacturer |
| "Considered case by case", "variations may be considered" | `discretion` rule | Other manufacturers case by case |
| Maximum, minimum, range | `test` with `compare` or `between` | Metal 48 to 72 inches |
| Combined measurements | `sum` | Fence plus lattice at most 90 inches |
| "Should" | `recommendation` | Front setback |
| Two parts must match | `compare` of two paths, following references | Gates match the fence |
| Neighbor sign-off, required plans | `document` check, per subject | Neighbor approval |
| Aesthetic or safety judgment | `judgment` check | Driver sight lines |
| Outright prohibition | `prohibition` with no check | An outright prohibition |
| Committee response time, deemed approval | `deadline` with a `deems` effect | Committee decides within 30 days |
| Approval expires if work doesn't start | `deadline` deeming the approval expired | |
| Appeal within a set time | `deadline` on the appeal request | |
| Grandfathering | permission with an overrides selector and `adoptedAfter` | Existing fences may remain |
| "Requires prior approval", "unless authorized by the Board" | `approval` check | Work needs prior approval |
| "Approval of the committee or the Board" | `approval` check with `needs: "any"` | Either body's approval |
| "Improvements already approved aren't affected" | `approved` condition | Existing fences may remain |
| Variance for one improvement | decision rule with a scope and authority | A variance for one approved fence |
| Statutory protection (solar, flags, satellite dishes) | permission from law | State law overrides it |
| Supplemental declaration for one phase | the document's `governs` condition | |
| Quiet hours, overnight parking | `during` with a daily window, on an event | No commercial vehicles on the street overnight |
| Windows around a schedule (trash, decorations) | `recurring` or `annual` window | Trash containers out only around pickup |
| Limits on how many | `count` with a filter | At most three dogs and cats |
| Totals across items (total fence length) | `sum-of` over a many-valued path | |
| Minimum lease term | `compare` in months | Leases at least 12 months |
| Rental cap | community facts against a `fraction` | Rental cap |
| Maintenance standards | `judgment` decided by the board, with a cure period | Keep landscaping maintained |
| Self-help | `sanction` of type `self-help` | Self-help |
| Assessments and due dates | `deadline` on the owner, with a cure period | Assessment due January 1 |
| Late fees, interest | `sanction` with `greatest` and `product`; interest as `repeats` | Late fee |
| Escalating and daily fines, caps | `sanction` `amounts`, `occurrences`, `repeats`, `cap` | Fine schedule |
| Notice and hearing before fines | `sanctionPreconditions`, plus the cure period | Organization settings |
| Emergency self-help without notice | the sanction in a precondition's `except` | Organization settings |
| Law capping or forbidding fines | `limit` rule | A legal cap on fines |
| Suspension of privileges | `sanction` with `suspends` and `lasts` | |
| Owner answers for tenants and guests | `liability` setting | Organization settings |
| Seller liable until the board is notified of the sale | `liability` with `until` | |
| Notice deemed delivered | a derived property of its own | A derived property: notice deemed delivered |
| Meeting notice window | `deadline` with negative offsets | Meeting notice 10 to 60 days ahead |
| Quorum, vote thresholds, consents to an act | `requirement` with a `quotient` against a `fraction` and an explicit base | Quorum, Declaration amendment vote |
| Records requests in business days | `deadline` in `business-day` | Records within 10 business days |
| Recurring duties (annual meeting, budget) | `recurs` with a `deadline` in a compliance period | An annual meeting each year |
| Age and time held | `governing-date` in a condition | Board candidates own a lot for 12 months |
| Declarant rights until a share of lots is sold | `appliesWhen` on community facts | |
| Which document wins | `precedence` clause | Organization settings |
| "Days" and weekends | `time` clause | Organization settings |
| A provision that reads two ways | interpretation question with candidate rules | An interpretation question |
| Amendments | a consolidated text in a new file; the rule takes effect from the amendment's date | A rule from an amended provision |
| Plats and drawings | a citation's `region` | |

## 10. What changes from the first build

| First build | In this schema |
| --- | --- |
| A global catalog of attributes, fence-only | Each organization's vocabulary, with a small shared core |
| `aliases` repeated on every rule's values | Labels on value terms, once |
| `obligation`: required, prohibited, permitted, recommended | `modality`; restrictions are obligations; "case by case" is a `discretion` rule |
| `discretion: committee` and `otherwise: committee` | `discretion` rules and `judgment` checks |
| `exceptions: string[]` | Exception rules with `overrides`, and `noExceptions` |
| `isCurable` | `remedy` for applications, `cure` for violations |
| `allowed-values`, `prohibited-values`, `range`, `matches`, `required-fact` | `test` over one expression language |
| `allowed-values-by` | `table` |
| `required-document`, `qualitative`, `informational` | `document`, `judgment`, no check |
| Fact conditions and text conditions | `Condition`; text stays as the measured escape hatch, in applicability only |
| Project types | `requestTypes` and `appliesTo` |
| An LLM-generated `ruleKey` | `{provision key}#{aspect}`, readable |
| A citation's quote, page and character range | A provision by key, with a highlight or a region |

## 11. Out of scope

These are records of what happens, and belong to the features that create them. They reach this schema only as facts
in an evaluation request, and they keep the findings that come back.

- Applications and their submissions, statuses and decisions, including partial approvals and conditions as granted.
- Violations: inspections, notices sent, hearings held, cures, and fines or other sanctions actually imposed.
- Assessments as a ledger: charges, payments, balances and how payments are applied.
- Meetings, ballots, votes, recusals and minutes as events.
- People: owners, tenants, ownership and occupancy over time.
- Who can see what, and staff roles and permissions.
- Reusing rules across organizations, such as a management company's templates.
- Keeping rules files over time, choosing the one in force for a request, and linking approvals to it.

## 12. Open questions

- **Shared law.** Today each organization uploads the statutes it relies on, like any governing document. Sharing law
  across organizations would mean recording each law's jurisdiction (federal, state, county, city) and each
  organization's location, so the laws that apply are found by address, and linking each organization's terms to the
  law's.
- **Master and sub-associations.** How precedence works between a master association's documents and a
  sub-association's.
- **Computations beyond checks.** Election results (cumulative voting), allocating assessments across lots, and budget
  limits need computed results, not compliance checks.
- **Judgment thresholds.** One threshold per organization, as here, or one per rule.
