import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// What kind of term a key is, in words, for the term popover and the terms tab.

const dimensionLabels: Record<T.Dimension, string> = {
  length: "length",
  area: "area",
  volume: "volume",
  weight: "weight",
  speed: "speed",
  money: "money",
  ratio: "ratio",
  "elapsed-time": "elapsed time",
  "calendar-period": "calendar time",
  "business-time": "business days"
}

/** A unit spelled out, as its longest label in letters: "inches" rather than "in"; its plural label without one. */
function unitWords(unit: T.TermKey, vocabulary: Vocabulary) {
  const words = (vocabulary.get(unit)?.labels ?? [])
    .map((label) => label.text)
    .filter((text) => /^[\p{L} ]+$/u.test(text))
  const [longest] = words.toSorted((a, b) => b.length - a.length)
  return longest ?? vocabulary.label(unit, true)
}

/** What a property holds, in words: "a quantity in inches", "yes or no", "one of the fence materials". */
export function describeValueType(valueType: T.ValueType, vocabulary: Vocabulary) {
  return match(valueType)
    .with({ type: "quantity" }, ({ unit }) => `a quantity in ${unitWords(unit, vocabulary)}`)
    .with({ type: "count" }, () => "a count")
    .with({ type: "boolean" }, () => "yes or no")
    .with({ type: "choice" }, ({ set }) => `one of the ${vocabulary.label(set, true)}`)
    .with({ type: "date" }, () => "a date")
    .with({ type: "date-time" }, () => "a date and time")
    .with({ type: "time-of-day" }, () => "a time of day")
    .with({ type: "schedule" }, () => "a schedule")
    .with({ type: "text" }, () => "text")
    .with({ type: "reference" }, ({ to }) => (to ? `a ${vocabulary.label(to)}` : "another thing"))
    .with({ type: "party" }, ({ among }) =>
      among ? `a party: ${among.map((key) => vocabulary.label(key)).join(" or ")}` : "a party"
    )
    .exhaustive()
}

/** "A detail of fence run: a quantity in inches" */
export function describeTermKind(term: TermContent, vocabulary: Vocabulary) {
  return match(term)
    .with({ kind: "thing" }, (thing) =>
      match(thing.nature)
        .with("party", () => "A party")
        .with("request", () => `A request type, for ${thing.request?.flow ?? "a"} requests`)
        .with("event", () => "An event")
        .with("document", () => "A document")
        .with("object", () => "A thing")
        .exhaustive()
    )
    .with({ kind: "category" }, ({ of }) => `A kind of ${vocabulary.label(of)}`)
    .with({ kind: "property" }, (property) => {
      const many = property.many ? ", any number of them" : ""
      return `A detail of ${vocabulary.label(property.of)}: ${describeValueType(property.valueType, vocabulary)}${many}`
    })
    .with({ kind: "value" }, ({ set }) => `One of the ${vocabulary.label(set, true)}`)
    .with({ kind: "value-set" }, ({ complete }) =>
      complete ? "A fixed list of choices" : "A list of choices that allows others"
    )
    .with({ kind: "unit" }, ({ dimension }) => `A unit of ${dimensionLabels[dimension]}`)
    .exhaustive()
}
