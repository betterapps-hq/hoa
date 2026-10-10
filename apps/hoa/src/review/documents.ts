import { z } from "zod"
import type { DocumentReview } from "@/engine/context"
import type { EngineVocabulary } from "@/engine/vocabulary"
import { normalizeForMatching } from "@/ocr/page"
import { answersFileId } from "@/projectTypes/answers"
import { formDocumentKinds, type FormDocumentKind } from "@/schema/coreTerms"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { similarity } from "@/text/match"
import { labelsOf, meaningOf } from "./documentTypes"
import { modelEvidence, toEvidence } from "./factSchema"
import type { DocumentResult } from "./reviewModel"

// Documents (application-review.md, Documents): every document check among the selected rules, per subject when the
// check is; the document reader's answer becomes the request's documents (present, by type, with their signers) and
// the statements the engine reads per rule and subject. A document the portal's application form provides (its answers,
// the description) is present when the application has it, without asking the reader.

export type Requirement = {
  id: string
  ruleKey: T.RuleKey
  rule: string
  documentType: T.TermKey
  documentLabels: string[]
  definition: string | null
  mustState: string[]
  signedBy: string[]
  /** The entity it's checked for: the request, or one subject. */
  entity: string
  isPerSubject: boolean
  /** The application form's own document it asks for, when the form meets it; null when it's uploaded. */
  formKind: FormDocumentKind | null
}

type DocumentCheck = Extract<T.Check, { type: "document" }>

/**
 * The application form's own document a check asks for, when the form meets it: the check's document is one the form
 * provides, or the organization's refinement of one (the same key, or a category of it), and it needs no signature,
 * which the form doesn't collect. Null when the homeowner uploads it.
 */
export function formKindOf(check: DocumentCheck, vocabulary: EngineVocabulary): FormDocumentKind | null {
  if (check.signedBy.length > 0) {
    return null
  }
  return formDocumentKinds.find((kind) => vocabulary.isKindOf(check.document, kind)) ?? null
}

type Entity = T.EvaluationRequest["entities"][number]

/** Every selected document check, once per entity of its subject type. */
export function documentRequirements(
  rules: readonly T.Rule[],
  entities: readonly Entity[],
  vocabulary: EngineVocabulary
): Requirement[] {
  const label = (key: T.TermKey, plural: boolean) => vocabulary.label(key, plural)
  return rules
    .flatMap((rule) => {
      if (rule.kind !== "norm" || rule.check?.type !== "document" || !rule.appliesTo) {
        return []
      }
      const { check } = rule
      const subject = vocabulary.thingOf(rule.appliesTo)
      return entities
        .filter((entity) => vocabulary.isKindOf(entity.type, subject))
        .map((entity) => ({
          ruleKey: rule.key,
          rule: renderStatement(rule.statement, label),
          documentType: check.document,
          documentLabels: labelsOf(vocabulary, check.document),
          definition: meaningOf(vocabulary, check.document),
          mustState: check.mustState,
          signedBy: check.signedBy.map((party) => vocabulary.label(party)),
          entity: entity.id,
          isPerSubject: check.per === "subject",
          formKind: formKindOf(check, vocabulary)
        }))
    })
    .map((requirement, index) => ({ id: `d${index + 1}`, ...requirement }))
}

/** hoa-document-review's answer for these requirements. */
export function documentsAnswerSchema(requirements: readonly Requirement[]) {
  const ids = requirements.map((requirement) => requirement.id)
  const [first, ...rest] = ids
  return z.object({
    documents: z.array(
      z.object({
        requirement: first === undefined ? z.string() : z.enum([first, ...rest]),
        present: z.boolean(),
        statements: z.array(
          z.object({
            statement: z.string().describe("The statement exactly as the requirement lists it."),
            status: z
              .enum(["confirmed", "contradicted", "not-applicable", "not-found"])
              .describe(
                "not-applicable only for a statement the requirement qualifies (as applicable, if any) when the project has nothing it covers."
              ),
            quote: z.string().nullable()
          })
        ),
        signers: z
          .array(z.string())
          .describe("The ids of the listed parties who signed it, such as owner-1; a role for a signer not listed."),
        evidence: z.array(modelEvidence)
      })
    )
  })
}
export type DocumentsAnswer = z.infer<ReturnType<typeof documentsAnswerSchema>>

