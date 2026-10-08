# Rule model

A rule is one checkable requirement from an HOA's governing documents, stored as data. Every HOA uses the same rule
shape, the same project-type catalog and the same prompts; only the rule data differs. That's what lets the product
onboard new HOAs without HOA-specific prompts.

## Design goals

- **Checkable.** Wherever the source allows, a rule carries a typed check ("height at most 72 inches") that code
  evaluates. Models read documents and applications; they don't do arithmetic or list matching.
- **Faithful.** Every rule keeps the governing text's meaning, qualifiers and exceptions, and cites the passage it came
  from. Citations are checked against the stored page text before an administrator sees the rule.
- **Reviewable.** An HOA administrator approves, edits or rejects each rule. Nothing reaches homeowners unapproved.
- **Versioned.** Published rulebooks are immutable. A review records which rulebook it used.

## Project-type catalog

The catalog is global, lives in code (`src/rules/catalog.ts`) and has a version number, `catalogVersion`. Attributes and
enum values are **append-only**: a published rulebook stores the catalog version it was built with, and old rulebooks
keep working because nothing they reference is renamed or removed. That makes version 1 expensive to get wrong, so it
covers everything the sample's fence article needs.

A project is made of **components**. A fence is one or more **segments** and zero or more **gates**, because many fence
rules apply to one run, not the whole fence: neighbor approval applies to runs on a shared boundary, and golf-course
runs must be open metal.

```ts
type ProjectType = {
  id: "fence" // later: "exterior-paint", "deck", "landscaping", ...
  label: string
  components: ComponentKind[] // fence: "segment" | "gate"
  attributes: Attribute[]
  documents: DocumentRequirement[]
}

type Attribute = {
  key: string // "segment.height", unique within the project type
  scope: "project" | ComponentKind
  label: string
  kind: "number" | "text" | "enum" | "boolean"
  unit?: "in" | "ft" // numbers are stored in this unit
  values?: string[] // for enums
  presence?: string // for attributes of an optional feature: the boolean that says the feature exists
  isRequiredForReview: boolean // missing means the homeowner is asked for it
}
```

### Fence attributes (catalog version 1)

| Scope | Attributes |
| --- | --- |
| Project | `replacesExisting` (boolean), `ownersOfRecord` (number) |
| Segment | `location` (rear, side, front, return), `boundaryWith` (unit, common-area, open-space, golf-course, street, none), `length` (ft), `height` (in, without lattice or arbor), `material` (wood, composite, metal, vinyl, other), `openness` (open, solid), `manufacturer`, `productLine`, `color`, `style`, `boardOrientation` (vertical, horizontal), `postColor`, `finishManufacturer`, `finishColor`, `isFinishedBothSides`, `hasLattice`, `latticeHeight` (in), `hasArbor`, `arborHeight` (in), `setbackFromFrontCorner` (ft) |
| Gate | `segmentId`, `width` (in), `height` (in, overall including lattice or arbor), `material`, `color`, `style`, `boardOrientation` (vertical, horizontal), `hasLattice`, `hasArbor`, `isNewOpening`, `opensTo` (own-lot, unit, common-area, open-space, golf-course, street) |

- **Locations.** `front` is in the front yard; `side` and `rear` run along those lot lines; `return` runs from a side
  boundary back to the house.
- **Presence.** `hasLattice`, `hasArbor` and `isNewOpening` are booleans. When the packet describes the project and
  doesn't mention a lattice, the fact is `false`, not missing. `latticeHeight` and `arborHeight` name their presence
  attribute, so they're `none` (not part of the project) when it's `false`.
- **Finish.** `finishManufacturer`, `finishColor` and `isFinishedBothSides` describe stain or paint on wood; `color`
  is the color of composite boards or a metal coating.
- **Required for review:** segment `location`, `boundaryWith`, `height` and `material`, plus `manufacturer` and `color`
  for composite. A missing required fact is something the homeowner is asked to provide.

### Document requirements

```ts
type ApplicationFileKind =
  | "application-form" | "checklist" | "letter" | "plot-plan" | "photo" | "product-sheet" | "neighbor-form"
  | "permit-form" | "other"

type DocumentRequirement = {
  id: "application-form" | "project-description" | "plot-plan" | "product-specification" | "photos"
    | "neighbor-acknowledgment" | "neighbor-approval" | "owner-signatures" | "checklist" | "permit-acknowledgment"
  label: string
  satisfiedBy: { pageKinds?: ApplicationFileKind[]; formField?: string } // matched against page kinds
  signedBy?: "applicant" | "all-owners" | "neighbor"
}
```

Kinds belong to pages, not files: the sample's PDF holds the form, the checklist and the neighbor form in one file. The
catalog defines each requirement's id, label, `satisfiedBy` and `signedBy`. What a document must say is HOA-specific,
so it lives on the rule: a `required-document` check's `mustState` lists the statements the document check confirms,
for example "approves the placement and height of the fence and the materials".

