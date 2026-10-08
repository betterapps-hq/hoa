import { z } from "zod"
import type { Job } from "@/jobs/job"
import type { Page } from "@/ocr/page"
import { checkRuleAgainstCatalog, citationIssues, matchQuote } from "@/pipeline/verify"
import { attributeLabel, documentLabel } from "@/rules/catalog"
import { checkSchema, conditionSchema, ruleSchema, type Rule } from "@/rules/rule"

// The rulebook editor's rules (docs/design/extraction.md, "8. Review" and "9. Publish"), as pure functions.

export const ruleChangesSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").optional(),
  statement: z.string().trim().min(1, "Enter the rule.").optional(),
  obligation: ruleSchema.shape.obligation.optional(),
  discretion: ruleSchema.shape.discretion.optional(),
  isCurable: z.boolean().optional(),
  check: checkSchema.optional(),
  appliesWhen: z.array(conditionSchema).optional()
})
export type RuleChanges = z.infer<typeof ruleChangesSchema>

/** The edit form's fields, all required. Citations aren't edited here: they're picked from documents. */
export const ruleEditSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  statement: z.string().trim().min(1, "Enter the rule."),
  obligation: ruleSchema.shape.obligation,
  discretion: ruleSchema.shape.discretion,
  isCurable: z.boolean(),
  check: checkSchema,
  appliesWhen: z.array(conditionSchema)
})

/** Issues that only the build produces; editing a rule keeps them. */
const buildIssueCodes = new Set<Rule["issues"][number]["code"]>(["conflict", "duplicate-key", "unresolved-reference"])

/** Issues about the citations themselves, recomputed whenever the citations change. */
const citationIssueCodes = new Set<Rule["issues"][number]["code"]>(["citation-not-found", "low-confidence"])

const backToPending = (rule: Rule): Rule["review"] => ({
  ...rule.review,
  status: "pending",
  isEdited: true,
  reviewedBy: null,
  reviewedAt: null
})

/**
 * Applies an administrator's edit and re-runs the catalog checks. Issues from the build (conflicts, duplicate keys)
 * and the citations' issues stay; the citations themselves never change here. The key never changes.
 */
export function applyRuleChanges(rule: Rule, changes: RuleChanges): Rule {
  const edited: Rule = { ...rule, ...changes }
  const catalogIssues: Rule["issues"] = checkRuleAgainstCatalog(edited).map((issue) => ({ ...issue, resolution: null }))
  return {
    ...edited,
    issues: [
      ...rule.issues.filter((issue) => buildIssueCodes.has(issue.code) || citationIssueCodes.has(issue.code)),
      ...catalogIssues
    ],
    review: backToPending(rule)
  }
}

export type PageSelection = { start: number; end: number }

