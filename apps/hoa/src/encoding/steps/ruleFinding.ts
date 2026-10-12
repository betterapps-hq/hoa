import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { GoverningDocument, Provision, ProvisionKey, TermKey } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import {
  documentKey,
  documentKind,
  domain,
  provisionKey,
  ruleKey,
  sanction,
  sanctionModality,
  type TermContent
} from "@/schema/zod"
import { ratio } from "@/text/match"
import { labelForms } from "@/text/normalize"
import type { EncodingUnit } from "../plan"
import { contextText, coreTermsText, documentLine, provisionBlock, referencesText, termLines } from "../promptVariables"
import { keyEnum, segment } from "./drafts"
import type { Outline, OutlineTargets } from "./outline"
import { none, type stepPrompts } from "./prompts"

// E. Find the rules (hoa-rule-finding, prompt drafts v2): per section, every provision gets rule outlines, settings
// flags or a no-rule reason. Each outline fixes what later steps may not change and says what it reads, in plain
// words, for C. One fixed answer format for the whole build: strict branches by kind (a judged rule names who decides,
// a requirement has no bearer, a sanction is its own subject with one request type, a permission or discretion names
// its targets). Its only enums are build-wide: core and known parties and subjects, the request types. A subject or
// party may instead be a new label, which code resolves against B's terms. Provision keys are strings code checks; code
// composes each rule's key `{provision}#{aspect}`.

/** The build-wide keys E may name: parties, subjects and request types from the core and the known terms. */
export function findingKeys(knownTerms: readonly TermContent[]) {
  const all = [...new Map([...coreTerms, ...knownTerms].map((term) => [term.key, term as TermContent])).values()]
  const lookup = createVocabulary([...knownTerms])
  const subjects = all.filter((term) => term.kind === "thing" || term.kind === "category").map((term) => term.key)
  return {
    parties: subjects.filter((key) => lookup.isParty(key)),
    subjects,
    requestTypes: subjects.filter((key) => lookup.requestOf(key) !== null)
  }
}

/** E's answer for a build: its enums are the build's parties, subjects and request types. */
export function ruleFindingAnswer(keys: ReturnType<typeof findingKeys>) {
  const label = z.strictObject({ label: z.string().min(1) })
  const party = z.union([keyEnum(keys.parties), label])
  const subject = z.union([keyEnum(keys.subjects), label])
  const requestType = keyEnum(keys.requestTypes)
  const requestTypes = z.array(requestType)
  const read = z.object({ about: z.string().min(1), fact: z.string().min(1) })
  const targets = z.object({
    rules: z.array(ruleKey),
    provisions: z.array(provisionKey),
    documents: z.array(documentKey)
  })
  const common = {
    aspect: segment,
    summary: z.string().min(1),
    domain,
    citations: z.array(provisionKey),
    reads: z.array(read),
    interpretation: z.boolean()
  }
  const outline = z.discriminatedUnion("kind", [
    z.strictObject({
      ...common,
      kind: z.enum(["obligation", "recommendation", "prohibition"]),
      bearer: party,
      appliesTo: subject,
      requestTypes
    }),
    z.strictObject({
      ...common,
      kind: z.enum(["obligation-judged", "recommendation-judged"]),
      bearer: party,
      decidedBy: party,
      appliesTo: subject,
      requestTypes
    }),
    z.strictObject({ ...common, kind: z.literal("requirement"), appliesTo: subject, requestTypes }),
    z.strictObject({
      ...common,
      kind: z.literal("permission"),
      bearer: party,
      appliesTo: subject.nullable(),
      requestTypes,
      overrides: targets
    }),
    z.strictObject({
      ...common,
      kind: z.literal("discretion"),
      decidedBy: party,
      appliesTo: subject.nullable(),
      requestTypes,
      overrides: targets
    }),
    z.strictObject({
      ...common,
      kind: z.literal("sanction"),
      modality: sanctionModality,
      requestType,
      sanctionType: sanction.shape.type,
      imposedBy: party,
      against: z.array(party).min(1),
      enforces: targets
    }),
    z.strictObject({ ...common, kind: z.literal("limit"), appliesTo: subject, requestTypes, limits: targets })
  ])
  const noRule = z.discriminatedUnion("reason", [
    z.object({ reason: z.enum(["heading", "recital", "reserved"]) }),
    z.object({ reason: z.literal("explanatory"), note: z.string().min(1) }),
    z.object({ reason: z.literal("duplicate"), of: provisionKey })
  ])
  const settingFlag = z.object({
    clause: z.enum(["precedence", "time", "liability", "cure", "deciders", "sanctionPreconditions"]),
    summary: z.string().min(1)
  })
  return z.object({
    provisions: z.array(
      z.object({
        key: provisionKey,
        outlines: z.array(outline),
        settings: z.array(settingFlag),
        noRule: noRule.nullable()
      })
    ),
    questions: z.array(
      z.object({
        question: z.string().min(1),
        provisions: z.array(provisionKey).min(1),
        readings: z.array(z.object({ label: z.string().min(1), rules: z.array(ruleKey).min(1) })).min(2)
      })
    ),
    referencedDocuments: z.array(z.object({ key: documentKey, kind: documentKind, title: z.string().min(1) })),
    notes: z.array(z.string())
  })
}
export type RuleFindingAnswer = z.output<ReturnType<typeof ruleFindingAnswer>>
type DraftOutline = RuleFindingAnswer["provisions"][number]["outlines"][number]
type Named = string | { label: string }

