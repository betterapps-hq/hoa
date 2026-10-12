import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { withLawFirst } from "@/schema/law"
import type { GoverningDocument, Provision, ProvisionKey, RuleKey, TermKey } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import {
  check,
  clauses,
  condition,
  cure,
  documentKey,
  operand,
  provisionKey,
  root,
  ruleDraft,
  ruleKey,
  ruleRemedy,
  ruleSelection,
  sanctionDraft,
  statementDraft,
  termKey,
  type TermContent
} from "@/schema/zod"
import { coreRequestTypes } from "../plan"
import { coreTermsText, documentLine, provisionBlock, termLines } from "../promptVariables"
import { citationsOf, propertyFields } from "./drafts"
import { kindName, structuringLine, type Outline } from "./outline"
import { none, type stepPrompts } from "./prompts"

// F. Structure the rules (hoa-rule-structuring, prompt drafts v2): for a batch of fixed outlines, the checks,
// conditions, remedies, cure, recurrence, sanction bodies, final override and enforcement keys and settings clauses.
// One answer format for the whole build: strict branches by the outline's kind, so a judged rule's check can only be a
// judgment, a requirement has no remedy or cure, a permission or prohibition has no check and a sanction has a body.
// Keys, kinds and targets are strings code checks against the batch's outlines; code merges each structure with its
// outline into a rule draft. The retry is the same prompt with the failing rules in its problems (ruleRetry.ts).

const factCheck = z.union(check.options.filter((option) => option.shape.type.value !== "judgment"))
const judgment = z.object({ type: z.literal("judgment"), question: z.string().min(1), evidence: z.array(termKey) })
const scheduleRef = z.object({ type: z.literal("ref"), from: root.optional(), path: z.array(termKey).min(1) })
const ruleCure = z.union([cure, z.literal("none")]).nullable()
/** Rules a norm or a clause excepts or overrides; null, which the model writes for none, means none. */
const selectionOrNone = ruleSelection.nullable().transform((selection) => selection ?? [])
const base = { key: ruleKey, title: z.string().min(1), statement: statementDraft, appliesWhen: condition.nullable() }
const normBase = {
  ...base,
  beneficiary: termKey.nullable(),
  noExceptions: provisionKey.nullable(),
  overrides: selectionOrNone
}

/** The structure of one rule, by its outline's kind. */
const structuredRule = z.discriminatedUnion("kind", [
  z.strictObject({
    ...normBase,
    kind: z.enum(["obligation", "recommendation"]),
    check: factCheck,
    remedy: ruleRemedy.nullable(),
    cure: ruleCure,
    recurs: scheduleRef.nullable()
  }),
  z.strictObject({
    ...normBase,
    kind: z.enum(["obligation-judged", "recommendation-judged"]),
    check: judgment,
    remedy: ruleRemedy.nullable(),
    cure: ruleCure,
    recurs: scheduleRef.nullable()
  }),
  z.strictObject({ ...normBase, kind: z.literal("requirement"), check: factCheck, recurs: scheduleRef.nullable() }),
  z.strictObject({ ...normBase, kind: z.literal("prohibition"), remedy: ruleRemedy.nullable(), cure: ruleCure }),
  z.strictObject({ ...normBase, kind: z.literal("permission") }),
  z.strictObject({ ...base, kind: z.literal("discretion"), overrides: ruleSelection }),
  z.strictObject({
    ...base,
    kind: z.literal("sanction"),
    enforces: z.object({ rules: z.array(ruleKey), documents: z.array(documentKey), except: z.array(ruleKey) }),
    sanction: sanctionDraft
  }),
  z.strictObject({
    ...base,
    kind: z.literal("limit"),
    limits: z.array(ruleKey).min(1),
    forbids: z.boolean(),
    maxAmount: operand.nullable(),
    maxTotal: operand.nullable()
  })
])
export type StructuredRule = z.output<typeof structuredRule>