/** A passage of a page's Markdown as plain text: no heading marks, emphasis, table pipes, tags or extra spaces. */
export function plainQuote(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The section a passage belongs to: the last heading above it on the page, else the section the page starts in. */
export function sectionAt(page: Page, offset: number, fallback: string) {
  const heading = page.headings.findLast((item) => item.offset <= offset)
  return heading?.text ?? page.sectionAtTop ?? fallback
}

/**
 * A citation of exactly the text an administrator selected on a page. The quote is copied from the stored page by its
 * character range, never typed, so a citation can't say something the document doesn't.
 */
export function citationFromSelection(page: Page, selection: PageSelection, documentTitle: string) {
  const raw = page.text.slice(selection.start, selection.end)
  const quote = plainQuote(raw)
  if (selection.start < 0 || selection.end > page.text.length || selection.start >= selection.end || !quote) {
    throw new Error("Select the passage to cite on the page.")
  }
  const start = selection.start + (raw.length - raw.trimStart().length)
  const end = selection.end - (raw.length - raw.trimEnd().length)
  return {
    documentId: page.documentId,
    section: sectionAt(page, start, documentTitle),
    pageIndex: page.pageIndex,
    pageLabel: page.pageLabel,
    quote,
    match: matchQuote(quote, page),
    range: { start, end }
  }
}

function withCitations(rule: Rule, citations: Rule["citations"]): Rule {
  return {
    ...rule,
    citations,
    issues: [...rule.issues.filter((issue) => !citationIssueCodes.has(issue.code)), ...citationIssues(citations)],
    review: backToPending(rule)
  }
}

/** Adds a citation picked from a document; the rule goes back to pending. */
export function addCitation(rule: Rule, citation: Rule["citations"][number]): Rule {
  const isDuplicate = rule.citations.some(
    (item) =>
      item.documentId === citation.documentId && item.pageIndex === citation.pageIndex && item.quote === citation.quote
  )
  if (isDuplicate) {
    throw new Error("The rule already cites that passage.")
  }
  return withCitations(rule, [...rule.citations, citation])
}

/** Replaces a citation with another passage picked from a document, such as a wider one; it keeps its position. */
export function replaceCitation(rule: Rule, index: number, citation: Rule["citations"][number]): Rule {
  if (!rule.citations[index]) {
    throw new Error("That citation doesn't exist.")
  }
  const isDuplicate = rule.citations.some(
    (item, position) =>
      position !== index &&
      item.documentId === citation.documentId &&
      item.pageIndex === citation.pageIndex &&
      item.quote === citation.quote
  )
  if (isDuplicate) {
    throw new Error("The rule already cites that passage.")
  }
  return withCitations(
    rule,
    rule.citations.map((item, position) => (position === index ? citation : item))
  )
}

/**
 * Removes a citation, even the last one: a rule without citations can't be saved, approved or published until one is
 * added. The rule goes back to pending.
 */
export function removeCitation(rule: Rule, index: number): Rule {
  if (!rule.citations[index]) {
    throw new Error("That citation doesn't exist.")
  }
  return withCitations(
    rule,
    rule.citations.filter((_, position) => position !== index)
  )
}
/** Why a rule can't be approved yet, or null when it can. */
export function approvalBlocker(rule: Rule): string | null {
  if (rule.citations.length === 0) {
    return "Add the passage this rule comes from before approving."
  }
  const unverified = rule.issues.find((issue) => issue.code === "citation-not-found" && !issue.resolution)
  return unverified ? "Replace the citation whose quote isn't on its page before approving." : null
}

/**
 * Pending rules with nothing for the administrator to look at: every quote was found and no issue is open. "Approve all
 * ready" approves these at once, leaving the rules with issues for one-by-one review.
 */
export function readyToApprove(rules: readonly Rule[]): Rule[] {
  return rules.filter(
    (rule) => rule.review.status === "pending" && rule.issues.every((issue) => issue.resolution !== null)
  )
}

export type IssueSeverity = "blocking" | "warning" | "note"

/**
 * How much an issue matters to the administrator. A missing quote or an open conflict blocks approval or publishing;
 * a scan read with low confidence is only a note to check the quote.
 */
export function issueSeverity(issue: Rule["issues"][number]): IssueSeverity {
  if (issue.code === "citation-not-found" || issue.code === "conflict") {
    return "blocking"
  }
  return issue.code === "low-confidence" ? "note" : "warning"
}

/** A rule the administrator still has to look at: pending, or kept with an open issue above a note. */
export function needsAttention(rule: Rule) {
  return (
    rule.review.status === "pending" ||
    (rule.review.status === "approved" &&
      rule.issues.some((issue) => !issue.resolution && issueSeverity(issue) !== "note"))
  )
}

/** Why a draft can't be published yet; empty when it can. */
export function publishBlockers(rules: readonly Rule[]): string[] {
  const pending = rules.filter((rule) => rule.review.status === "pending").length
  const conflicts = rules.filter(
    (rule) =>
      rule.review.status !== "rejected" && rule.issues.some((issue) => issue.code === "conflict" && !issue.resolution)
  ).length
  const uncited = rules.filter((rule) => rule.review.status !== "rejected" && rule.citations.length === 0).length
  return [
    ...(pending > 0 ? [`${pending} ${pending === 1 ? "rule is" : "rules are"} still pending.`] : []),
    ...(uncited > 0 ? [`${uncited} ${uncited === 1 ? "rule has" : "rules have"} no citation.`] : []),
    ...(conflicts > 0 ? [`${conflicts} ${conflicts === 1 ? "rule has" : "rules have"} an unresolved conflict.`] : [])
  ]
}

/** Plain-language summary of a check, for the editor. */
export function describeCheck(check: Rule["check"]): string {
  const list = (values: readonly { value: string }[]) => values.map((value) => value.value).join(", ")
  switch (check.type) {
    case "allowed-values":
      return `${attributeLabel(check.attribute)} is one of ${list(check.values)}${check.otherwise === "committee" ? "; others go to the committee" : ""}`
    case "allowed-values-by":
      return `${attributeLabel(check.attribute)} depends on ${attributeLabel(check.keyAttribute)}: ${check.table.map((row) => `${row.key.value} to ${list(row.values)}`).join("; ")}`
    case "prohibited-values":
      return `${attributeLabel(check.attribute)} isn't ${list(check.values)}`
    case "range": {
      const subject = check.attributes.map(attributeLabel).join(" plus ")
      if (check.min !== null && check.max !== null) {
        return `${subject} between ${check.min} and ${check.max}`
      }
      if (check.min === null && check.max === null) {
        return `${subject} has no limit given`
      }
      return check.min !== null ? `${subject} at least ${check.min}` : `${subject} at most ${check.max}`
    }
    case "matches":
      return `${attributeLabel(check.attribute)} matches ${attributeLabel(check.otherAttribute)}`
    case "required-fact":
      return `${attributeLabel(check.attribute)} is given`
    case "required-document":
      return `Includes the ${documentLabel(check.document).toLowerCase()}${check.mustState.length > 0 ? `, stating ${check.mustState.join("; ")}` : ""}`
    case "qualitative":
      return check.criterion
    case "informational":
      return "For information; not checked"
  }
}

/** Plain-language summary of a rule's conditions. */
export function describeConditions(conditions: Rule["appliesWhen"]): string | null {
  if (conditions.length === 0) {
    return null
  }
  return conditions
    .map((condition) => {
      if (condition.type === "text") {
        return condition.description
      }
      const value = Array.isArray(condition.value) ? condition.value.join(" or ") : String(condition.value)
      switch (condition.operator) {
        case "exists":
          return `${attributeLabel(condition.attribute)} is given`
        case "not-in":
          return `${attributeLabel(condition.attribute)} isn't ${value}`
        default:
          return `${attributeLabel(condition.attribute)} is ${value}`
      }
    })
    .join(", and ")
}

/** Why the latest build failed, or which items it skipped; null when it went cleanly. */
export function describeBuildProblem(job: Job | null) {
  if (job?.status === "failed") {
    return job.error?.message ?? "The build failed."
  }
  const [first] = job?.failures ?? []
  if (job?.status === "completed-with-errors" && first) {
    return `${job.failures.length === 1 ? "1 item" : `${job.failures.length} items`} failed (${first.stage}): ${first.message}`
  }
  return null
}
