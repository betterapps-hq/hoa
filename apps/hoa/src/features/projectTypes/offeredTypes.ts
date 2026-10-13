import { applicationRequestType } from "@/applications/application"
import { bindDefinition } from "@/projectTypes/bind"
import { buildDefinition, propertyRules } from "@/projectTypes/build"
import { allQuestions } from "@/projectTypes/definition"
import type { ProjectType, ProjectTypeDefinition } from "@/projectTypes/projectType"
import type * as T from "@/schema/types"
import type { CitedProvision } from "../rulebook/citedProvision"
import { citationIndex, citedProvision } from "../rulebook/rulebookRecords"

// A project type as homeowners fill in its form (application-review.md, Project types): its questions bound again to
// the published rulebook, with why each one is asked.

/** Why a form asks its questions: the passages they cite, and the titles of the rules that read each property. */
export type QuestionReasons = {
  citations: Record<string, CitedProvision>
  /** Rule titles by property. */
  rules: Record<string, string[]>
}

/** A project type as homeowners choose it, with why its questions are asked. */
export type OfferedProjectType = ProjectType & { reasons: QuestionReasons }

/** The published rulebook a form is read against: its id and rules file. */
export type PublishedRules = { id: string; rulesFile: T.RulesFile }

/** Every provision key a definition's questions cite, asked or kept aside. */
export const citedKeys = (definition: ProjectTypeDefinition) =>
  new Set([
    ...allQuestions(definition).flatMap((item) => item.field.citations ?? []),
    ...definition.documents.flatMap((document) => document.citations)
  ])

/** The cited passages that exist in the rulebook's documents, as screens show them. */
export function citationsOf(rulesFile: T.RulesFile, keys: Iterable<string>): Record<string, CitedProvision> {
  const index = citationIndex(rulesFile)
  return Object.fromEntries(
    [...keys]
      .filter((key) => index.provisions.has(key))
      .map((key) => [key, citedProvision(index, { provisionKey: key, highlight: null, region: null })])
  )
}

/**
 * A type as its form reads now: bound again to the rules it was built against, so the questions carry what code
 * derives from the vocabulary (units, code's wording for a bare label). A type built against an earlier rulebook stays
 * as stored until the administrator updates it.
 */
export function currentType(type: ProjectType, published: PublishedRules | null, asOf: string): ProjectType {
  if (!published || type.rulebookId !== published.id) {
    return type
  }
  const built = buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, asOf)
  return { ...type, definition: bindDefinition(type.definition, built) }
}

function reasonsOf(rulesFile: T.RulesFile, type: ProjectType, asOf: string): QuestionReasons {
  const titles = new Map(rulesFile.rules.map((rule) => [rule.key, rule.title]))
  const byProperty = propertyRules(rulesFile, applicationRequestType, type.definition.subjects, asOf)
  return {
    citations: citationsOf(rulesFile, citedKeys(type.definition)),
    rules: Object.fromEntries(
      Object.entries(byProperty).map(([property, keys]) => [property, keys.flatMap((key) => titles.get(key) ?? [])])
    )
  }
}

/** A type as homeowners fill it in: its current form, and why each question is asked. */
export function offerType(type: ProjectType, published: PublishedRules | null, asOf: string): OfferedProjectType {
  const current = currentType(type, published, asOf)
  return {
    ...current,
    reasons: published ? reasonsOf(published.rulesFile, current, asOf) : { citations: {}, rules: {} }
  }
}
