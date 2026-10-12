import { match } from "ts-pattern"
import { parseStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { validateRulebook, type Rulebook, type RulebookIssue } from "@/schema/validate"
import { createVocabulary } from "@/schema/vocabulary"
import type { RulebookRecords } from "./assemble"

// Reviewing a draft rulebook (encoding.md, Review and Publish): which records can be approved, the draft as validation
// sees it while it's reviewed, and answering questions. The rules UX and its server functions share these, so
// what a screen offers is what the server allows.

/** A record an administrator reviews: a rule, a term, the settings, or a provision's no-rule reason. */
export type RecordRef =
  | { type: "rule"; key: T.RuleKey }
  | { type: "term"; key: T.TermKey }
  | { type: "settings" }
  | { type: "provision"; key: T.ProvisionKey }

// Issues that inform but don't block approval (schema.md, Invariants, the issue table).
const advisoryCodes = new Set<T.IssueCode>([
  "avoided-label",
  "ambiguous-label",
  "text-condition",
  "absent-in-exception",
  "modality-cue-mismatch"
])

export const isBlocking = (code: T.IssueCode) => !advisoryCodes.has(code)

const isOpenBlocking = (issue: T.Issue) => issue.resolution === null && isBlocking(issue.code)
export const isLive = (record: { review: T.Review }) => record.review.status !== "rejected"

/**
 * Questions as a rules file holds them: naming only the rules the file has. An answered question's dropped candidates
 * leave the file, and the question keeps its options and its answer as the record of why.
 */
export function questionsIn(questions: T.Question[], ruleKeys: ReadonlySet<T.RuleKey>): T.Question[] {
  const kept = (keys: T.RuleKey[]) => keys.filter((key) => ruleKeys.has(key))
  return questions.map((question) => ({
    ...question,
    about: { ...question.about, rules: kept(question.about.rules) },
    options: question.options.map((option) => ({ ...option, keeps: kept(option.keeps) }))
  }))
}

/** The draft as validation sees it while it's reviewed: every record that isn't rejected. */
export function reviewedRulebook(records: RulebookRecords): Rulebook {
  const terms = records.terms.filter(isLive)
  const rules = records.rules.filter(isLive)
  return {
    organization: records.organization,
    documents: records.documents,
    provisions: records.provisions,
    terms: terms.filter((term) => term.organizationId !== null),
    proposedCore: terms.filter((term) => term.organizationId === null),
    rules,
    settings: records.settings,
    questions: questionsIn(records.questions, new Set(rules.map((rule) => rule.key)))
  }
}

/** Validator issues on the draft as it's reviewed, by record key (a rule's, a term's, a provision's, or "settings"). */
export function reviewIssues(records: RulebookRecords) {
  return Map.groupBy(validateRulebook(reviewedRulebook(records)), (issue) => issue.recordKey)
}

// The fields of a rule whose strings, or lists of strings, are term keys.
const termFields = new Set([
  "appliesTo",
  "bearer",
  "beneficiary",
  "decidedBy",
  "imposedBy",
  "requestTypes",
  "against",
  "suspends",
  "path",
  "unit",
  "term",
  "category",
  "document",
  "signedBy",
  "by",
  "evidence"
])
const bookkeeping = new Set(["provenance", "review", "issues"])

/** Every term a rule reads: its statement's links and every term key in its fields. */
export function termKeysOf(rule: T.Rule) {
  const keys = new Set<T.TermKey>()
  for (const part of parseStatement(rule.statement)) {
    if (part.type === "term") {
      keys.add(part.key)
    }
  }
  const visit = (value: unknown, field: string) => {
    if (typeof value === "string") {
      if (termFields.has(field)) {
        keys.add(value)
      }
    } else if (Array.isArray(value)) {
      // An aggregate's `value` lists the properties it reads; elsewhere `value` is a constant.
      for (const item of value) {
        visit(item, field === "value" ? "term" : field)
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (!bookkeeping.has(key)) {
          visit(item, key)
        }
      }
    }
  }
  visit(rule, "")
  return keys
}

/** Unanswered interpretation and conflict questions, by the candidate rules they decide. */
function openQuestionsByRule(questions: T.Question[]) {
  const byRule = new Map<T.RuleKey, T.Question>()
  for (const question of questions.filter((item) => item.answer === null)) {
    for (const key of question.options.flatMap((option) => option.keeps)) {
      byRule.set(key, question)
    }
  }
  return byRule
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What's needed to tell why records can't be approved yet; build it once for many records. */
export function approvalContext(records: RulebookRecords) {
  const issues = reviewIssues(records)
  const vocabulary = createVocabulary(records.terms)
  const termStatus = new Map(records.terms.map((term) => [term.key, term.review.status]))
  const openQuestions = openQuestionsByRule(records.questions)
  return { records, issues, vocabulary, termStatus, openQuestions }
}

export type ApprovalContext = ReturnType<typeof approvalContext>

function issueBlockers(stored: T.Issue[], live: RulebookIssue[] = []) {
  const open = stored.filter(isOpenBlocking)
  const found = live.filter((issue) => isBlocking(issue.code))
  return [
    ...(open.length > 0 ? [`${plural(open.length, "open issue needs", "open issues need")} resolving.`] : []),
    ...(found.length > 0
      ? [`${plural(found.length, "problem needs", "problems need")} fixing: ${found[0]?.message}.`]
      : [])
  ]
}

/** Why a record can't be approved yet; empty when it can. */
export function approvalBlockers(context: ApprovalContext, ref: RecordRef): string[] {
  const { records, issues } = context
  return match(ref)
    .with({ type: "rule" }, ({ key }) => {
      const rule = records.rules.find((item) => item.key === key)
      if (!rule) {
        return ["The rule no longer exists."]
      }
      const proposedTerms = [...termKeysOf(rule)].filter((term) => context.termStatus.get(term) === "proposed")
      return [
        ...issueBlockers(rule.issues, issues.get(rule.key)),
        ...(proposedTerms.length > 0
          ? [
              `It reads terms still to review: ${proposedTerms.map((term) => context.vocabulary.label(term)).join(", ")}.`
            ]
          : []),
        ...(context.openQuestions.has(rule.key)
          ? ["It's a candidate reading of an open question; answer the question instead."]
          : [])
      ]
    })
    .with({ type: "term" }, ({ key }) => {
      const term = records.terms.find((item) => item.key === key)
      return term ? issueBlockers(term.issues, issues.get(term.key)) : ["The term no longer exists."]
    })
    .with({ type: "settings" }, () => issueBlockers(records.settings.issues, issues.get("settings")))
    .with({ type: "provision" }, ({ key }) => {
      const provision = records.provisions.find((item) => item.key === key)
      return provision?.noRule ? issueBlockers([], issues.get(key)) : ["The provision has no reason to approve."]
    })
    .exhaustive()
}

const reviewed = (status: T.Review["status"], by: T.Id, at: T.Timestamp, note: string | null): T.Review => ({
  status,
  by,
  at,
  note
})

export type ReviewChanges = {
  rules: T.Rule[]
  terms: T.Term[]
  provisions: T.Provision[]
  settings: T.Settings | null
  /** Records left as they were, with why. */
  skipped: { ref: RecordRef; reasons: string[] }[]
}

/**
 * Sets the review of records. Approving checks each one's blockers; a record with blockers is skipped, not approved.
 * Rejecting and returning to proposed always apply, except that the settings can't be rejected: every rulebook has
 * them, so they're edited instead.
 */
export function reviewRecords(
  records: RulebookRecords,
  refs: RecordRef[],
  review: { status: T.Review["status"]; by: T.Id; at: T.Timestamp; note: string | null }
): ReviewChanges {
  const context = approvalContext(records)
  const changes: ReviewChanges = { rules: [], terms: [], provisions: [], settings: null, skipped: [] }
  const next = reviewed(review.status, review.by, review.at, review.note)
  for (const ref of refs) {
    const reasons = match(review.status)
      .with("approved", () => approvalBlockers(context, ref))
      .with("rejected", () => (ref.type === "settings" ? ["The settings can't be rejected; change them instead."] : []))
      .with("proposed", () => [])
      .exhaustive()
    if (reasons.length > 0) {
      changes.skipped.push({ ref, reasons })
      continue
    }
    match(ref)
      .with({ type: "rule" }, ({ key }) => {
        const rule = records.rules.find((item) => item.key === key)
        if (rule) {
          changes.rules.push({ ...rule, review: next })
        }
      })
      .with({ type: "term" }, ({ key }) => {
        const term = records.terms.find((item) => item.key === key)
        if (term) {
          changes.terms.push({ ...term, review: next })
        }
      })
      .with({ type: "settings" }, () => {
        changes.settings = { ...records.settings, review: next }
      })
      .with({ type: "provision" }, ({ key }) => {
        const provision = records.provisions.find((item) => item.key === key)
        if (provision?.noRule) {
          changes.provisions.push({ ...provision, noRule: { ...provision.noRule, review: next } })
        }
      })
      .exhaustive()
  }
  return changes
}

/**
 * Answers an interpretation or conflict question (schema.md, Settings and questions): the chosen option's rules are
 * approved where nothing else blocks them, the other candidates are rejected, and a conflict's open issues on the rules
 * it's about are resolved with the answer. Gives every rule that changed.
 */
export function answerQuestion(
  records: RulebookRecords,
  input: { questionId: T.Id; option: number; text: string | null; by: T.Id; at: T.Timestamp }
) {
  const question = records.questions.find((item) => item.id === input.questionId)
  const chosen = question?.options[input.option]
  if (!question || !chosen) {
    throw new Error("That question or option doesn't exist.")
  }
  const answered: T.Question = {
    ...question,
    answer: { option: input.option, text: input.text, by: input.by, at: input.at }
  }
  const resolution = { note: `Answered: ${chosen.label}`, by: input.by, at: input.at }
  const resolvesIssues = (rule: T.Rule) =>
    question.kind === "conflict" &&
    question.about.rules.includes(rule.key) &&
    rule.issues.some((issue) => issue.code === "conflict" && issue.resolution === null)
  const resolved = records.rules.filter(resolvesIssues).map((rule) => ({
    ...rule,
    issues: rule.issues.map((issue) =>
      issue.code === "conflict" && issue.resolution === null ? { ...issue, resolution } : issue
    )
  }))
  const withAnswer: RulebookRecords = {
    ...records,
    questions: records.questions.map((item) => (item.id === question.id ? answered : item)),
    rules: records.rules.map((rule) => resolved.find((item) => item.key === rule.key) ?? rule)
  }
  const kept = new Set(chosen.keeps)
  const dropped = [...new Set(question.options.flatMap((option) => option.keeps))].filter((key) => !kept.has(key))
  const review = { by: input.by, at: input.at, note: `Answered "${question.question}": ${chosen.label}` }
  const toRefs = (keys: Iterable<T.RuleKey>) => [...keys].map((key): RecordRef => ({ type: "rule", key }))
  const approvals = reviewRecords(withAnswer, toRefs(kept), { status: "approved", ...review })
  const rejections = reviewRecords(withAnswer, toRefs(dropped), { status: "rejected", ...review })
  const changed = new Map([...resolved, ...approvals.rules, ...rejections.rules].map((rule) => [rule.key, rule]))
  return { question: answered, rules: [...changed.values()], notApproved: approvals.skipped }
}

/** Resolves a stored issue with a note, so it no longer blocks approval. */
export function resolveIssue<R extends { issues: T.Issue[] }>(
  record: R,
  index: number,
  resolution: { note: string; by: T.Id; at: T.Timestamp }
): R {
  if (!record.issues[index]) {
    throw new Error("That issue doesn't exist.")
  }
  return {
    ...record,
    issues: record.issues.map((issue, i) => (i === index ? { ...issue, resolution } : issue))
  }
}