| Requirement | Satisfied by |
| --- | --- |
| `application-form` | A page of kind `application-form` |
| `project-description` | The form's description field, a `letter`, or the homeowner's typed description |
| `plot-plan` | A `plot-plan` page |
| `product-specification` | A `product-sheet` page, or a `photo` identifying the product |
| `photos` | At least one `photo` of the existing site |
| `neighbor-acknowledgment` | A `neighbor-form` signed by the neighbor, acknowledging the project (the sample's form says its signature "does not represent approval") |
| `neighbor-approval` | A `neighbor-form` or `letter` signed by the neighbor that states each item in the rule's `mustState` |
| `owner-signatures` | The form's signature block, signed by all owners of record (`ownersOfRecord`) |
| `checklist` | A `checklist`, completed and signed by the applicant |
| `permit-acknowledgment` | The `permit-form`, initialled |

Requirements come from rules: the HOA's blank application form and checklist, uploaded as a governing document of kind
`form`, produce `required-document` rules like any other source.

## Rule shape

**One check per rule.** A passage with several requirements ("lattice up to 18 inches, and fence plus lattice up to 90")
becomes several rules that share the citation. Extraction, the gold rulebook and recall scoring all follow this.

```ts
type Rule = {
  id: string // crypto.randomUUID(), generated by code when the rule is first saved
  ruleKey: string // generated by code (see "Rule keys"), fixed at first save
  rulebookId: string
  title: string // "Composite fence colors"
  statement: string // plain-language restatement keeping every number, list and qualifier
  projectTypes: ProjectTypeId[]
  appliesTo: "project" | ComponentKind // evaluated once, or once per segment or gate
  topic: "material" | "color" | "dimension" | "placement" | "style" | "documentation" | "neighbor" | "process" | "maintenance"
  obligation: "required" | "prohibited" | "permitted" | "recommended" // shall | shall not | may | should
  discretion: "objective" | "committee" // "case by case" and "at the committee's discretion" are committee
  isCurable: boolean // the homeowner can fix a failure by changing a detail (a color, a height)
  appliesWhen: Condition[] // all must hold; empty means always
  check: Check
  exceptions: string[] // stated exceptions; a possibly applicable exception makes a failure a committee decision
  modifies: string | null // ruleKey of the rule this one is an exception to
  citations: Citation[] // at least one
  issues: RuleIssue[] // from verification and consolidation
  extractedHash: string | null // hash of the CandidateRule as extracted, before any edit; null for hand-added rules
  change: "new" | "changed" | "unchanged" | null // compared with the previous published rulebook
  provenance: Provenance
  review: ReviewState
}

type Condition =
  | { type: "fact"; attribute: string; operator: "equals" | "in" | "not-in" | "exists"; value?: string | string[] | boolean }
  | { type: "text"; id: string; description: string } // id is "{ruleId}:c{index}", set by code; decided by a model

type AllowedValue = { value: string; aliases: string[] } // canonical name and accepted spellings

type Check =
  | { type: "allowed-values"; attribute: string; values: AllowedValue[]; otherwise: "not-met" | "committee" }
  | { type: "allowed-values-by"; keyAttribute: string; attribute: string; table: { key: AllowedValue; values: AllowedValue[] }[]; unknownKey: "not-met" | "committee" }
  | { type: "prohibited-values"; attribute: string; values: AllowedValue[] }
  | { type: "range"; attributes: string[]; min?: number; max?: number } // values summed, in the catalog unit
  | { type: "matches"; attribute: string; otherAttribute: string } // a gate's color matches its segment's
  | { type: "required-fact"; attribute: string }
  | { type: "required-document"; document: DocumentRequirement["id"]; mustState: string[] } // HOA-specific content
  | { type: "qualitative"; criterion: string } // judged by a model, with evidence
  | { type: "informational" } // process rules: shown in feedback, never pass or fail

type Citation = {
  documentId: string // the id of one uploaded version
  section: string // "5.4.2", or the heading when unnumbered
  pageIndex: number // 1-based page in the analyzed file
  pageLabel: string | null // printed page number, when there is one
  quote: string // verbatim, at most about 40 words
  match: { status: "exact" | "fuzzy" | "not-found"; score: number; touchesLowConfidence: boolean }
}

type RuleIssue = {
  code: "citation-not-found" | "low-confidence" | "unknown-attribute" | "invalid-value" | "sanity" | "conflict"
    | "duplicate-key" | "unresolved-reference"
  message: string
  relatedRuleIds?: string[]
  resolution: { note: string; resolvedBy: string; resolvedAt: string } | null // set when an administrator dismisses it
}

type PromptVersion = number // the Langfuse prompt version

type Provenance =
  | { source: "extraction"; jobId: string; sectionId: string; model: string; promptName: string; promptVersion: PromptVersion }
  | { source: "administrator"; userId: string; createdAt: string }

type ReviewState = {
  status: "pending" | "approved" | "rejected"
  isEdited: boolean
  reviewedBy: string | null
  reviewedAt: string | null
  note: string | null
}

type Rulebook = {
  id: string
  hoaId: string
  version: number | null // assigned at publish (the HOA's highest version plus one); null before
  status: "building" | "draft" | "published" | "superseded" | "failed"
  error: ErrorInfo | null // set when the build fails
  catalogVersion: number
  sourceDocumentIds: string[]
  jobId: string // the build that produced it
  createdAt: string
  publishedBy: string | null
  publishedAt: string | null
}
```

In a gate rule, `segment.*` attributes (in conditions and in `matches`) refer to the gate's own segment.

Units are never stored on a rule: every number is in its attribute's catalog unit (72, not "6 ft"). Extraction converts
units; verification rejects a value that doesn't fit the attribute.

The model never produces `id`, `ruleKey`, `rulebookId`, `issues`, `extractedHash`, `change`, `provenance`, `review`, a
text condition's `id`, or a citation's `documentId` and `match`; [extraction.md](extraction.md) defines the smaller
`CandidateRule` it does produce.

## Examples from the sample HOA

| Source | Rule | Check |
| --- | --- | --- |
| Guidelines 5.3 | Fence materials | segment, `allowed-values` on `segment.material`: wood, composite, metal; `otherwise: not-met` |
| Guidelines 5.3 | No vinyl | segment, `prohibited-values` on `segment.material`: vinyl |
| Guidelines 5.3, 5.2.3 | Metal fences are open view | segment, `appliesWhen material = metal`, `allowed-values` on `segment.openness`: open |
| Guidelines 5.3.2 | Composite manufacturers | segment, `appliesWhen material = composite`, `allowed-values` on `segment.manufacturer`: Trex, Frame It All, Neoline; `otherwise: committee` ("others case by case") |
| Guidelines 5.4.2 | Composite colors | segment, `appliesWhen material = composite`, `allowed-values-by` key `segment.manufacturer`, attribute `segment.color`: Trex to Winchester Grey or Saddle; Frame It All to River Birch or Teak; Neoline to Honey Oak or Desert Sage; `unknownKey: committee`. Trex in River Birch is not met. |
| Guidelines 5.4.1(iii) | Wood stain colors | segment, `appliesWhen material = wood`, `allowed-values-by` key `segment.finishManufacturer`, attribute `segment.finishColor`: Behr to Cedar (SC-146) or Drift Gray (SC-137), and so on; `unknownKey: committee` ("other brown and grey tones case by case") |
| Guidelines 5.4.1(vi) | Stained both sides | segment, `appliesWhen material = wood`, `allowed-values` on `segment.isFinishedBothSides`: true |
| Guidelines 5.2.1, 5.2.5 | No horizontal boards or styles | segment, `prohibited-values` on `segment.boardOrientation`: horizontal |
| Guidelines 5.2.2 | Composite style | segment, `appliesWhen material = composite`, `recommended` ("should be a K style"), `allowed-values` on `segment.style`: K style; `otherwise: committee` |
| Guidelines 5.4.2(iii) | Gate color matches a composite fence | gate, `appliesWhen segment.material = composite`, `matches` `gate.color` with `segment.color` |
| Guidelines 5.4.2(iii) | Gate material matches a composite fence | gate, `appliesWhen segment.material = composite`, `matches` `gate.material` with `segment.material` |
| Guidelines 5.9.1 | Gate boards coordinate with the fence | gate, `appliesWhen segment.material in [wood, composite]`, `matches` `gate.boardOrientation` with `segment.boardOrientation` |
| Guidelines 5.4.2(iv) | Posts match | segment, `matches` `segment.postColor` with `segment.color` |
| Guidelines 5.5.1(i) | Wood and composite height | segment, `appliesWhen material in [wood, composite]` and `location in [side, rear, return]`, `range` on `segment.height`, max 72 |
| Guidelines 5.5.1(i) | Minimum height | segment, `range` on `segment.height`, min 40 |
| Guidelines 5.5.1(ii) | Lattice height | segment, `appliesWhen hasLattice = true`, `range` on `segment.latticeHeight`, max 18 |
| Guidelines 5.5.1(ii) | Fence plus lattice | segment, `appliesWhen hasLattice = true`, `range` on `segment.height + segment.latticeHeight`, max 90 |
| Guidelines 5.5.1(iii) | Fence, lattice and arbor | segment, `appliesWhen hasArbor = true`, `range` on `segment.height + segment.latticeHeight + segment.arborHeight`, max 96 (a `none` lattice counts as 0) |
| Guidelines 5.5.2 | Metal height | segment, `appliesWhen material = metal`, `range` on `segment.height`, 48 to 72; exception "variations may be considered by the Reviewer" |
| Guidelines 5.6.1(i) | Neighbor approval | segment, `appliesWhen boundaryWith = unit`, `required-document` `neighbor-approval` (states approval of placement, height and materials, the party-structure terms, and joint maintenance) |
| Guidelines 5.6.2(i) | Driver sight lines | segment, `appliesWhen location = front`, `qualitative`: "doesn't interfere with a driver's ability to see objects in the roadway" |
| Guidelines 5.6.2(ii) | Front setback | segment, `appliesWhen location in [front, return]`, `recommended` ("should"), `range` on `segment.setbackFromFrontCorner`, min 5 |
| Guidelines 5.7.1 | Golf course runs | segment, `appliesWhen boundaryWith = golf-course`, `allowed-values` on `segment.material`: metal (with the open-view rule above) |
| Guidelines 5.9.2 | Gate height without an arbor | gate, `appliesWhen hasArbor = false`, `range` on `gate.height`, max 90 |
| Guidelines 5.9.2 | Gate height with an arbor | gate, `appliesWhen hasArbor = true`, `range` on `gate.height`, max 96 |
| Guidelines 5.9.5 | No new gates into common area | gate, `appliesWhen isNewOpening = true`, `prohibited-values` on `gate.opensTo`: common-area |
| Guidelines 5.1 | Like-for-like replacement still needs approval; county code is separate | `informational` |
| CC&Rs 4.3(b) | Approval is withdrawn if work doesn't start within a year | `informational` |

The 5.4.2 row is the qualifier the first prototype lost when it flattened every approved color into one list, which
made "Trex in River Birch" look acceptable. One keyed check keeps each color list tied to its manufacturer.

## Rule keys

Code generates `ruleKey` the first time a rule is saved, and never changes it afterwards, even when an administrator
edits the check or its conditions. The key is
`{projectTypes, sorted and joined with +}:{appliesTo}:{check type}:{subject}:{conditions}`, where:

| Check type | Subject |
| --- | --- |
| `allowed-values`, `prohibited-values`, `required-fact` | The attribute |
| `allowed-values-by` | `{keyAttribute}>{attribute}` |
| `matches` | Both attributes, sorted, joined with `=` |
| `range` | The attributes, sorted, joined with `+` |
| `required-document` | The document requirement id |
| `qualitative`, `informational` | A slug of the title |

Conditions are each fact condition as `attribute operator sorted-values` plus a slug of each text condition, sorted and
joined with `&`. For example, `fence:segment:range:segment.height:segment.material in composite|wood`.

Keys are unique per rulebook. When two rules still collide, the later one gets its first citation's section number as a
suffix (`#5.4.2`), which stays the same from build to build, and a `duplicate-key` issue for the administrator.

## Authority and conflicts

| Document kind | Rank |
| --- | --- |
| Declaration (CC&Rs) | 1 |
| Bylaws | 2 |
| Rules and regulations, design guidelines | 3 |
| Forms and checklists | 4 |

An amendment takes the rank of the document it amends and **replaces** the sections it names; a newer version of a
document replaces the older one. Neither is flagged as a conflict. Two documents that state different requirements for
the same thing produce a `conflict` issue on both rules, ordered by rank, for the administrator to resolve.
References to documents that weren't uploaded ("see Declaration 13.1") produce an `unresolved-reference` issue.

Variances aren't rules. In the sample, CC&R 4.3(b) says no approval may be inconsistent with the guidelines unless a
variance is granted under 4.5, which needs the Board's written consent; extraction records that as an `informational`
rule, and the review notes when a failure would need one (see [review.md](review.md#8-decide)).

The prototype's `kind` field on rules is replaced by `check`.

## Versioning

- A build creates a rulebook in `building`, which becomes the HOA's `draft` when the build finishes, or `failed` with
  its error. Publishing assigns the next version number, freezes the rulebook and marks the previous published one
  `superseded`. At most one rulebook per HOA is `building` and at most one is `draft`.
- Reviews store the rulebook they used, so an old decision can always be explained with the rules in force at the time.
- A new draft keeps the administrator's work. Rules are matched to the previous draft or published version by
  `ruleKey`:
  - when the new candidate's hash equals the previous rule's `extractedHash`, the source didn't change, so the previous
    rule is copied as it was, edits and approval included (`unchanged`);
  - otherwise the new candidate is `changed` and pending, and the editor shows the previous version beside it;
  - hand-added rules are copied forward, and become pending only when a document they cite was replaced;
  - rules with no match are `new`, and previous rules with no match are listed as removed.
