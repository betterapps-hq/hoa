import { z } from "zod"
import type { ApplicationFile } from "@/applications/application"
import type { Page } from "@/ocr/page"
import {
  componentSchema,
  conditionAnswerSchema,
  documentStatusSchema,
  evidenceSchema,
  factSchema,
  type ActionItem,
  type Component,
  type Fact,
  type Finding,
  type Review
} from "@/review/reviewModel"
import { applicationFileKinds, projectTypes, type ApplicationFileKind, type ProjectTypeId } from "@/rules/catalog"
import type { AllowedValue, Rule } from "@/rules/rule"
import type { Decision } from "./decide"

// What the review's model stages receive and return (docs/design/review.md, "Prompts and models"), as pure functions.

export const classificationSchema = z.object({ kind: z.enum(applicationFileKinds) })

export const factsOutputSchema = z.object({
  components: z.array(componentSchema),
  facts: z.array(factSchema),
  conditions: z.array(conditionAnswerSchema)
})

export const documentsOutputSchema = z.object({ documents: z.array(documentStatusSchema) })

export const qualitativeOutputSchema = z.object({
  status: z.enum(["met", "not-met", "unclear"]),
  explanation: z.string(),
  evidence: z.array(evidenceSchema)
})

export const writerOutputSchema = z.object({
  assessment: z.string(),
  feedback: z.string(),
  items: z.array(z.object({ id: z.string(), text: z.string() }))
})

/** A visual description as the OCR steps store it. */
export type VisualNote = {
  figureId: string
  pageIndex: number
  description: string
  measurements: { label: string; value: string }[]
}

/** One file's pages as the review reads them. */
export type FilePages = {
  file: Pick<ApplicationFile, "id" | "fileName" | "mediaType" | "contextText" | "status">
  pages: readonly Page[]
  visuals: readonly VisualNote[]
  /** Page kinds from classification, by page index. */
  kinds?: ReadonlyMap<number, ApplicationFileKind>
}

export function fileMarker(fileId: string, fileName: string, pageIndex: number, kind?: ApplicationFileKind) {
  return `<<file ${fileId} "${fileName}" | page ${pageIndex}${kind ? ` | ${kind}` : ""}>>`
}

/** Every readable page with a marker the models cite as evidence, its pictures' descriptions and context text. */
export function pagesForPrompt(files: readonly FilePages[]) {
  return files
    .flatMap(({ file, pages, visuals, kinds }) => {
      if (file.status === "unreadable") {
        return [`${fileMarker(file.id, file.fileName, 1)}\n[This file couldn't be read.]`]
      }
      return pages.map((page) => {
        const notes = visuals
          .filter((visual) => visual.pageIndex === page.pageIndex)
          .map((visual) => {
            const measurements = visual.measurements.map((item) => `${item.label}: ${item.value}`).join("; ")
            return `[image ${visual.figureId}] ${visual.description}${measurements ? ` Measurements: ${measurements}.` : ""}`
          })
        return [
          fileMarker(file.id, file.fileName, page.pageIndex, kinds?.get(page.pageIndex)),
          ...(file.contextText ? [`Text near this picture in its Word file: ${file.contextText}`] : []),
          page.text.trim() || "[no text]",
          ...notes
        ].join("\n")
      })
    })
    .join("\n\n")
}

/** Checkbox states on every page, for the document check. */
export function checkboxesForPrompt(files: readonly FilePages[]) {
  const lines = files.flatMap(({ file, pages }) =>
    pages.flatMap((page) =>
      page.checkboxes.map(
        (checkbox) => `${fileMarker(file.id, file.fileName, page.pageIndex)} ${checkbox.label}: ${checkbox.state}`
      )
    )
  )
  return lines.length > 0 ? lines.join("\n") : "none"
}

function addValues(target: Map<string, Map<string, AllowedValue>>, attribute: string, values: readonly AllowedValue[]) {
  const known = target.get(attribute) ?? new Map<string, AllowedValue>()
  for (const value of values) {
    const existing = known.get(value.value.toLowerCase())
    known.set(value.value.toLowerCase(), {
      value: value.value,
      aliases: [...new Set([...(existing?.aliases ?? []), ...value.aliases])]
    })
  }
  target.set(attribute, known)
}