const withCitations = { citations: z.array(provisionKey) }
const clauseDrafts = z
  .object({
    precedence: clauses.shape.precedence.extend(withCitations),
    time: clauses.shape.time.extend(withCitations),
    liability: z.array(clauses.shape.liability.element.extend({ except: selectionOrNone, ...withCitations })),
    cure: cure.extend(withCitations),
    deciders: z.array(clauses.shape.deciders.element.extend(withCitations)),
    sanctionPreconditions: z.array(
      clauses.shape.sanctionPreconditions.element.extend({ except: selectionOrNone, ...withCitations })
    )
  })
  .partial()

/** F's answer, first pass and retry alike. */
export const ruleStructuringAnswer = z.object({
  rules: z.array(structuredRule),
  clauses: clauseDrafts,
  proposedTerms: z.array(z.object({ ...propertyFields, neededBy: z.array(ruleKey).min(1), why: z.string().min(1) })),
  outlineIssues: z.array(z.object({ provision: provisionKey, rules: z.array(ruleKey), issue: z.string().min(1) })),
  unfixable: z.array(z.object({ key: ruleKey, note: z.string().min(1) })),
  notes: z.array(z.string())
})
export type RuleStructuringAnswer = z.output<typeof ruleStructuringAnswer>

/** The settings clauses an answer gives, with their citations as the schema's. */
export function clausesOf(answer: RuleStructuringAnswer) {
  const cite = <C extends { citations: string[] }>(clause: C) => ({
    ...clause,
    citations: citationsOf(clause.citations)
  })
  const { precedence, time, liability, cure: cureClause, deciders, sanctionPreconditions } = answer.clauses
  return clauses.partial().parse({
    ...(precedence ? { precedence: { ...cite(precedence), order: withLawFirst(precedence.order) } } : {}),
    ...(time ? { time: cite(time) } : {}),
    ...(liability ? { liability: liability.map(cite) } : {}),
    ...(cureClause ? { cure: cite(cureClause) } : {}),
    ...(deciders ? { deciders: deciders.map(cite) } : {}),
    ...(sanctionPreconditions ? { sanctionPreconditions: sanctionPreconditions.map(cite) } : {})
  })
}

/**
 * The outlines of other batches a batch reads beside its own: those its outlines override, enforce or except, and those
 * citing a provision the batch shows (a rule elsewhere may already cover part of it).
 */
export function relatedOutlines(batch: readonly Outline[], all: readonly Outline[]) {
  const keys = new Set(batch.map((outline) => outline.key))
  const targeted = new Set(
    batch.flatMap((outline) => [...(outline.resolved?.rules ?? []), ...(outline.resolved?.except ?? [])])
  )
  const shown = new Set(batch.flatMap((outline) => [outline.provisionKey, ...outline.citations]))
  return all.filter(
    (outline) =>
      !keys.has(outline.key) &&
      (targeted.has(outline.key) || [outline.provisionKey, ...outline.citations].some((key) => shown.has(key)))
  )
}

/** Batches of outlines in document order, about `size` rules each and never more than `max`; a provision's stay together. */
export function structuringBatches(outlines: readonly Outline[], size = 15, max = 20) {
  const byProvision = new Map<ProvisionKey, Outline[]>()
  for (const outline of outlines) {
    byProvision.set(outline.provisionKey, [...(byProvision.get(outline.provisionKey) ?? []), outline])
  }
  const batches: Outline[][] = []
  for (const group of byProvision.values()) {
    const last = batches.at(-1)
    if (last && last.length + group.length <= size) {
      last.push(...group)
    } else {
      for (let start = 0; start < group.length; start += max) {
        batches.push(group.slice(start, start + max))
      }
    }
  }
  return batches
}

const cite = (key: ProvisionKey) => ({ provisionKey: key, highlight: null, region: null })

