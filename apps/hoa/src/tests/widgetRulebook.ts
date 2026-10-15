import { storedRule, storedTerm } from "@/schema/exampleRulebook.test-data"
import type { RulesFile } from "@/schema/types"
import type { TermDraft } from "@/schema/zod"
import { examples } from "./engineContext"

// A synthetic rulebook about widgets, for tests that must not lean on a sample: a widget's placement (alpha, beta,
// gamma) and finish (one to four), both complete sets, and its size in inches. One rule limits only the listed
// placements, another permits only the listed finishes; each cites its own passage.

const organizationId = "org-sample"
const labels = (text: string) => [{ text, role: "preferred" as const }]
const terms: TermDraft[] = [
  { key: "widget", organizationId, kind: "thing", nature: "object", request: null, labels: labels("widget") },
  ...(["placement", "finish"] as const).flatMap((name): TermDraft[] => [
    {
      key: `widget.${name}`,
      organizationId,
      kind: "property",
      of: "widget",
      valueType: { type: "choice", set: `widget-${name}` },
      many: false,
      ifUnstated: "unknown",
      derived: null,
      labels: labels(name)
    },
    { key: `widget-${name}`, organizationId, kind: "value-set", complete: true, labels: labels(`widget ${name}`) }
  ]),
  {
    key: "widget.size",
    organizationId,
    kind: "property",
    of: "widget",
    valueType: { type: "quantity", unit: "inch" },
    many: false,
    ifUnstated: "unknown",
    derived: null,
    labels: labels("size")
  },
  ...["alpha", "beta", "gamma"].map((name) => value(`widget-placement.${name}`, name)),
  ...["one", "two", "three", "four"].map((name) => value(`widget-finish.${name}`, name))
]

function value(key: string, label: string): TermDraft {
  return {
    key,
    organizationId,
    kind: "value",
    set: key.slice(0, key.lastIndexOf(".")),
    broader: [],
    labels: labels(label)
  }
}

/** The passages the two rules cite: the limit's, then the permission's. */
export const widgetProvisions = [examples.provisions[0]?.key ?? "", examples.provisions[1]?.key ?? ""] as const

const ref = (...path: string[]) => ({ type: "ref" as const, path })
const val = (key: string) => ({ type: "value" as const, term: key })
const rule = {
  requestTypes: ["architectural-application"],
  scope: null,
  authority: null,
  effectiveFrom: "2025-01-01",
  beneficiary: null,
  decidedBy: [],
  overrides: [],
  noExceptions: null,
  cure: null,
  recurs: null,
  kind: "norm" as const,
  domain: "architectural" as const,
  appliesTo: ["widget"],
  modality: "obligation" as const,
  bearer: ["owner"],
  remedy: "change-detail" as const
}

/** Limits only the listed placements: a widget placed alpha or beta is at most 10 inches. */
export const limitsListed = storedRule({
  ...rule,
  key: "guidelines:1#limits-listed",
  citations: [{ provisionKey: widgetProvisions[0], highlight: null, region: null }],
  title: "Alpha and beta widgets at most 10 inches",
  statement: "A {{widget}} placed alpha or beta must have a {{widget.size}} of at most 10 inches.",
  appliesWhen: {
    type: "in",
    left: ref("widget.placement"),
    values: [val("widget-placement.alpha"), val("widget-placement.beta")]
  },
  check: {
    type: "test",
    test: { type: "compare", left: ref("widget.size"), op: "<=", right: { type: "quantity", value: 10, unit: "inch" } }
  }
})

/** Permits only the listed finishes. */
export const permitsListed = storedRule({
  ...rule,
  key: "guidelines:1#permits-listed",
  citations: [{ provisionKey: widgetProvisions[1], highlight: null, region: null }],
  title: "Widgets only in finish one, two or three",
  statement: "A {{widget}} must have a {{widget.finish}} of one, two or three.",
  appliesWhen: null,
  check: {
    type: "test",
    test: {
      type: "in",
      left: ref("widget.finish"),
      values: [val("widget-finish.one"), val("widget-finish.two"), val("widget-finish.three")]
    }
  }
})

export const widgetRulesFile: RulesFile = {
  ...examples,
  terms: [...examples.terms, ...terms.map(storedTerm)],
  rules: [limitsListed, permitsListed]
}
