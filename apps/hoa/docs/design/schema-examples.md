# Rules schema: examples

> Generated from a file that type-checks against the types in [schema.md](schema.md), with every term and rule the
> examples reference defined. Null and empty fields are left out, and so are bookkeeping fields:
> provenance, review state and citations.

Rules from sections 5.2 to 5.9 of the sample organization's Residential Design Guidelines encode the real text. Every
other source here (the Declaration, rules and regulations, bylaws, state law, and guidelines 1.4 and 8.2) is
illustrative, written to show a situation the schema has to cover.

## Core terms

### A thing: lot

Ships with the portal, so its organizationId is null and every organization has it. Paths start at it, so code depends
on its key.

```json
{
  "key": "lot",
  "organizationId": null,
  "kind": "thing",
  "nature": "object",
  "labels": [{ "text": "lot", "role": "preferred" }]
}
```

### A party: committee

The body that decides applications. The application workflow refers to it, so it's core.

```json
{
  "key": "committee",
  "organizationId": null,
  "kind": "thing",
  "nature": "party",
  "labels": [
    { "text": "architectural review committee", "role": "preferred" },
    { "text": "ARC", "role": "alternative" }
  ]
}
```

### A request field: submitted on

The application workflow supplies it as a fact; response deadlines count from it.

```json
{
  "key": "architectural-application.submitted-on",
  "organizationId": null,
  "kind": "property",
  "of": "architectural-application",
  "valueType": { "type": "date" },
  "many": false,
  "ifUnstated": "unknown",
  "labels": [{ "text": "submitted on", "role": "preferred" }]
}
```

### A request field: notice delivered on

The enforcement workflow supplies it when notice is actually delivered; cure periods and fines count from it.

```json
{
  "key": "violation.notice-delivered-on",
  "organizationId": null,
  "kind": "property",
  "of": "violation",
  "valueType": { "type": "date" },
  "many": false,
  "ifUnstated": "unknown",
  "labels": [{ "text": "notice delivered on", "role": "preferred" }]
}
```

### A unit: foot

Units are terms, so the matcher resolves "6'" the same way it resolves any label.

```json
{
  "key": "foot",
  "organizationId": null,
  "kind": "unit",
  "dimension": "length",
  "perBase": "12",
  "labels": [
    { "text": "ft", "role": "preferred" },
    { "text": "feet", "role": "alternative" },
    { "text": "foot", "role": "alternative" },
    { "text": "'", "role": "alternative" },
    { "text": "′", "role": "alternative" }
  ]
}
```

## Organization terms

### A core term, refined: Unit

The sample organization's documents call lots Units. Its refinement of lot changes only the labels; the kind and key
stay the same.

```json
{
  "key": "lot",
  "organizationId": "org-sample",
  "kind": "thing",
  "nature": "object",
  "labels": [
    { "text": "Unit", "role": "preferred" },
    { "text": "lot", "role": "alternative" },
    { "text": "home site", "role": "alternative" }
  ]
}
```

### A core term, refined: Reviewer

The sample guidelines call the committee the Reviewer.

```json
{
  "key": "committee",
  "organizationId": "org-sample",
  "kind": "thing",
  "nature": "party",
  "labels": [
    { "text": "Reviewer", "role": "preferred" },
    { "text": "architectural review committee", "role": "alternative" },
    { "text": "ARC", "role": "alternative" }
  ]
}
```

### A thing: fence run

Generated from the guidelines. The alternative labels are the surface forms the matcher accepts.

```json
{
  "key": "fence-run",
  "organizationId": "org-sample",
  "kind": "thing",
  "nature": "object",
  "labels": [
    { "text": "fence run", "role": "preferred" },
    { "text": "fence segment", "role": "alternative" },
    { "text": "run of fence", "role": "alternative" }
  ],
  "definition": "a continuous stretch of fence of one material and height between two corners or ends"
}
```

### A property: fence height

Stored in inches; any length converts. The scope note keeps lattice out.

```json
{
  "key": "fence-run.height",
  "organizationId": "org-sample",
  "kind": "property",
  "of": "fence-run",
  "valueType": { "type": "quantity", "unit": "inch" },
  "many": false,
  "ifUnstated": "unknown",
  "labels": [{ "text": "height", "role": "preferred" }, { "text": "fence height", "role": "alternative" }],
  "definition": "vertical distance from finished grade to the top of the boards",
  "scopeNote": "Excludes lattice and arbors, which have heights of their own."
}
```

### A property that's absent when unstated

An application that doesn't mention lattice has none, so its lattice height counts as 0 instead of missing.

```json
{
  "key": "fence-run.lattice-height",
  "organizationId": "org-sample",
  "kind": "property",
  "of": "fence-run",
  "valueType": { "type": "quantity", "unit": "inch" },
  "many": false,
  "ifUnstated": "absent",
  "labels": [{ "text": "lattice height", "role": "preferred" }]
}
```

### A category: return fence

A kind of fence run, with criteria code can test.

```json
{
  "key": "return-fence",
  "organizationId": "org-sample",
  "kind": "category",
  "of": "fence-run",
  "criteria": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.location"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-location.return" }
  },
  "labels": [{ "text": "return fence", "role": "preferred" }],
  "definition": "a fence run that runs from a side yard boundary to the house"
}
```

### A category judged from text

When membership can't be expressed with properties, the criteria are text and a model decides, and it's counted as an
escape hatch.

```json
{
  "key": "neighbor",
  "organizationId": "org-sample",
  "kind": "category",
  "of": "owner",
  "criteria": { "type": "text", "text": "owns a lot that shares a boundary with the applicant's lot" },
  "labels": [{ "text": "neighbor", "role": "preferred" }, { "text": "adjacent owner", "role": "alternative" }],
  "context": "the owner next door, not any resident"
}
```

### A value: Winchester Grey

Spelling variants are alternative labels; a known misspelling is hidden.