/** A structure merged with its outline: the rule draft (not yet checked by Zod) the two make. */
export function draftOf(outline: Outline, rule: StructuredRule, effectiveFrom: string): Record<string, unknown> {
  const base = {
    key: outline.key,
    domain: outline.domain,
    title: rule.title,
    statement: rule.statement,
    citations: [outline.provisionKey, ...outline.citations].map(cite),
    requestTypes: outline.requestTypes,
    appliesTo: outline.appliesTo,
    appliesWhen: rule.appliesWhen,
    effectiveFrom
  }
  switch (rule.kind) {
    case "discretion":
      return { ...base, kind: "discretion", decidedBy: outline.decidedBy, overrides: rule.overrides }
    case "sanction": {
      const requestType = outline.requestTypes[0] ?? null
      return {
        ...base,
        appliesTo: requestType,
        requestTypes: requestType ? [requestType] : outline.requestTypes,
        kind: "sanction",
        modality: outline.modality,
        enforces: rule.enforces,
        against: outline.sanction?.against ?? [],
        imposedBy: outline.sanction?.imposedBy,
        sanction: rule.sanction
      }
    }
    case "limit":
      return {
        ...base,
        kind: "limit",
        limits: rule.limits,
        forbids: rule.forbids,
        maxAmount: rule.maxAmount,
        maxTotal: rule.maxTotal
      }
    default:
      return {
        ...base,
        kind: "norm",
        modality: outline.modality,
        bearer: outline.modality === "requirement" ? null : outline.bearer,
        beneficiary: rule.beneficiary,
        decidedBy: outline.decidedBy,
        overrides: rule.overrides,
        noExceptions: rule.noExceptions === null ? null : cite(rule.noExceptions),
        check: "check" in rule ? rule.check : null,
        remedy: "remedy" in rule ? rule.remedy : null,
        recurs: "recurs" in rule ? rule.recurs : null,
        cure: "cure" in rule ? rule.cure : null
      }
  }
}

export type StructureProblem = { key: RuleKey; code: string; message: string }

/**
 * The rule drafts an answer makes with the batch's outlines, and what code finds before Zod (the G checks): a key that
 * isn't one of the batch's outlines, an outline with no structure or two, a kind other than the outline's, and
 * overrides or enforcement outside the outline's resolved targets.
 */
export function draftsOf(input: {
  outlines: readonly Outline[]
  rules: readonly StructuredRule[]
  effectiveFrom: (outline: Outline) => string
}) {
  const problems: StructureProblem[] = []
  const problem = (key: RuleKey, code: string, message: string) => problems.push({ key, code, message })
  const own = new Set(input.outlines.map((outline) => outline.key))
  const byKey = new Map<RuleKey, StructuredRule[]>()
  for (const rule of input.rules) {
    if (!own.has(rule.key)) {
      problem(rule.key, "unknown-rule", `${rule.key} isn't an outline of this batch`)
    }
    byKey.set(rule.key, [...(byKey.get(rule.key) ?? []), rule])
  }
  const drafts = input.outlines.flatMap((outline) => {
    const found = byKey.get(outline.key) ?? []
    const [rule] = found
    if (!rule) {
      problem(outline.key, "missing-rule", `${outline.key} has no structure`)
      return []
    }
    if (found.length > 1) {
      problem(outline.key, "repeated-rule", `${outline.key} is structured twice`)
    }
    if (rule.kind !== kindName(outline)) {
      problem(outline.key, "kind-changed", `${outline.key} is a ${kindName(outline)}, not a ${rule.kind}`)
    }
    if (outline.resolved !== null) {
      const allowed = new Set([...outline.resolved.rules, ...outline.resolved.except])
      const named = [
        ...("overrides" in rule && Array.isArray(rule.overrides) ? rule.overrides : []),
        ...(rule.kind === "sanction" ? [...rule.enforces.rules, ...rule.enforces.except] : []),
        ...(rule.kind === "limit" ? rule.limits : [])
      ]
      for (const key of named.filter((item) => !allowed.has(item))) {
        problem(outline.key, "outside-outline", `${key} isn't one of the outline's targets`)
      }
    }
    return [{ outline, draft: draftOf(outline, rule, input.effectiveFrom(outline)) }]
  })
  return { drafts, problems }
}

