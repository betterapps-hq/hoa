import type { GoverningDocument, Provision } from "@/schema/types"
import { encodingDraft, termDraft, type EncodingDraft, type RuleDraft, type TermDraft } from "@/schema/zod"

// Made-up encoding drafts for the merge, consolidation, repair and prompt tests: a declaration and a set of board rules
// about sheds, two units whose drafts overlap the way parallel encoders' do.

const edition = {
  label: "Adopted 2025-01-01",
  adoptedOn: "2025-01-01",
  adoptedBy: null,
  effectiveFrom: "2025-01-01",
  basis: "original" as const,
  files: [],
  recording: null
}

export const draftDocuments: GoverningDocument[] = [
  { key: "declaration", kind: "declaration", title: "Declaration", issuedBy: "members", governs: null, edition },
  { key: "rules", kind: "rules", title: "Community Rules", issuedBy: "board", governs: null, edition }
]

export const provision = (key: string, parentLabel: string | null, text: string): Provision => ({
  key,
  kind: parentLabel ? "point" : "section",
  num: null,
  label: key.slice(key.indexOf(":") + 1),
  heading: null,
  parentLabel,
  intro: null,
  text,
  wrapUp: null,
  anchors: [],
  noRule: null
})

export const draftProvisions: Provision[] = [
  provision("declaration:4.1", null, "Sheds are allowed on every Lot."),
  provision("rules:1", null, "A shed may be at most ten feet tall."),
  provision("rules:2", null, "Sheds must also look like the house:"),
  provision("rules:2(a)", "2", "No shed may be taller than ten feet."),
  provision("rules:3", null, "Paint colors are listed in the color guide.")
]

export const cite = (provisionKey: string) => ({ provisionKey, highlight: null, region: null })

export const shedTerms: TermDraft[] = [
  {
    key: "shed",
    kind: "thing",
    nature: "object",
    labels: [{ text: "shed", role: "preferred", plural: "sheds" }],
    citations: [cite("rules:1")]
  },
  {
    key: "shed.height",
    kind: "property",
    of: "shed",
    valueType: { type: "quantity", unit: "foot" },
    ifUnstated: "unknown",
    labels: [{ text: "height", role: "preferred" }]
  }
]

export const vocabulary = shedTerms.map((term) => termDraft.parse(term))

export function heightRule(key: string, citation: string, feet = 10): RuleDraft {
  return {
    key,
    domain: "architectural",
    title: "Shed height",
    statement: `A {{shed}} is at most ${feet} feet tall.`,
    citations: [cite(citation)],
    requestTypes: ["architectural-application"],
    appliesTo: "shed",
    effectiveFrom: "2025-01-01",
    kind: "norm",
    modality: "requirement",
    check: {
      type: "test",
      test: {
        type: "compare",
        left: { type: "ref", path: ["shed.height"] },
        op: "<=",
        right: { type: "quantity", value: feet, unit: "foot" }
      }
    }
  }
}

export const allowedRule: RuleDraft = {
  key: "declaration:4.1#sheds-allowed",
  domain: "architectural",
  title: "Sheds allowed",
  statement: "An {{owner}} may build a {{shed}}.",
  citations: [cite("declaration:4.1")],
  requestTypes: ["architectural-application"],
  appliesTo: "shed",
  effectiveFrom: "2025-01-01",
  kind: "norm",
  modality: "permission",
  bearer: "owner"
}

export const firstDraft: EncodingDraft = {
  provisions: [{ key: "declaration:4.1" }, { key: "rules:1" }],
  terms: [
    {
      key: "shed",
      kind: "thing",
      nature: "object",
      labels: [
        { text: "shed", role: "preferred" },
        { text: "storage shed", role: "alternative" }
      ],
      definition: "A small building for storage.",
      citations: [cite("rules:1")]
    }
  ],
  rules: [allowedRule, heightRule("rules:1#max-height", "rules:1")],
  clauses: {
    precedence: { order: [["declaration"], ["rules"]], citations: [cite("declaration:4.1")] },
    deciders: [{ requestType: "architectural-application", party: "committee", citations: [cite("rules:1")] }]
  },
  referencedDocuments: [{ key: "by-laws", kind: "bylaws", title: "By-Laws" }]
}

export const secondDraft: EncodingDraft = {
  provisions: [
    { key: "rules:2", noRule: { reason: "explanatory", note: "Introduces the list." } },
    { key: "rules:2(a)" }
  ],
  terms: [
    {
      key: "shed",
      kind: "thing",
      nature: "object",
      labels: [{ text: "shed", role: "preferred" }],
      definition: "An outbuilding.",
      citations: [cite("rules:2(a)")]
    },
    {
      key: "garden-shed",
      kind: "thing",
      nature: "object",
      labels: [{ text: "Sheds", role: "preferred" }],
      citations: [cite("rules:2(a)")]
    }
  ],
  rules: [heightRule("rules:1#max-height", "rules:1"), heightRule("rules:2(a)#max-height", "rules:2(a)")],
  questions: [
    {
      kind: "interpretation",
      question: "Does a carport count as a shed?",
      about: { rules: ["rules:2(a)#max-height"], terms: ["garden-shed"] },
      options: [{ label: "Yes", keeps: ["rules:2(a)#max-height"] }]
    }
  ],
  clauses: {
    precedence: { order: [["declaration"], ["rules"]], citations: [cite("rules:2")] },
    deciders: [{ requestType: "architectural-application", party: "board", citations: [cite("rules:2")] }]
  },
  referencedDocuments: [{ key: "by-laws", kind: "bylaws", title: "By-Laws" }]
}

export const parsedDraft = (draft: EncodingDraft) => encodingDraft.parse(draft)
