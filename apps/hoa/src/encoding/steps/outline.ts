import { compareCodeUnits } from "@/rulebook/canonical"
import { renderStatement } from "@/schema/statement"
import type { Domain, Provision, ProvisionKey, RuleKey, RuleSelection, TermKey } from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { RuleContent } from "@/schema/zod"

// A rule outline (step E's answer, per rule): what F may not change. Outlines come from E, from a golden rule (golden
// mode measures F alone), or from a recorded rule with problems (F's retry keeps everything but the problem). Overrides and
// enforcement are given as targets (full keys, provisions, documents) and resolved to rule keys by code once every
// section's outlines are known.

export type Read = { about: string; fact: string }

export type CheckType = "test" | "table" | "document" | "deadline" | "approval" | "judgment"

/** What E names: rules in its own answer by full key, rules elsewhere by provision, or whole documents. */
export type OutlineTargets = { rules: RuleKey[]; provisions: ProvisionKey[]; documents: string[] }

/** Targets as rule keys: the rules and documents a rule overrides, enforces or limits, and a sanction's exceptions. */
export type ResolvedTargets = { rules: RuleKey[]; documents: string[]; except: RuleKey[] }

type Selector = Exclude<RuleSelection, RuleKey[]>

export type Outline = {
  key: RuleKey
  /** The provision the rule's key starts with: its main citation. */
  provisionKey: ProvisionKey
  unitId: string
  summary: string
  domain: Domain
  /** The other provisions the rule depends on. */
  citations: ProvisionKey[]
  interpretation: boolean
  /** The facts the rule tests, in plain words (E): what each is about and the fact. */
  reads: Read[]
  /** The term keys its reads mapped to once the vocabulary is frozen (code, for F). */
  readKeys: TermKey[]
  kind: RuleContent["kind"]
  /** A norm's or a sanction's modality. */
  modality: string | null
  bearer: TermKey | null
  appliesTo: TermKey | null
  requestTypes: TermKey[]
  check: CheckType | null
  decidedBy: TermKey | null
  /** What a permission or discretion overrides, a sanction enforces or a limit limits, as E names it. */
  targets: OutlineTargets | null
  except: OutlineTargets | null
  sanction: { type: string; imposedBy: TermKey; against: TermKey[] } | null
  resolved: ResolvedTargets | null
  /** A selector the outline keeps as it is (a golden or recorded rule's). */
  selector: Selector | null
}

const mainCitation = (rule: Pick<RuleContent, "citations">) => rule.citations[0]?.provisionKey ?? ""

/** The outline of an encoded rule: everything but its structure, its targets already keys. */
export function outlineOfRule(rule: RuleContent, unitId: string, summary: string): Outline {
  const base = {
    key: rule.key,
    provisionKey: mainCitation(rule),
    unitId,
    summary,
    domain: rule.domain,
    citations: rule.citations.slice(1).map((citation) => citation.provisionKey),
    interpretation: false,
    reads: [],
    readKeys: [],
    kind: rule.kind,
    appliesTo: rule.appliesTo,
    requestTypes: rule.requestTypes,
    targets: null,
    except: null
  }
  const listOrSelector = (selection: RuleSelection) =>
    Array.isArray(selection)
      ? { resolved: { rules: selection, documents: [], except: [] }, selector: null }
      : { resolved: null, selector: selection }
  switch (rule.kind) {
    case "norm":
      return {
        ...base,
        modality: rule.modality,
        bearer: rule.bearer,
        check: rule.check?.type ?? null,
        decidedBy: rule.decidedBy,
        sanction: null,
        ...listOrSelector(rule.overrides)
      }
    case "discretion":
      return {
        ...base,
        modality: null,
        bearer: null,
        check: null,
        decidedBy: rule.decidedBy,
        sanction: null,
        ...listOrSelector(rule.overrides)
      }
    case "sanction":
      return {
        ...base,
        modality: rule.modality,
        bearer: null,
        check: null,
        decidedBy: null,
        sanction: { type: rule.sanction.type, imposedBy: rule.imposedBy, against: rule.against },
        resolved: { rules: rule.enforces.rules, documents: rule.enforces.documents, except: rule.enforces.except },
        selector: null
      }
    case "limit":
      return {
        ...base,
        modality: null,
        bearer: null,
        check: null,
        decidedBy: null,
        sanction: null,
        resolved: { rules: rule.limits, documents: [], except: [] },
        selector: null
      }
  }
}

/** A rule's statement in words, as a golden outline's summary. */
export const statementSummary = (rule: RuleContent, vocabulary: Pick<Vocabulary, "label">) =>
  renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural))

/** Whether a provision is `ancestor` or under it. */
export function provisionTree(provisions: readonly Pick<Provision, "key" | "parentLabel">[]) {
  const byKey = new Map(provisions.map((provision) => [provision.key, provision]))
  const parentOf = (key: ProvisionKey) => {
    const provision = byKey.get(key)
    const documentKey = key.slice(0, Math.max(0, key.indexOf(":")))
    return provision?.parentLabel ? `${documentKey}:${provision.parentLabel}` : null
  }
  return (key: ProvisionKey, ancestor: ProvisionKey) => {
    const seen = new Set<string>()
    for (let current: string | null = key; current !== null && !seen.has(current); current = parentOf(current)) {
      if (current === ancestor) {
        return true
      }
      seen.add(current)
    }
    return false
  }
}

/** A target that resolved to no rule: it goes to consolidation's cross-references, never to an empty list. */
export type UnresolvedTarget = { key: RuleKey; target: string }