```json
{
  "key": "composite-color.winchester-grey",
  "organizationId": "org-sample",
  "kind": "value",
  "set": "composite-color",
  "labels": [
    { "text": "Winchester Grey", "role": "preferred" },
    { "text": "Winchester Gray", "role": "alternative" },
    { "text": "Winchster Grey", "role": "hidden" }
  ]
}
```

### A derived property: notice deemed delivered

A deeming clause (illustrative): mailed notice counts as delivered three days after mailing. It's its own property, so
the actual delivery date can still be recorded.

```json
{
  "key": "violation.notice-deemed-delivered-on",
  "organizationId": "org-sample",
  "kind": "property",
  "of": "violation",
  "valueType": { "type": "date" },
  "many": false,
  "ifUnstated": "unknown",
  "derived": [
    {
      "value": {
        "type": "shift",
        "of": { "type": "ref", "from": "request", "path": ["violation.notice-mailed-on"] },
        "by": { "value": 3, "unit": "calendar-day" }
      }
    }
  ],
  "labels": [{ "text": "notice deemed delivered on", "role": "preferred" }]
}
```

## Sources

### A governing document

The guidelines as uploaded: one file, the 2025 text. An amended document is consolidated instead, compiled from the
original and each amendment's file.

```json
{
  "key": "guidelines",
  "kind": "design-guidelines",
  "title": "Residential Design Guidelines",
  "issuedBy": "board",
  "edition": {
    "effectiveFrom": "2025-11-12",
    "label": "Board approved 2025-11-12",
    "adoptedOn": "2025-11-12",
    "basis": "original",
    "files": [
      {
        "fileId": "file-0007",
        "sha256": "9f2c4e1a7b3d5f60812a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d",
        "pages": 48
      }
    ]
  }
}
```

### A referenced document

Named by other documents but not uploaded, so rules can enforce it by key and coverage lists it as missing.

```json
{ "key": "by-laws", "kind": "bylaws", "title": "By-Laws", "issuedBy": "board" }
```

### A provision

Its key is its document's key and its label.

```json
{
  "key": "guidelines:5.4.2(i)",
  "kind": "point",
  "num": { "printed": "(i)", "normalized": "i", "source": "printed" },
  "label": "5.4.2(i)",
  "heading": "Composite Fence Colors",
  "parentLabel": "5.4.2",
  "text": "The composite fence colors shall be limited to those available through the following Manufacturers: a) TREX: Winchester Grey and Saddle b) FRAME IT ALL: River Birch and Teak c) NEOLINE: Honey Oak and Desert Sage"
}
```

### A rule from an amended provision

If the board amends 5.5.1(i) to 78 inches, the rules file generated afterwards holds the consolidated guidelines, and
this rule reads 78 inches from the amendment's date.

```json
{
  "key": "guidelines:5.5.1(i)#max-height",
  "effectiveFrom": "2026-04-02",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["fence-run.height"] },
      "op": "<=",
      "right": { "type": "quantity", "value": 78, "unit": "inch" }
    }
  }
}
```

## Architectural rules

### Colors by manufacturer (5.4.2(i))

A table keyed by manufacturer. Trex in River Birch matches no row, so it's not met; the remedy is a change of detail.

```json
{
  "key": "guidelines:5.4.2(i)#colors",
  "kind": "norm",
  "domain": "architectural",
  "title": "Composite colors by manufacturer",
  "statement": "A composite {{fence-run}} must use a {{fence-run.color}} its {{fence-run.manufacturer}} offers on this list: Trex in Winchester Grey or Saddle, Frame It All in River Birch or Teak, Neoline in Honey Oak or Desert Sage.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.material"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-material.composite" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "table",
    "inputs": [
      { "type": "ref", "path": ["fence-run.manufacturer"] },
      { "type": "ref", "path": ["fence-run.color"] }
    ],
    "rows": [
      {
        "when": [
          { "type": "in", "values": [{ "type": "value", "term": "composite-manufacturer.trex" }] },
          {
            "type": "in",
            "values": [
              { "type": "value", "term": "composite-color.winchester-grey" },
              { "type": "value", "term": "composite-color.saddle" }
            ]
          }
        ],
        "result": "met"
      },
      {
        "when": [
          { "type": "in", "values": [{ "type": "value", "term": "composite-manufacturer.frame-it-all" }] },
          {
            "type": "in",
            "values": [
              { "type": "value", "term": "composite-color.river-birch" },
              { "type": "value", "term": "composite-color.teak" }
            ]
          }
        ],
        "result": "met"
      },
      {
        "when": [
          { "type": "in", "values": [{ "type": "value", "term": "composite-manufacturer.neoline" }] },
          {
            "type": "in",
            "values": [
              { "type": "value", "term": "composite-color.honey-oak" },
              { "type": "value", "term": "composite-color.desert-sage" }
            ]
          }
        ],
        "result": "met"
      }
    ],
    "otherwise": "not-met"
  },
  "remedy": "change-detail"
}
```

### Other manufacturers case by case (5.3.2)

A discretion rule. It can't make anything compliant; it sends a not-met finding for an unlisted manufacturer to the
committee.

```json
{
  "key": "guidelines:5.3.2#other-manufacturers",
  "kind": "discretion",
  "domain": "architectural",
  "title": "Other composite manufacturers case by case",
  "statement": "The {{committee}} may consider a composite {{fence-run}} from another {{fence-run.manufacturer}} case by case.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "all",
    "of": [
      {
        "type": "compare",
        "left": { "type": "ref", "path": ["fence-run.material"] },
        "op": "=",
        "right": { "type": "value", "term": "fence-material.composite" }
      },
      {
        "type": "not",
        "of": {
          "type": "in",
          "left": { "type": "ref", "path": ["fence-run.manufacturer"] },
          "values": [
            { "type": "value", "term": "composite-manufacturer.trex" },
            { "type": "value", "term": "composite-manufacturer.frame-it-all" },
            { "type": "value", "term": "composite-manufacturer.neoline" }
          ]
        }
      }
    ]
  },
  "effectiveFrom": "2025-11-12",
  "decidedBy": "committee",
  "overrides": ["guidelines:5.4.2(i)#colors", "guidelines:5.3.2#manufacturers"]
}
```