/** Each draft checked by Zod: the parsed rule, or its issues. */
export function parseDrafts(drafts: readonly { outline: Outline; draft: Record<string, unknown> }[]) {
  return drafts.map(({ outline, draft }) => {
    const parsed = ruleDraft.safeParse(draft)
    return parsed.success
      ? { key: outline.key, rule: parsed.data, issues: [] }
      : { key: outline.key, rule: null, issues: parsed.error.issues }
  })
}

/** The flow of each core request type, for whether a rule needs a remedy. */
const flowOf = (requestType: TermKey) => createVocabulary([]).requestOf(requestType)?.flow ?? null

/** hoa-rule-structuring's variables for one batch; `problems` holds the failing rules on a retry. */
export function ruleStructuringVariables(input: {
  outlines: readonly Outline[]
  /** Outlines of other batches these override, enforce or except, or that cite the provisions shown (`relatedOutlines`). */
  related: readonly Outline[]
  vocabulary: readonly TermContent[]
  documents: readonly Pick<GoverningDocument, "key" | "kind" | "title" | "edition">[]
  /** Every provision, in document order. */
  provisions: readonly Provision[]
  settingsFlags: readonly { provisionKey: ProvisionKey; clause: string; summary: string }[]
  problems?: string
}): PromptVariables<typeof stepPrompts.ruleStructuring> {
  const cited = new Set([
    ...input.outlines.flatMap((outline) => [outline.provisionKey, ...outline.citations]),
    ...input.settingsFlags.map((flag) => flag.provisionKey)
  ])
  return {
    coreTerms: coreTermsText(),
    requestTypes: termLines(coreRequestTypes().filter((term) => term.kind === "thing")),
    vocabulary: none(termLines(input.vocabulary)),
    documents: input.documents.map(documentLine).join("\n"),
    provisions: input.provisions
      .filter((provision) => cited.has(provision.key))
      .map(provisionBlock)
      .join("\n\n"),
    outlines: input.outlines.map((outline) => structuringLine(outline, flowOf)).join("\n"),
    relatedRules: none(
      input.related
        .map((outline) =>
          [
            outline.key,
            kindName(outline),
            outline.requestTypes.join(", "),
            outline.appliesTo ?? "-",
            outline.summary
          ].join(" | ")
        )
        .join("\n")
    ),
    settingsFlags: none(
      input.settingsFlags.map((flag) => `${flag.provisionKey} | ${flag.clause} | ${flag.summary}`).join("\n")
    ),
    problems: input.problems ?? "none"
  }
}

/**
 * A rule (as a run stored it, valid or not) in F's answer format: the fields its outline doesn't fix, under its kind.
 * The retry shows a failing rule this way, as F would have returned it.
 */
export function structureOf(rule: Record<string, unknown>, kind: string) {
  const pick = (...names: string[]) =>
    Object.fromEntries(names.filter((name) => name in rule).map((name) => [name, rule[name]]))
  const head = { ...pick("key", "title", "statement", "appliesWhen"), kind }
  const noExceptions = rule.noExceptions
  const norm = {
    ...head,
    ...pick("beneficiary", "overrides"),
    noExceptions:
      typeof noExceptions === "object" && noExceptions !== null && "provisionKey" in noExceptions
        ? noExceptions.provisionKey
        : null
  }
  switch (kind) {
    case "obligation":
    case "recommendation":
    case "obligation-judged":
    case "recommendation-judged":
      return { ...norm, ...pick("check", "remedy", "cure", "recurs") }
    case "requirement":
      return { ...norm, ...pick("check", "recurs") }
    case "prohibition":
      return { ...norm, ...pick("remedy", "cure") }
    case "permission":
      return norm
    case "discretion":
      return { ...head, ...pick("overrides") }
    case "sanction":
      return { ...head, ...pick("enforces", "sanction") }
    default:
      return { ...head, ...pick("limits", "forbids", "maxAmount", "maxTotal") }
  }
}