/** The rulebook's listed values per attribute, so the facts model can map what the homeowner wrote onto them. */
export function allowedValuesForPrompt(rules: readonly Rule[]) {
  const byAttribute = new Map<string, Map<string, AllowedValue>>()
  for (const rule of rules) {
    const check = rule.check
    if (check.type === "allowed-values" || check.type === "prohibited-values") {
      addValues(byAttribute, check.attribute, check.values)
    } else if (check.type === "allowed-values-by") {
      addValues(
        byAttribute,
        check.keyAttribute,
        check.table.map((row) => row.key)
      )
      addValues(
        byAttribute,
        check.attribute,
        check.table.flatMap((row) => row.values)
      )
    }
  }
  return JSON.stringify(
    Object.fromEntries([...byAttribute].map(([attribute, values]) => [attribute, [...values.values()]]))
  )
}

/** The rulebook's text conditions, which the facts model answers once per applicable component. */
export function textConditionsForPrompt(rules: readonly Rule[]) {
  const conditions = rules.flatMap((rule) =>
    rule.appliesWhen.flatMap((condition) =>
      condition.type === "text"
        ? [{ id: condition.id, appliesTo: rule.appliesTo, description: condition.description }]
        : []
    )
  )
  return conditions.length > 0 ? JSON.stringify(conditions) : "none"
}

/** Each required document with what satisfies it, and the components it's checked for. */
export function requirementsForPrompt(
  projectType: ProjectTypeId,
  rules: readonly Rule[],
  components: readonly Component[]
) {
  const definitions = new Map(projectTypes[projectType].documents.map((document) => [document.id, document]))
  return JSON.stringify(
    rules.flatMap((rule) => {
      const check = rule.check
      if (check.type !== "required-document") {
        return []
      }
      const definition = definitions.get(check.document)
      const componentIds =
        rule.appliesTo === "project"
          ? [null]
          : components.filter((component) => component.kind === rule.appliesTo).map((component) => component.id)
      return componentIds.map((componentId) => ({
        requirement: check.document,
        label: definition?.label,
        satisfiedBy: definition?.satisfiedBy,
        signedBy: definition?.signedBy ?? null,
        mustState: check.mustState,
        componentId,
        rule: rule.statement
      }))
    })
  )
}

/** Owners of record as the facts recorded them, for the signature checks. */
export function ownersOfRecord(facts: readonly Fact[]) {
  const fact = facts.find((item) => item.attribute === "project.ownersOfRecord")
  if (!fact || fact.status === "not-provided" || fact.status === "none") {
    return "not given"
  }
  return fact.rawValue ?? String(fact.value)
}

/** A file's kind: the kind every page shares, otherwise null. */
export function fileKindOf(kinds: readonly ApplicationFileKind[]): ApplicationFileKind | null {
  const [first] = kinds
  return first && kinds.every((kind) => kind === first) ? first : null
}

/** Findings with their rules and citations, for the writer. Not-applicable findings are left out. */
export function findingsForWriter(findings: readonly Finding[], rules: readonly Rule[]) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  return JSON.stringify(
    findings
      .filter((finding) => finding.status !== "not-applicable")
      .map((finding) => {
        const rule = byId.get(finding.ruleId)
        return {
          status: finding.status,
          component: finding.componentId,
          rule: rule?.title,
          statement: rule?.statement,
          sections: rule?.citations.map((citation) => citation.section),
          explanation: finding.explanation,
          documentProblems: finding.documentProblems
        }
      })
  )
}

export function informationalRulesForPrompt(rules: readonly Rule[]) {
  const informational = rules.filter((rule) => rule.check.type === "informational")
  return informational.length > 0
    ? informational.map((rule) => `${rule.citations[0]?.section ?? rule.title}: ${rule.statement}`).join("\n")
    : "none"
}

export function actionItemsForPrompt(decision: Decision) {
  return JSON.stringify({
    changes: decision.changes,
    missingInformation: decision.missingInformation,
    committeeDecisions: decision.committeeDecisions
  })
}

/** Replaces each action item's text with the writer's phrasing; items the writer skipped keep the code's text. */
export function phraseItems(items: readonly ActionItem[], phrased: readonly { id: string; text: string }[]) {
  const byId = new Map(phrased.map((item) => [item.id, item.text]))
  return items.map((item) => ({ ...item, text: byId.get(item.id)?.trim() || item.text }))
}

/** Whether submitting means going ahead with open requests, which the homeowner must confirm. */
export function hasOpenRequests(review: Pick<Review, "recommendation" | "missingInformation">) {
  return review.recommendation === "request-information" || review.missingInformation.length > 0
}