### Listed manufacturers (5.3.2)

The other rule the discretion rule covers.

```json
{
  "key": "guidelines:5.3.2#manufacturers",
  "kind": "norm",
  "domain": "architectural",
  "title": "Composite manufacturers",
  "statement": "A composite {{fence-run}} must come from Trex, Frame It All or Neoline.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.material"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-material.composite" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "in",
      "left": { "type": "ref", "path": ["fence-run.manufacturer"] },
      "values": [
        { "type": "value", "term": "composite-manufacturer.trex" },
        { "type": "value", "term": "composite-manufacturer.frame-it-all" },
        { "type": "value", "term": "composite-manufacturer.neoline" }
      ]
    }
  },
  "remedy": "change-detail"
}
```

### Boundary and return fences at most 72 inches (5.5.1(i))

Applies through two categories. It runs in applications and in violations, so an existing fence is judged by the same
rule.

```json
{
  "key": "guidelines:5.5.1(i)#max-height",
  "kind": "norm",
  "domain": "architectural",
  "title": "Boundary and return fences at most 72 inches",
  "statement": "A wood or composite {{fence-run}} on a {{lot}} boundary, or a {{return-fence}}, must have a {{fence-run.height}} of at most 72 inches, not counting lattice or an arbor.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "all",
    "of": [
      {
        "type": "in",
        "left": { "type": "ref", "path": ["fence-run.material"] },
        "values": [
          { "type": "value", "term": "fence-material.wood" },
          { "type": "value", "term": "fence-material.composite" }
        ]
      },
      {
        "type": "any",
        "of": [
          { "type": "is-a", "path": [], "category": "boundary-fence" },
          { "type": "is-a", "path": [], "category": "return-fence" }
        ]
      }
    ]
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["fence-run.height"] },
      "op": "<=",
      "right": { "type": "quantity", "value": 72, "unit": "inch" }
    }
  },
  "remedy": "change-detail"
}
```

### Fence plus lattice at most 90 inches (5.5.1(ii))

A sum. Lattice that isn't mentioned counts as 0, and a 95-inch fence fails even when its lattice height is unclear.

```json
{
  "key": "guidelines:5.5.1(ii)#fence-and-lattice",
  "kind": "norm",
  "domain": "architectural",
  "title": "Fence plus lattice at most 90 inches",
  "statement": "A {{fence-run}}'s {{fence-run.height}} plus its {{fence-run.lattice-height}} must be at most 90 inches.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "sum",
        "of": [
          { "type": "ref", "path": ["fence-run.height"] },
          { "type": "ref", "path": ["fence-run.lattice-height"] }
        ]
      },
      "op": "<=",
      "right": { "type": "quantity", "value": 90, "unit": "inch" }
    }
  },
  "remedy": "change-detail"
}
```

### Metal 48 to 72 inches (5.5.2)

A closed range.

```json
{
  "key": "guidelines:5.5.2#metal-height",
  "kind": "norm",
  "domain": "architectural",
  "title": "Metal fences 48 to 72 inches",
  "statement": "A metal {{fence-run}} must have a {{fence-run.height}} of at least 48 and at most 72 inches.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.material"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-material.metal" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "between",
      "left": { "type": "ref", "path": ["fence-run.height"] },
      "min": { "type": "quantity", "value": 48, "unit": "inch" },
      "max": { "type": "quantity", "value": 72, "unit": "inch" },
      "includeMin": true,
      "includeMax": true
    }
  },
  "remedy": "change-detail"
}
```

### Variations may be considered (5.5.2)

The same sentence's exception, as a discretion rule with the same citation.

```json
{
  "key": "guidelines:5.5.2#variations",
  "kind": "discretion",
  "domain": "architectural",
  "title": "Metal height variations considered",
  "statement": "The {{committee}} may consider variations from the metal fence heights.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.material"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-material.metal" }
  },
  "effectiveFrom": "2025-11-12",
  "decidedBy": "committee",
  "overrides": ["guidelines:5.5.2#metal-height"]
}
```

### Front setback (5.6.2(ii))

"Should": a failure is advisory, never not met.

```json
{
  "key": "guidelines:5.6.2(ii)#setback",
  "kind": "norm",
  "domain": "architectural",
  "title": "Front fences set back 5 feet",
  "statement": "A front or return {{fence-run}} should be set back at least 5 feet from the front corner of the house.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "in",
    "left": { "type": "ref", "path": ["fence-run.location"] },
    "values": [
      { "type": "value", "term": "fence-location.front" },
      { "type": "value", "term": "fence-location.return" }
    ]
  },
  "effectiveFrom": "2025-11-12",
  "modality": "recommendation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["fence-run.setback-from-front-corner"] },
      "op": ">=",
      "right": { "type": "quantity", "value": 5, "unit": "foot" }
    }
  },
  "remedy": "change-detail"
}
```

### Neighbor approval (5.6.1(i))

A document check per boundary run. A missing form asks for the document; a neighbor who refuses means moving the fence
off the boundary.

```json
{
  "key": "guidelines:5.6.1(i)#neighbor-approval",
  "kind": "norm",
  "domain": "architectural",
  "title": "Neighbor approval for shared boundaries",
  "statement": "A {{fence-run}} on a boundary with another {{lot}} needs the {{neighbor}}'s signed approval of its placement, height and materials.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.boundary-with"] },
    "op": "=",
    "right": { "type": "value", "term": "boundary.lot" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "applicant",
  "beneficiary": "neighbor",
  "check": {
    "type": "document",
    "document": "neighbor-approval-form",
    "per": "subject",
    "mustState": [
      "approval of the fence's placement",
      "approval of its height",
      "approval of its materials",
      "who maintains it"
    ],
    "signedBy": ["neighbor"]
  },
  "remedy": "redesign"
}
```