const noTargets: OutlineTargets = { rules: [], provisions: [], documents: [] }

/** A key, or a new label as its text: code resolves labels against B's terms (`keyedOutline`). */
const nameOf = (value: Named) => (typeof value === "string" ? value : value.label)

/** One drafted outline as an outline: the key composed, the kind split into the schema's kind and modality. */
function outlineOf(provision: ProvisionKey, unitId: string, draft: DraftOutline): Outline {
  const base = {
    key: `${provision}#${draft.aspect}`,
    provisionKey: provision,
    unitId,
    summary: draft.summary,
    domain: draft.domain,
    citations: draft.citations.filter((key) => key !== provision),
    interpretation: draft.interpretation,
    reads: draft.reads,
    readKeys: [],
    except: null,
    sanction: null,
    resolved: null,
    selector: null,
    check: null,
    decidedBy: null,
    targets: null
  }
  switch (draft.kind) {
    case "obligation":
    case "recommendation":
    case "prohibition":
      return {
        ...base,
        kind: "norm",
        modality: draft.kind,
        bearer: nameOf(draft.bearer),
        appliesTo: nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes
      }
    case "obligation-judged":
    case "recommendation-judged":
      return {
        ...base,
        kind: "norm",
        modality: draft.kind === "obligation-judged" ? "obligation" : "recommendation",
        bearer: nameOf(draft.bearer),
        appliesTo: nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes,
        check: "judgment",
        decidedBy: nameOf(draft.decidedBy)
      }
    case "requirement":
      return {
        ...base,
        kind: "norm",
        modality: "requirement",
        bearer: null,
        appliesTo: nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes
      }
    case "permission":
      return {
        ...base,
        kind: "norm",
        modality: "permission",
        bearer: nameOf(draft.bearer),
        appliesTo: draft.appliesTo === null ? null : nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes,
        targets: draft.overrides
      }
    case "discretion":
      return {
        ...base,
        kind: "discretion",
        modality: null,
        bearer: null,
        appliesTo: draft.appliesTo === null ? null : nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes,
        decidedBy: nameOf(draft.decidedBy),
        targets: draft.overrides
      }
    case "sanction":
      return {
        ...base,
        kind: "sanction",
        modality: draft.modality,
        bearer: null,
        appliesTo: draft.requestType,
        requestTypes: [draft.requestType],
        targets: draft.enforces,
        except: noTargets,
        sanction: { type: draft.sanctionType, imposedBy: nameOf(draft.imposedBy), against: draft.against.map(nameOf) }
      }
    case "limit":
      return {
        ...base,
        kind: "limit",
        modality: null,
        bearer: null,
        appliesTo: nameOf(draft.appliesTo),
        requestTypes: draft.requestTypes,
        targets: draft.limits
      }
  }
}

/** The outlines of one section's answer, in its order. */
export const outlinesOf = (answer: RuleFindingAnswer, unitId: string) =>
  answer.provisions.flatMap((entry) => entry.outlines.map((draft) => outlineOf(entry.key, unitId, draft)))

