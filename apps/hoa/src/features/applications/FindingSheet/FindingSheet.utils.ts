import type { Normalization, Review } from "@/review/reviewModel"
import type { Fact, Finding } from "@/schema/types"
import type { ReviewAudience } from "../reviewContext"

// Where each fact a finding read came from (application-review.md, UX, Rule matrix): read from the packet, matched to
// a listed value, computed, recorded by the portal, or not provided.

export type InputSource =
  | { kind: "packet"; fact: Fact }
  | { kind: "matched"; fact: Fact; normalization: Normalization }
  | { kind: "portal"; fact: Fact }
  | { kind: "computed" }
  | { kind: "not-provided" }

const matchKinds: ReadonlySet<Normalization["kind"]> = new Set(["exact", "normalized", "fuzzy", "reading"])

export function inputSource(
  review: Pick<Review, "request" | "normalizations">,
  input: Finding["inputs"][number]
): InputSource {
  const is = (item: { entity: string; property: string }) =>
    item.entity === input.entity && item.property === input.property
  const fact = review.request.facts.find(is)
  if (input.state === "derived") {
    return { kind: "computed" }
  }
  if (!fact || input.state === "unknown") {
    return { kind: "not-provided" }
  }
  if (fact.provenance.by === "system") {
    return { kind: "portal", fact }
  }
  const normalization = review.normalizations.find(is)
  return normalization && matchKinds.has(normalization.kind)
    ? { kind: "matched", fact, normalization }
    : { kind: "packet", fact }
}

const sourceLabels: Record<InputSource["kind"], string> = {
  packet: "Read from the packet",
  matched: "Matched to a listed value",
  portal: "From the application record",
  computed: "Computed",
  "not-provided": "Not provided"
}

export const inputSourceLabel = (kind: InputSource["kind"], audience: ReviewAudience) =>
  kind === "packet" && audience === "homeowner" ? "Read from your packet" : sourceLabels[kind]

/** How a stated value was matched: "River Birch" matched "River Birch", 92% similar. */
export function matchText(normalization: Normalization) {
  const { stated, matchedLabel, kind, score } = normalization
  if (kind === "reading") {
    return `“${stated}” matched no listed value word for word; read as ${matchedLabel ?? "a listed value"}`
  }
  const similarity = kind === "fuzzy" && score !== null ? `, ${Math.round(score * 100)}% similar` : ""
  return `“${stated}” matched “${matchedLabel ?? stated}”${similarity}`
}

export const effectLabels: Record<Finding["modifiedBy"][number]["effect"], string> = {
  "decided-by": "Left to the committee by",
  exempt: "Exempted by",
  displaced: "Set aside by",
  limited: "Limited by"
}

export const judgmentLabels: Record<NonNullable<Finding["judgment"]>["answer"], string> = {
  yes: "Yes",
  no: "No",
  unclear: "Unclear"
}

export function statementResult(confirmed: boolean | null) {
  if (confirmed === null) {
    return "Not found"
  }
  return confirmed ? "Confirmed" : "Contradicted"
}