### Driver sight lines (5.6.2(i))

A judgment, phrased so that yes complies. A model answers from the evidence; the committee has the final say.

```json
{
  "key": "guidelines:5.6.2(i)#sight-lines",
  "kind": "norm",
  "domain": "architectural",
  "title": "Front fences keep drivers' view clear",
  "statement": "A front {{fence-run}} must not interfere with a driver's ability to see objects in the roadway.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["fence-run.location"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-location.front" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "decidedBy": "committee",
  "check": {
    "type": "judgment",
    "question": "Does the fence leave a driver a clear view of objects in the roadway?",
    "evidence": ["site-plan", "photo"]
  },
  "remedy": "redesign"
}
```

### Work needs prior approval

An approval check: the committee's written approval, dated before the work, must be recorded. In an application with no
decision yet, it goes to the committee; in a violation, no recorded approval is not met.

```json
{
  "key": "declaration:4.1#prior-approval",
  "kind": "norm",
  "domain": "architectural",
  "title": "Work needs the committee's prior written approval",
  "statement": "No {{work}} may start on a {{lot}} without the {{committee}}'s prior written approval.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "work",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": { "type": "approval", "by": ["committee"], "needs": "all", "prior": true, "written": true },
  "remedy": "redesign"
}
```

### Either body's approval

Illustrative: needs any one of the parties in by. With needs all, every one of them must approve.

```json
{
  "key": "rules:4#vehicle-storage",
  "kind": "norm",
  "domain": "use",
  "title": "Vehicles stored outside a garage need the board's or the committee's approval",
  "statement": "A {{vehicle}} may be stored outside a garage only with the {{board}}'s or the {{committee}}'s written approval.",
  "requestTypes": ["violation"],
  "appliesTo": "vehicle",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": { "type": "approval", "by": ["board", "committee"], "needs": "any", "prior": false, "written": true }
}
```

### Gates match the fence (5.4.2(iii))

A path that follows the gate's reference to its fence run.

```json
{
  "key": "guidelines:5.4.2(iii)#gate-color",
  "kind": "norm",
  "domain": "architectural",
  "title": "Gates match a composite fence's color",
  "statement": "A {{gate}} in a composite {{fence-run}} must match the fence's {{fence-run.color}}.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "gate",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["gate.fence-run", "fence-run.material"] },
    "op": "=",
    "right": { "type": "value", "term": "fence-material.composite" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["gate.color"] },
      "op": "=",
      "right": { "type": "ref", "path": ["gate.fence-run", "fence-run.color"] }
    }
  },
  "remedy": "change-detail"
}
```

### Committee decides within 30 days

A deadline on the committee. When it's missed, the finding reports a deemed approval, and the application workflow
records it.

```json
{
  "key": "declaration:4.3(a)#response-time",
  "kind": "norm",
  "domain": "architectural",
  "title": "Committee decides within 30 days",
  "statement": "The {{committee}} must decide an {{architectural-application}} within 30 days after it's submitted, or it is deemed approved.",
  "requestTypes": ["architectural-application"],
  "appliesTo": "architectural-application",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "committee",
  "beneficiary": "applicant",
  "check": {
    "type": "deadline",
    "act": { "type": "ref", "from": "request", "path": ["architectural-application.decided-on"] },
    "anchor": { "type": "ref", "from": "request", "path": ["architectural-application.submitted-on"] },
    "latest": { "value": 30, "unit": "calendar-day" },
    "onMiss": [
      {
        "type": "deems",
        "target": { "from": "request", "path": ["architectural-application.decision"] },
        "value": { "type": "value", "term": "decision-status.approved" }
      }
    ]
  }
}
```

### Existing fences may remain

A permission with an overrides selector: it exempts an approved fence from every guidelines rule adopted after the fence
was installed, including rules added later.

```json
{
  "key": "guidelines:1.4#existing-fences",
  "kind": "norm",
  "domain": "architectural",
  "title": "Existing fences may remain until replaced",
  "statement": "A {{fence-run}} installed before November 12, 2025 with the {{committee}}'s approval may remain until it's replaced.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "appliesWhen": {
    "type": "all",
    "of": [
      {
        "type": "compare",
        "left": { "type": "ref", "path": ["fence-run.installed-on"] },
        "op": "<",
        "right": { "type": "date", "value": "2025-11-12" }
      },
      { "type": "approved", "path": [], "by": ["committee"], "needs": "all", "prior": false, "written": false }
    ]
  },
  "effectiveFrom": "2025-11-12",
  "modality": "permission",
  "bearer": "owner",
  "overrides": { "documents": ["guidelines"], "adoptedAfter": { "path": ["fence-run.installed-on"] } }
}
```

### A variance for one approved fence

A rule from a decision, scoped to the approved improvement on Unit 42 and ranked by the variance power it cites.

```json
{
  "key": "decision-2026-0142:1#rear-height",
  "kind": "norm",
  "domain": "architectural",
  "title": "Variance: 84-inch rear fence on Unit 42",
  "statement": "The approved rear {{fence-run}} on {{lot}} 42 may be up to 84 inches tall.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "fence-run",
  "scope": { "lotId": "lot-42", "subjectId": "improvement-0193" },
  "authority": { "provisionKey": "declaration:4.5" },
  "effectiveFrom": "2026-05-01",
  "modality": "obligation",
  "bearer": "owner",
  "overrides": ["guidelines:5.5.1(i)#max-height"],
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["fence-run.height"] },
      "op": "<=",
      "right": { "type": "quantity", "value": 84, "unit": "inch" }
    }
  },
  "remedy": "change-detail"
}
```

### An outright prohibition

No check: every solar device it applies to is not met.

```json
{
  "key": "guidelines:8.2#no-solar",
  "kind": "norm",
  "domain": "architectural",
  "title": "No solar panels",
  "statement": "A {{lot}} must not have a {{solar-device}}.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "solar-device",
  "effectiveFrom": "2025-11-12",
  "modality": "prohibition",
  "bearer": "owner",
  "remedy": "redesign"
}
```