/** The settings-clause flags of a section's answer, by provision. */
export const settingsFlagsOf = (answer: RuleFindingAnswer) =>
  answer.provisions.flatMap((entry) => entry.settings.map((flag) => ({ provisionKey: entry.key, ...flag })))

/** How close two whole labels must be, after normalization, for a label to name a term it doesn't spell exactly. */
const labelThreshold = 0.9

/**
 * A subject or party as a term key: the key itself when the vocabulary has it, else the thing or category one of whose
 * labels it is (normalized, with plurals), else the one whose label is nearly the same as a whole (OCR noise, small
 * wording changes); null for a label no term has yet (C adds it). Labels are compared whole, never as a part of a
 * longer label.
 */
export function subjectKey(text: string, vocabulary: readonly TermContent[]) {
  const terms = [...coreTerms, ...vocabulary].filter((term) => term.kind === "thing" || term.kind === "category")
  if (terms.some((term) => term.key === text)) {
    return text
  }
  const forms = labelForms({ text })
  const exact = terms.find((term) =>
    term.labels.some((label) => labelForms(label).some((form) => forms.includes(form)))
  )
  if (exact) {
    return exact.key
  }
  let best: { key: TermKey; score: number } | null = null
  for (const term of terms) {
    for (const label of term.labels) {
      const score = Math.max(...forms.flatMap((form) => labelForms(label).map((other) => ratio(form, other))))
      if (score >= labelThreshold && score > (best?.score ?? 0)) {
        best = { key: term.key, score }
      }
    }
  }
  return best?.key ?? null
}

/** An outline with its subjects and parties as keys where B's terms (or the core) have them. */
export function keyedOutline(outline: Outline, vocabulary: readonly TermContent[]): Outline {
  const key = (text: string | null) => (text === null ? null : (subjectKey(text, vocabulary) ?? text))
  return {
    ...outline,
    bearer: key(outline.bearer),
    appliesTo: key(outline.appliesTo),
    decidedBy: key(outline.decidedBy),
    sanction: outline.sanction
      ? {
          ...outline.sanction,
          imposedBy: key(outline.sanction.imposedBy) ?? outline.sanction.imposedBy,
          against: outline.sanction.against.map((item) => key(item) ?? item)
        }
      : null
  }
}

export type FindingProblem = { provisionKey: ProvisionKey; code: string; message: string }

/** Rules whose checks read no fact: judged rules, approvals and prohibitions of the subject itself (a warning). */
const readsNothing = (outline: DraftOutline) =>
  outline.kind === "obligation-judged" ||
  outline.kind === "recommendation-judged" ||
  outline.kind === "prohibition" ||
  outline.kind === "permission" ||
  outline.kind === "discretion"

function targetsOf(outline: DraftOutline) {
  switch (outline.kind) {
    case "permission":
    case "discretion":
      return outline.overrides
    case "sanction":
      return outline.enforces
    case "limit":
      return outline.limits
    default:
      return null
  }
}

/**
 * E's check of one section's answer (prompt drafts v2, the E check): every provision of the section appears exactly
 * once and no other does; keys are unique; an entry with outlines or settings has no reason; a provision with
 * neither has a reason or is cited by an outline of the build; citations name real provisions; targets name at least
 * one rule, provision or document; an outline reads something unless its kind tests no fact (a warning).
 */