const isEnforceable = (target: Outline, sanction: Outline) =>
  target.kind === "norm" &&
  (target.modality === "obligation" || target.modality === "prohibition") &&
  target.requestTypes.some((type) => sanction.requestTypes.includes(type))

/**
 * Resolves every outline's targets to rule keys (the decisions' step 4): a full key names that rule; a provision
 * names every rule whose main citation is it or under it; documents stay. A sanction keeps only the obligations and
 * prohibitions that run in its request type. What resolves to nothing is listed for consolidation.
 */
export function resolveOutlines(
  outlines: readonly Outline[],
  provisions: readonly Pick<Provision, "key" | "parentLabel">[]
) {
  const isUnder = provisionTree(provisions)
  const byKey = new Map(outlines.map((outline) => [outline.key, outline]))
  const unresolved: UnresolvedTarget[] = []
  const resolve = (from: Outline, targets: OutlineTargets | null) => {
    if (targets === null) {
      return []
    }
    const keys: RuleKey[] = []
    for (const key of targets.rules) {
      if (byKey.has(key)) {
        keys.push(key)
      } else {
        unresolved.push({ key: from.key, target: key })
      }
    }
    for (const provision of targets.provisions) {
      const under = outlines.filter((outline) => isUnder(outline.provisionKey, provision) && outline.key !== from.key)
      if (under.length === 0) {
        unresolved.push({ key: from.key, target: provision })
      }
      keys.push(...under.map((outline) => outline.key))
    }
    return [...new Set(keys)].toSorted(compareCodeUnits)
  }
  const resolved = outlines.map((outline): Outline => {
    if (outline.targets === null) {
      return outline
    }
    let rules = resolve(outline, outline.targets)
    let except = resolve(outline, outline.except)
    if (outline.kind === "sanction") {
      const enforceable = (key: RuleKey) => {
        const target = byKey.get(key)
        return target !== undefined && isEnforceable(target, outline)
      }
      rules = rules.filter(enforceable)
      except = except.filter(enforceable)
    }
    return { ...outline, resolved: { rules, documents: outline.targets.documents, except } }
  })
  return { outlines: resolved, unresolved }
}

/** An outline's kind as the drafts name it: a norm's modality, with "-judged" for a judged rule. */
export function kindName(outline: Pick<Outline, "kind" | "modality" | "check">) {
  if (outline.kind !== "norm") {
    return outline.kind
  }
  const modality = outline.modality ?? "obligation"
  return outline.check === "judgment" && (modality === "obligation" || modality === "recommendation")
    ? `${modality}-judged`
    : modality
}

const applicants = new Set(["owner", "applicant"])

/** Whether a rule needs a remedy: it runs in an application request type and binds the owner or applicant. */
export function remedyRequired(outline: Outline, flowOf: (requestType: TermKey) => string | null) {
  return (
    outline.kind === "norm" &&
    outline.modality !== "permission" &&
    outline.modality !== "requirement" &&
    applicants.has(outline.bearer ?? "") &&
    outline.requestTypes.some((type) => flowOf(type) === "application")
  )
}

/** What an outline overrides, enforces or limits, resolved to keys. */
export function targetsText(outline: Outline) {
  if (outline.selector) {
    const { documents, provisions } = outline.selector
    return `a selector of ${[...documents.map((key) => `document ${key}`), ...provisions].join(", ") || "everything"}`
  }
  const resolved = outline.resolved
  return resolved
    ? [
        ...resolved.rules,
        ...resolved.documents.map((key) => `document ${key}`),
        ...resolved.except.map((key) => `except ${key}`)
      ].join(", ")
    : ""
}

/** The kind with who decides a judged or discretionary rule, and who imposes a sanction on whom. */
function kindText(outline: Outline) {
  const decider = outline.decidedBy ? `, decided by ${outline.decidedBy}` : ""
  const sanction = outline.sanction
    ? ` ${outline.modality ?? ""}, ${outline.sanction.type} imposed by ${outline.sanction.imposedBy} on ${outline.sanction.against.join(", ")}`
    : ""
  return `${kindName(outline)}${decider}${sanction}`
}

/**
 * One outline as C reads it: key | kind | bearer | subject | request types | summary | reads: about: fact; ... A
 * permission's, discretion's, sanction's or limit's resolved targets follow.
 */
export function vocabularyLine(outline: Outline) {
  const reads = outline.reads.map((read) => `${read.about}: ${read.fact}`).join("; ")
  const targets = targetsText(outline)
  return [
    outline.key,
    kindText(outline),
    outline.bearer ?? "-",
    outline.appliesTo ?? "-",
    outline.requestTypes.join(", "),
    outline.summary,
    `reads: ${reads || "none"}`,
    ...(targets ? [`targets: ${targets}`] : [])
  ].join(" | ")
}

/**
 * One outline as F reads it: key | kind | bearer | subject | request types | remedy required or no remedy | targets
 * resolved to keys | summary | terms: the keys its reads mapped to.
 */
export function structuringLine(outline: Outline, flowOf: (requestType: TermKey) => string | null) {
  return [
    outline.key,
    kindText(outline),
    outline.bearer ?? "-",
    outline.appliesTo ?? "-",
    outline.requestTypes.join(", "),
    remedyRequired(outline, flowOf) ? "remedy required" : "no remedy",
    targetsText(outline) || "-",
    outline.summary,
    `terms: ${outline.readKeys.join(", ") || "none"}`
  ].join(" | ")
}