### State law overrides it

A permission from law. It exempts roof-mounted devices from the organization's prohibition.

```json
{
  "key": "property-code:202.010#solar",
  "kind": "norm",
  "domain": "architectural",
  "title": "Solar devices can't be prohibited",
  "statement": "An {{organization}} may not prohibit an {{owner}} from installing a {{solar-device}} on the owner's roof.",
  "requestTypes": ["architectural-application", "violation"],
  "appliesTo": "solar-device",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["solar-device.mounting"] },
    "op": "=",
    "right": { "type": "value", "term": "mounting.roof" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "permission",
  "bearer": "owner",
  "overrides": ["guidelines:8.2#no-solar"]
}
```

## Use restrictions

### No commercial vehicles on the street overnight

A daily window over an event's start and end. An event is over, so it can't be cured.

```json
{
  "key": "rules:3.2#commercial-overnight",
  "kind": "norm",
  "domain": "use",
  "title": "No commercial vehicles on the street overnight",
  "statement": "A commercial {{vehicle}} must not be parked on the street between 2:00 and 5:00 a.m.",
  "requestTypes": ["violation"],
  "appliesTo": "parking",
  "appliesWhen": {
    "type": "all",
    "of": [
      {
        "type": "compare",
        "left": { "type": "ref", "path": ["parking.vehicle", "vehicle.class"] },
        "op": "=",
        "right": { "type": "value", "term": "vehicle-class.commercial" }
      },
      {
        "type": "compare",
        "left": { "type": "ref", "path": ["parking.location"] },
        "op": "=",
        "right": { "type": "value", "term": "parking-location.street" }
      }
    ]
  },
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "occupant",
  "check": {
    "type": "test",
    "test": {
      "type": "not",
      "of": {
        "type": "during",
        "start": { "type": "ref", "path": ["parking.start"] },
        "end": { "type": "ref", "path": ["parking.end"] },
        "window": { "type": "daily", "from": "02:00", "to": "05:00" },
        "match": "overlaps"
      }
    }
  }
}
```

### Trash containers out only around pickup

A window around each date of the community's pickup schedule.

```json
{
  "key": "rules:5.1#trash-out",
  "kind": "norm",
  "domain": "use",
  "title": "Trash containers out only around pickup",
  "statement": "A trash container may be at the curb only from 6:00 p.m. the day before pickup until 9:00 p.m. on pickup day.",
  "requestTypes": ["violation"],
  "appliesTo": "curbside-placement",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "occupant",
  "check": {
    "type": "test",
    "test": {
      "type": "during",
      "start": { "type": "ref", "path": ["curbside-placement.start"] },
      "end": { "type": "ref", "path": ["curbside-placement.end"] },
      "window": {
        "type": "recurring",
        "schedule": { "type": "ref", "from": "community", "path": ["community.trash-pickup"] },
        "from": { "value": -1, "unit": "calendar-day", "at": "18:00" },
        "to": { "value": 0, "unit": "calendar-day", "at": "21:00" }
      },
      "match": "within"
    }
  }
}
```

### At most three dogs and cats

A count with a filter. If the list of pets isn't complete, the count can only fail or be unknown.

```json
{
  "key": "declaration:8.4#pet-limit",
  "kind": "norm",
  "domain": "use",
  "title": "At most three dogs and cats",
  "statement": "A {{lot}} may have at most three dogs and cats in total.",
  "requestTypes": ["violation"],
  "appliesTo": "lot",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "count",
        "path": ["lot.pets"],
        "where": {
          "type": "in",
          "left": { "type": "ref", "path": ["pet.species"] },
          "values": [{ "type": "value", "term": "species.dog" }, { "type": "value", "term": "species.cat" }]
        }
      },
      "op": "<=",
      "right": { "type": "number", "value": 3 }
    }
  }
}
```

### Leases at least 12 months

Months compare with months and years.

```json
{
  "key": "declaration:9.2#minimum-term",
  "kind": "norm",
  "domain": "use",
  "title": "Leases at least 12 months",
  "statement": "A lease must have a {{lease-registration.term}} of at least 12 months.",
  "requestTypes": ["lease-registration"],
  "appliesTo": "lease-registration",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": { "type": "ref", "path": ["lease-registration.term"] },
      "op": ">=",
      "right": { "type": "quantity", "value": 12, "unit": "month" }
    }
  }
}
```

### Rental cap

Community-wide numbers come in as facts on the community, from the leasing feature; the rule doesn't count other
requests.

```json
{
  "key": "declaration:9.3#rental-cap",
  "kind": "norm",
  "domain": "use",
  "title": "At most 20 percent of lots leased",
  "statement": "No more than 20 percent of {{lot:plural}} may be leased at one time.",
  "requestTypes": ["lease-registration"],
  "appliesTo": "lease-registration",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "quotient",
        "of": [
          {
            "type": "sum",
            "of": [
              { "type": "ref", "from": "community", "path": ["community.leased-lots"] },
              { "type": "number", "value": 1 }
            ]
          },
          { "type": "ref", "from": "community", "path": ["community.lot-count"] }
        ]
      },
      "op": "<=",
      "right": { "type": "fraction", "numerator": 1, "denominator": 5 }
    }
  }
}
```

## Maintenance, money and enforcement

### Keep landscaping maintained

A judgment the board decides, with a cure period counted from the notice.

```json
{
  "key": "declaration:7.1#landscaping",
  "kind": "norm",
  "domain": "maintenance",
  "title": "Keep landscaping maintained",
  "statement": "Each {{owner}} must keep the {{lot}}'s landscaping neat, trimmed and free of weeds.",
  "requestTypes": ["violation"],
  "appliesTo": "lot",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "decidedBy": "board",
  "check": {
    "type": "judgment",
    "question": "Is the lot's landscaping neat, trimmed and free of weeds?",
    "evidence": ["photo", "inspection-report"]
  },
  "cure": {
    "value": 15,
    "unit": "calendar-day",
    "after": { "from": "request", "path": ["violation.notice-delivered-on"] },
    "curedBy": { "from": "request", "path": ["violation.cured-on"] }
  }
}
```