/** The listed statement a reported one is, matched loosely: OCR and the model may reword punctuation. */
function statementOf(reported: string, mustState: readonly string[]) {
  const normalized = normalizeForMatching(reported)
  const exact = mustState.find((statement) => normalizeForMatching(statement) === normalized)
  if (exact) {
    return exact
  }
  const scored = mustState
    .map((statement) => ({ statement, score: similarity(reported, statement) }))
    .toSorted((a, b) => b.score - a.score)
  return scored[0] && scored[0].score >= 0.85 ? scored[0].statement : null
}

export function documentResults(
  requirements: readonly Requirement[],
  answer: DocumentsAnswer,
  partyIds: ReadonlySet<string>
): DocumentResult[] {
  return requirements.map((requirement) => {
    const found = answer.documents.find((document) => document.requirement === requirement.id)
    const statements = requirement.mustState.map((statement) => {
      const reported = found?.statements.find(
        (item) => statementOf(item.statement, requirement.mustState) === statement
      )
      // A qualified statement that doesn't apply to the project holds, as one the document confirms does.
      const confirmed =
        reported && reported.status !== "not-found"
          ? reported.status === "confirmed" || reported.status === "not-applicable"
          : null
      return { statement, confirmed, quote: reported?.quote ?? null }
    })
    return {
      ruleKey: requirement.ruleKey,
      entity: requirement.entity,
      documentType: requirement.documentType,
      present: found?.present ?? false,
      statements: found?.present ? statements : statements.map((item) => ({ ...item, confirmed: null })),
      signedBy: found?.present ? [...new Set(found.signers.filter((signer) => partyIds.has(signer)))] : [],
      evidence: found?.evidence.map(toEvidence) ?? []
    }
  })
}

/** What the application form gave: whether it has the form's answers (the answers page), and the description. */
export type FormContent = { hasAnswers: boolean; description: string | null }

/** Whether the application form gave the document a requirement asks for. */
export function isGivenByForm(requirement: Requirement, form: FormContent) {
  switch (requirement.formKind) {
    case "application-form":
      return form.hasAnswers
    case "project-description":
      return Boolean(form.description?.trim())
    default:
      return false
  }
}

/**
 * The results with every requirement the form gives present: the form's answers page is its evidence, and the
 * statements it must show are still the reader's. Others are the reader's results as they are.
 */
export function withFormDocuments(
  requirements: readonly Requirement[],
  results: readonly DocumentResult[],
  form: FormContent
): DocumentResult[] {
  return requirements.flatMap((requirement) => {
    const read = results.find(
      (result) => result.ruleKey === requirement.ruleKey && result.entity === requirement.entity
    )
    if (!isGivenByForm(requirement, form)) {
      return read ? [read] : []
    }
    const evidence =
      requirement.formKind === "application-form" ? [{ fileId: answersFileId, page: 1, quote: null, region: null }] : []
    return [
      {
        ruleKey: requirement.ruleKey,
        entity: requirement.entity,
        documentType: requirement.documentType,
        present: true,
        statements:
          read?.statements ?? requirement.mustState.map((statement) => ({ statement, confirmed: null, quote: null })),
        signedBy: [],
        evidence: read?.evidence.length ? read.evidence : evidence
      }
    ]
  })
}

/** The request's documents and the statements the engine reads, from the document reader's results. */
export function documentAnswers(results: readonly DocumentResult[]) {
  const documents: T.EvaluationRequest["documents"] = results
    .filter((result) => result.present)
    .map((result, index) => ({
      id: result.evidence[0]?.fileId ?? `document-${index + 1}`,
      type: result.documentType,
      subjects: [result.entity],
      signedBy: result.signedBy
    }))
  const reviews: DocumentReview[] = results.map((result) => ({
    ruleKey: result.ruleKey,
    entity: result.entity,
    statements: result.statements
  }))
  return { documents, reviews }
}