export function checkFinding(input: {
  answer: RuleFindingAnswer
  unitProvisions: readonly ProvisionKey[]
  provisions: readonly Pick<Provision, "key">[]
  /** Every outline of the build, for what cites what. */
  outlines: readonly Outline[]
}): FindingProblem[] {
  const problems: FindingProblem[] = []
  const problem = (provision: ProvisionKey, code: string, message: string) =>
    problems.push({ provisionKey: provision, code, message })
  const counts = new Map<string, number>()
  for (const entry of input.answer.provisions) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1)
  }
  const own = new Set(input.unitProvisions)
  for (const key of input.unitProvisions) {
    const count = counts.get(key) ?? 0
    if (count === 0) {
      problem(key, "missing-provision", `${key} has no entry`)
    } else if (count > 1) {
      problem(key, "repeated-provision", `${key} has ${count} entries`)
    }
  }
  for (const key of [...counts.keys()].filter((item) => !own.has(item)).toSorted(compareCodeUnits)) {
    problem(key, "other-provision", `${key} isn't a provision of the section`)
  }
  const known = new Set(input.provisions.map((provision) => provision.key))
  const cited = new Set(input.outlines.flatMap((item) => [item.provisionKey, ...item.citations]))
  for (const entry of input.answer.provisions) {
    const aspects = entry.outlines.map((item) => item.aspect)
    for (const aspect of new Set(aspects.filter((item, index) => aspects.indexOf(item) !== index))) {
      problem(entry.key, "duplicate-key", `${entry.key}#${aspect} is outlined twice`)
    }
    const hasContent = entry.outlines.length > 0 || entry.settings.length > 0
    if (hasContent && entry.noRule !== null) {
      problem(
        entry.key,
        "reason-with-rules",
        `${entry.key} has outlines or settings and the reason ${entry.noRule.reason}`
      )
    }
    if (!hasContent && entry.noRule === null && !cited.has(entry.key)) {
      problem(entry.key, "uncovered", `${entry.key} has no outline, setting or reason, and nothing cites it`)
    }
    for (const outline of entry.outlines) {
      for (const citation of outline.citations.filter((key) => !known.has(key))) {
        problem(
          entry.key,
          "citation-not-found",
          `${entry.key}#${outline.aspect} cites ${citation}, which isn't a provision`
        )
      }
      const targets = targetsOf(outline)
      if (targets && targets.rules.length + targets.provisions.length + targets.documents.length === 0) {
        problem(
          entry.key,
          "no-targets",
          `${entry.key}#${outline.aspect} names nothing it overrides, enforces or limits`
        )
      }
      if (outline.reads.length === 0 && !readsNothing(outline)) {
        problem(entry.key, "no-reads", `${entry.key}#${outline.aspect} reads no fact`)
      }
    }
  }
  return problems
}

/** Whether a provision's text is only its number and heading ("7.4 Compliance and Enforcement."). */
export function isHeadingOnly(provision: Pick<Provision, "num" | "heading" | "text" | "intro" | "wrapUp">) {
  if (provision.intro || provision.wrapUp) {
    return false
  }
  const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const label = new Set([...words(provision.num?.printed ?? ""), ...words(provision.heading ?? "")])
  return words(provision.text).every((word) => label.has(word))
}

/**
 * An answer with the reason heading given by code to each provision the model left with no outline, setting or reason
 * whose text is only its number and heading: deterministic, so the model's call isn't needed for it.
 */
export function withHeadingReasons(
  answer: RuleFindingAnswer,
  provisions: readonly Pick<Provision, "key" | "num" | "heading" | "text" | "intro" | "wrapUp">[]
): RuleFindingAnswer {
  const headingOnly = new Set(provisions.filter(isHeadingOnly).map((provision) => provision.key))
  return {
    ...answer,
    provisions: answer.provisions.map((entry) =>
      entry.noRule === null && entry.outlines.length === 0 && entry.settings.length === 0 && headingOnly.has(entry.key)
        ? { ...entry, noRule: { reason: "heading" } }
        : entry
    )
  }
}

/** hoa-rule-finding's variables for one section; the build-wide ones are the same for every call. */
export function ruleFindingVariables(input: {
  unit: EncodingUnit
  documents: readonly Pick<GoverningDocument, "key" | "kind" | "title" | "edition">[]
  /** Every document's definition provisions. */
  definitions: readonly Provision[]
  /** Things, parties and categories of the previous reviewed or published rulebook. */
  knownTerms: readonly TermContent[]
  problems?: string
}): PromptVariables<typeof stepPrompts.ruleFinding> {
  return {
    coreTerms: coreTermsText(),
    requestTypes: termLines(input.unit.requestTypes.filter((term) => term.kind === "thing")),
    knownTerms: none(termLines(input.knownTerms)),
    documents: input.documents.map(documentLine).join("\n"),
    definitions: none(input.definitions.map(provisionBlock).join("\n\n")),
    context: contextText(input.unit.context),
    references: referencesText(input.unit.references),
    provisions: input.unit.provisions.map(provisionBlock).join("\n\n"),
    problems: input.problems ?? "none"
  }
}