### Self-help

A sanction: once the cure period passes, the organization may do the work and charge its cost.

```json
{
  "key": "declaration:7.3#self-help",
  "kind": "sanction",
  "domain": "enforcement",
  "title": "Organization may maintain and charge the owner",
  "statement": "If an {{owner}} doesn't cure a maintenance violation in time, the {{organization}} may do the work and charge its cost to the {{owner}}.",
  "requestTypes": ["violation"],
  "appliesTo": "violation",
  "appliesWhen": { "type": "exists", "from": "request", "path": ["violation.notice-delivered-on"] },
  "effectiveFrom": "2025-11-12",
  "modality": "permission",
  "imposedBy": "organization",
  "enforces": { "rules": ["declaration:7.1#landscaping"] },
  "sanction": {
    "type": "self-help",
    "amounts": [{ "type": "ref", "from": "request", "path": ["violation.cost-of-work"] }]
  },
  "against": ["owner"]
}
```

### Assessment due January 1

A deadline on the owner, with 15 days to cure counted from the due date.

```json
{
  "key": "declaration:6.4#annual-due",
  "kind": "norm",
  "domain": "financial",
  "title": "Annual assessment due January 1",
  "statement": "Each {{owner}} must pay the annual {{assessment}} by January 1.",
  "requestTypes": ["assessment"],
  "appliesTo": "assessment",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "owner",
  "check": {
    "type": "deadline",
    "act": { "type": "ref", "path": ["assessment.paid-on"] },
    "anchor": { "type": "ref", "path": ["assessment.due-on"] },
    "latest": { "value": 0, "unit": "calendar-day" }
  },
  "cure": {
    "value": 15,
    "unit": "calendar-day",
    "after": { "path": ["assessment.due-on"] },
    "curedBy": { "path": ["assessment.paid-on"] }
  }
}
```

### Late fee

The greater of $25 and 10 percent of the unpaid balance, once the assessment rule's cure period has passed.

```json
{
  "key": "declaration:6.6#late-fee",
  "kind": "sanction",
  "domain": "financial",
  "title": "Late fee after 15 days",
  "statement": "If an {{assessment}} is unpaid 15 days after it's due, the {{organization}} charges the greater of $25 and 10 percent of the unpaid amount.",
  "requestTypes": ["assessment"],
  "appliesTo": "assessment",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "imposedBy": "organization",
  "enforces": { "rules": ["declaration:6.4#annual-due"] },
  "sanction": {
    "type": "late-fee",
    "amounts": [
      {
        "type": "greatest",
        "of": [
          { "type": "quantity", "value": 25, "unit": "usd" },
          {
            "type": "product",
            "of": [
              { "type": "fraction", "numerator": 1, "denominator": 10 },
              { "type": "ref", "path": ["assessment.unpaid-balance"] }
            ]
          }
        ]
      }
    ]
  },
  "against": ["owner"]
}
```

### Fine schedule

Escalating fines counted per owner, then a daily fine while the violation continues, capped. It enforces the whole Rules
document; notice and hearing come from the settings, and the cure period applies on its own.

```json
{
  "key": "rules:12.1#fines",
  "kind": "sanction",
  "domain": "enforcement",
  "title": "Fines for violations of the Rules",
  "statement": "After notice, the time to cure, and a hearing if the owner asks for one, the {{board}} may fine $100 for a first violation, $200 for a second within 12 months, and $25 a day while a violation continues, up to $1,000.",
  "requestTypes": ["violation"],
  "appliesTo": "violation",
  "effectiveFrom": "2025-11-12",
  "modality": "permission",
  "imposedBy": "board",
  "enforces": { "documents": ["rules"] },
  "sanction": {
    "type": "fine",
    "amounts": [
      { "type": "quantity", "value": 100, "unit": "usd" },
      { "type": "quantity", "value": 200, "unit": "usd" }
    ],
    "occurrences": {
      "within": { "value": 12, "unit": "month" },
      "counts": "same-rule",
      "per": "owner",
      "includesCured": false
    },
    "repeats": {
      "every": { "value": 1, "unit": "calendar-day" },
      "amount": { "type": "quantity", "value": 25, "unit": "usd" }
    },
    "cap": { "type": "quantity", "value": 1000, "unit": "usd" }
  },
  "against": ["owner"]
}
```

### A legal cap on fines

A limit rule (illustrative): it caps the fine schedule's total at $500 per violation.

```json
{
  "key": "property-code:209.006#fine-cap",
  "kind": "limit",
  "domain": "enforcement",
  "title": "Fines capped at $500 per violation",
  "statement": "Fines for one violation may not total more than $500.",
  "requestTypes": ["violation"],
  "appliesTo": "violation",
  "effectiveFrom": "2025-11-12",
  "limits": ["rules:12.1#fines"],
  "forbids": false,
  "maxTotal": { "type": "quantity", "value": 500, "unit": "usd" }
}
```

## Governance

### Meeting notice 10 to 60 days ahead

A window before the meeting.

```json
{
  "key": "bylaws:3.4#notice",
  "kind": "norm",
  "domain": "governance",
  "title": "Meeting notice 10 to 60 days ahead",
  "statement": "The {{board}} must send notice of a members' {{meeting}} at least 10 and no more than 60 days before it.",
  "requestTypes": ["meeting"],
  "appliesTo": "meeting",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "board",
  "beneficiary": "members",
  "check": {
    "type": "deadline",
    "act": { "type": "ref", "from": "request", "path": ["meeting.notice-sent-on"] },
    "anchor": { "type": "ref", "from": "request", "path": ["meeting.starts-at"] },
    "earliest": { "value": -60, "unit": "calendar-day" },
    "latest": { "value": -10, "unit": "calendar-day" }
  }
}
```

### Quorum

