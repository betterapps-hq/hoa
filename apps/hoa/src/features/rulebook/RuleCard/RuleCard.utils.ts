import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import { amountText } from "../rulebookRecords"
import { modalityLabels, ruleKindLabels } from "../ruleLabels"

// How a rule card words a rule's kind and cure period.

/** "Norm: must (an obligation)" */
export const kindLabel = (rule: T.Rule) =>
  rule.kind === "norm" ? modalityLabels[rule.modality] : ruleKindLabels[rule.kind]

/** A norm's cure period in words. */
export function cureLabel(cure: Extract<T.Rule, { kind: "norm" }>["cure"], vocabulary: Vocabulary) {
  return match(cure)
    .with(null, () => "The organization’s default")
    .with("none", () => "None: it must be fixed at once")
    .otherwise(({ value, unit, after }) => {
      const from = after.path.map((key) => vocabulary.label(key)).join("’s ")
      return `${amountText(value, unit, vocabulary)} from its ${from} date`
    })
}