A requirement: a condition the meeting needs to act, with no party bearing it. The total voting power comes in as a fact
on the community.

```json
{
  "key": "bylaws:3.7#quorum",
  "kind": "norm",
  "domain": "governance",
  "title": "Quorum is 10 percent of the votes",
  "statement": "A members' {{meeting}} needs members holding at least 10 percent of the total votes present, in person or by proxy.",
  "requestTypes": ["meeting"],
  "appliesTo": "meeting",
  "effectiveFrom": "2025-11-12",
  "modality": "requirement",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "quotient",
        "of": [
          { "type": "ref", "from": "request", "path": ["meeting.voting-power-present"] },
          { "type": "ref", "from": "community", "path": ["community.total-voting-power"] }
        ]
      },
      "op": ">=",
      "right": { "type": "fraction", "numerator": 1, "denominator": 10 }
    }
  }
}
```

### Declaration amendment vote

67 percent of all votes, not of votes cast: the base is explicit.

```json
{
  "key": "declaration:14.2#amendment-vote",
  "kind": "norm",
  "domain": "governance",
  "title": "Declaration amendments need 67 percent of all votes",
  "statement": "An amendment to the Declaration needs the approval of {{owner:plural}} holding at least 67 percent of the total votes, not just of the votes cast.",
  "requestTypes": ["meeting"],
  "appliesTo": "vote",
  "appliesWhen": {
    "type": "compare",
    "left": { "type": "ref", "path": ["vote.subject"] },
    "op": "=",
    "right": { "type": "value", "term": "vote-subject.declaration-amendment" }
  },
  "effectiveFrom": "2025-11-12",
  "modality": "requirement",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "quotient",
        "of": [
          { "type": "ref", "path": ["vote.in-favor"] },
          { "type": "ref", "from": "community", "path": ["community.total-voting-power"] }
        ]
      },
      "op": ">=",
      "right": { "type": "fraction", "numerator": 67, "denominator": 100 }
    }
  }
}
```

### Records within 10 business days

Business days skip weekends and holidays.

```json
{
  "key": "property-code:209.005#records-response",
  "kind": "norm",
  "domain": "governance",
  "title": "Records produced within 10 business days",
  "statement": "The {{organization}} must produce requested records within 10 business days after a written request.",
  "requestTypes": ["records-request"],
  "appliesTo": "records-request",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "organization",
  "beneficiary": "owner",
  "check": {
    "type": "deadline",
    "act": { "type": "ref", "from": "request", "path": ["records-request.produced-on"] },
    "anchor": { "type": "ref", "from": "request", "path": ["records-request.received-on"] },
    "latest": { "value": 10, "unit": "business-day" }
  }
}
```

### An annual meeting each year

A recurring duty: the portal creates a compliance period for each scheduled date, and the deadline runs within it.

```json
{
  "key": "bylaws:3.2#annual-meeting",
  "kind": "norm",
  "domain": "governance",
  "title": "An annual meeting each year",
  "statement": "The {{board}} must hold an annual meeting of the {{members}} each year.",
  "requestTypes": ["compliance-period"],
  "appliesTo": "compliance-period",
  "effectiveFrom": "2025-11-12",
  "modality": "obligation",
  "bearer": "board",
  "check": {
    "type": "deadline",
    "act": { "type": "ref", "from": "request", "path": ["compliance-period.completed-on"] },
    "anchor": { "type": "ref", "from": "request", "path": ["compliance-period.scheduled-on"] },
    "latest": { "value": 1, "unit": "year" }
  },
  "recurs": { "type": "ref", "from": "community", "path": ["community.annual-meeting"] }
}
```

### Board candidates own a lot for 12 months

Judged as of the governing date, the day the nomination was filed, so it gives the same answer whenever it's evaluated.

```json
{
  "key": "bylaws:4.1#candidate-ownership",
  "kind": "norm",
  "domain": "governance",
  "title": "Board candidates own a lot for 12 months",
  "statement": "A {{board}} candidate must have owned a {{lot}} for at least 12 months when the {{nomination}} is filed.",
  "requestTypes": ["nomination"],
  "appliesTo": "nomination",
  "effectiveFrom": "2025-11-12",
  "modality": "requirement",
  "check": {
    "type": "test",
    "test": {
      "type": "compare",
      "left": {
        "type": "shift",
        "of": { "type": "ref", "path": ["nomination.ownership-start"] },
        "by": { "value": 12, "unit": "month" }
      },
      "op": "<=",
      "right": { "type": "governing-date" }
    }
  }
}
```

## Settings, a question and an evaluation

### Organization settings

Clauses from the documents, each cited, and the organization's own policy choices. Violation sanctions need notice and
any requested hearing first, except self-help.

```json
{
  "clauses": {
    "precedence": {
      "order": [
        ["statute", "ordinance"],
        ["declaration", "supplemental-declaration", "plat"],
        ["articles"],
        ["bylaws"],
        ["rules", "policy", "resolution", "design-guidelines"],
        ["minutes"]
      ]
    },
    "time": { "days": "calendar-day", "rollForward": true, "holidays": "us-federal", "zone": "America/Chicago" },
    "liability": [{ "actor": "tenant", "liable": "owner" }, { "actor": "guest", "liable": "owner" }],
    "cure": {
      "value": 10,
      "unit": "calendar-day",
      "after": { "from": "request", "path": ["violation.notice-delivered-on"] },
      "curedBy": { "from": "request", "path": ["violation.cured-on"] }
    },
    "deciders": [{ "requestType": "architectural-application", "party": "committee" }],
    "sanctionPreconditions": [
      {
        "requestTypes": ["violation"],
        "except": ["declaration:7.3#self-help"],
        "condition": {
          "type": "all",
          "of": [
            { "type": "exists", "from": "request", "path": ["violation.notice-delivered-on"] },
            {
              "type": "any",
              "of": [
                { "type": "exists", "from": "request", "path": ["violation.hearing-held-on"] },
                {
                  "type": "not",
                  "of": { "type": "exists", "from": "request", "path": ["violation.hearing-requested-on"] }
                }
              ]
            }
          ]
        }
      }
    ]
  },
  "policy": {
    "decisionPolicy": { "change-detail": "approve-with-conditions", "redesign": "deny", "none": "deny" },
    "thresholds": { "factConfidence": 0.8, "judgmentConfidence": 0.8 }
  }
}
```

### An interpretation question

Two readings of 5.5.1(i), each a candidate rule. The answer approves one and rejects the other.

```json
{
  "kind": "interpretation",
  "question": "Does the 72-inch limit in 5.5.1(i) apply to front fences, or only to boundary and return fences?",
  "about": { "rules": ["guidelines:5.5.1(i)#max-height", "guidelines:5.5.1(i)#max-height-all"] },
  "options": [
    { "label": "Only boundary and return fences", "keeps": ["guidelines:5.5.1(i)#max-height"] },
    { "label": "Every wood or composite fence", "keeps": ["guidelines:5.5.1(i)#max-height-all"] }
  ]
}
```

### An evaluation request

What the application workflow sends: the subjects, the facts extracted from the applicant's files, and the dates.

```json
{
  "type": "architectural-application",
  "governingDate": "2026-02-03",
  "evaluationDate": "2026-02-03",
  "lot": "lot",
  "entities": [
    { "id": "request", "type": "architectural-application", "label": "Fence application", "ref": "app-0311" },
    { "id": "lot", "type": "lot", "label": "Unit 42", "ref": "lot-42" },
    { "id": "run-1", "type": "fence-run", "label": "Rear run" },
    { "id": "run-2", "type": "fence-run", "label": "Side run" }
  ],
  "facts": [
    {
      "entity": "run-1",
      "property": "fence-run.material",
      "state": "known",
      "value": { "type": "value", "term": "fence-material.composite", "text": "composite" },
      "stated": "composite",
      "evidence": [{ "fileId": "file-1", "page": 3, "quote": "Trex Transcend composite, River Birch" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    },
    {
      "entity": "run-1",
      "property": "fence-run.manufacturer",
      "state": "known",
      "value": { "type": "value", "term": "composite-manufacturer.trex", "text": "Trex" },
      "stated": "Trex",
      "evidence": [{ "fileId": "file-1", "page": 3, "quote": "Trex Transcend composite, River Birch" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    },
    {
      "entity": "run-1",
      "property": "fence-run.color",
      "state": "known",
      "value": { "type": "value", "term": "composite-color.river-birch", "text": "River Birch" },
      "stated": "River Birch",
      "evidence": [{ "fileId": "file-1", "page": 3, "quote": "Trex Transcend composite, River Birch" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    },
    {
      "entity": "run-1",
      "property": "fence-run.location",
      "state": "known",
      "value": { "type": "value", "term": "fence-location.rear", "text": "rear" },
      "stated": "rear",
      "evidence": [{ "fileId": "file-1", "page": 2, "quote": "rear property line" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    },
    {
      "entity": "run-2",
      "property": "fence-run.material",
      "state": "known",
      "value": { "type": "value", "term": "fence-material.composite", "text": "composite" },
      "stated": "composite",
      "evidence": [{ "fileId": "file-1", "page": 4, "quote": "Fiberon Horizon composite" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    },
    {
      "entity": "run-2",
      "property": "fence-run.manufacturer",
      "state": "known",
      "value": { "type": "value", "text": "Fiberon" },
      "stated": "Fiberon",
      "evidence": [{ "fileId": "file-1", "page": 4, "quote": "Fiberon Horizon composite" }],
      "confidence": 0.95,
      "provenance": { "by": "extraction", "at": "2026-02-03T15:00:00Z" }
    }
  ]
}
```

### The findings it gets back

Trex in River Birch is not met. Fiberon goes to the committee through the discretion rule. The rear run's height and
boundary are missing information.

```json
[
  {
    "asOf": "2026-02-03",
    "evaluatedAt": "2026-02-03T15:01:00Z",
    "ruleKey": "guidelines:5.4.2(i)#colors",
    "entity": "run-1",
    "outcome": "not-met",
    "remedy": "change-detail",
    "reason": "River Birch is a Frame It All color; Trex offers Winchester Grey or Saddle.",
    "inputs": [
      { "entity": "run-1", "property": "fence-run.material", "state": "known" },
      { "entity": "run-1", "property": "fence-run.manufacturer", "state": "known" },
      { "entity": "run-1", "property": "fence-run.color", "state": "known" }
    ]
  },
  {
    "modifiedBy": [{ "ruleKey": "guidelines:5.3.2#other-manufacturers", "effect": "decided-by" }],
    "asOf": "2026-02-03",
    "evaluatedAt": "2026-02-03T15:01:00Z",
    "ruleKey": "guidelines:5.4.2(i)#colors",
    "entity": "run-2",
    "outcome": "committee",
    "reason": "Fiberon isn't a listed manufacturer; the committee considers other manufacturers case by case.",
    "inputs": [
      { "entity": "run-2", "property": "fence-run.material", "state": "known" },
      { "entity": "run-2", "property": "fence-run.manufacturer", "state": "known" },
      { "entity": "run-2", "property": "fence-run.color", "state": "unknown" }
    ]
  },
  {
    "asOf": "2026-02-03",
    "evaluatedAt": "2026-02-03T15:01:00Z",
    "ruleKey": "guidelines:5.5.1(i)#max-height",
    "entity": "run-1",
    "outcome": "missing-information",
    "remedy": "provide-information",
    "reason": "The application doesn't say whether the rear run is on a boundary, or how tall it is.",
    "inputs": [
      { "entity": "run-1", "property": "fence-run.material", "state": "known" },
      { "entity": "run-1", "property": "fence-run.boundary-with", "state": "unknown" },
      { "entity": "run-1", "property": "fence-run.location", "state": "known" },
      { "entity": "run-1", "property": "fence-run.height", "state": "unknown" }
    ]
  }
]
```
