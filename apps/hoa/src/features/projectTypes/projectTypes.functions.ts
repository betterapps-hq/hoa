import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { createAiContext } from "@/ai/aiContext.server"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { runObjectPrompt } from "@/ai/runPrompt"
import { applicationRequestType } from "@/applications/application"
import { getDb } from "@/db/client.server"
import {
  countApplicationsOfType,
  deleteProjectType as deleteProjectTypeRecord,
  getProjectType,
  insertProjectType,
  listProjectTypes as listProjectTypeRecords,
  updateProjectType as updateProjectTypeRecord
} from "@/db/projectTypeRepository"
import { getPublishedRulesFile } from "@/db/rulebookContentRepository"
import {
  bindDefinition,
  buildDefinition,
  projectSubjects,
  propertyRules,
  vocabularyUnits,
  type ProjectSubject
} from "@/projectTypes/build"
import { allQuestions } from "@/projectTypes/definition"
import {
  projectTypeDefinition,
  projectTypeDetails,
  projectTypeStatuses,
  type ProjectType,
  type ProjectTypeDefinition
} from "@/projectTypes/projectType"
import {
  checkSuggestions,
  projectTypesForPrompt,
  rulebookForPrompt,
  suggestionAnswerSchema,
  type ProjectTypeSuggestion
} from "@/projectTypes/suggest"
import { definitionOf, rulebookVocabulary, scopeNoteOf } from "@/review/documentTypes"
import { readRulesFile } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import { getRequestContext, requireAdministrator } from "@/session/requestContext.server"
import { getBucket } from "@/storage/storage.server"
import type { CitedProvision } from "../rulebook/citedProvision"
import { citationIndex, citedProvision } from "../rulebook/rulebookRecords"
import { projectRequirements, type RequirementGroup } from "./requirements"

// Project types (application-review.md, Project types): the organization's own list, which homeowners pick from and
// administrators keep. Definitions, suggestions and requirements are built against the published rulebook.

const today = () => new Date().toISOString().slice(0, 10)

/** The published rulebook's id and rules file; null before the organization publishes one. */
async function publishedRulebook(hoaId: string) {
  const published = await getPublishedRulesFile(getDb(), hoaId)
  return published ? { id: published.rulebookId, rulesFile: await readRulesFile(getBucket(), published) } : null
}

async function requirePublished(hoaId: string) {
  const published = await publishedRulebook(hoaId)
  if (!published) {
    throw new Error("Publish the rulebook first: project types are built from its rules.")
  }
  return published
}

async function loadOwnType(hoaId: string, id: string) {
  const type = await getProjectType(getDb(), hoaId, id)
  if (!type) {
    throw new Error("The project type doesn't exist.")
  }
  return type
}

/** Why a form asks its questions: the passages they cite, and the titles of the rules that read each property. */
export type QuestionReasons = {
  citations: Record<string, CitedProvision>
  /** Rule titles by property. */
  rules: Record<string, string[]>
}

/** A project type as homeowners choose it, with why its questions are asked. */
export type OfferedProjectType = ProjectType & { reasons: QuestionReasons }

/** The project types homeowners can choose: the active ones. */
export const listActiveProjectTypes = createServerFn({ method: "GET" }).handler(
  async (): Promise<OfferedProjectType[]> => {
    const context = await getRequestContext()
    const [types, published] = await Promise.all([
      listProjectTypeRecords(getDb(), context.hoa.id),
      publishedRulebook(context.hoa.id)
    ])
    return types
      .filter((type) => type.status === "active")
      .map((type) => {
        const current = currentType(type, published)
        return {
          ...current,
          reasons: published ? reasonsOf(published.rulesFile, current) : { citations: {}, rules: {} }
        }
      })
  }
)

function reasonsOf(rulesFile: T.RulesFile, type: ProjectType): QuestionReasons {
  const titles = new Map(rulesFile.rules.map((rule) => [rule.key, rule.title]))
  const byProperty = propertyRules(rulesFile, applicationRequestType, type.definition.subjects, today())
  return {
    citations: citationsOf(rulesFile, citedKeys(type.definition)),
    rules: Object.fromEntries(
      Object.entries(byProperty).map(([property, keys]) => [property, keys.flatMap((key) => titles.get(key) ?? [])])
    )
  }
}

/**
 * A type as its form reads now: bound again to the rules it was built against, so the questions carry what code
 * derives from the vocabulary (units, code's wording for a bare label). A type built against an earlier rulebook stays
 * as stored until the administrator updates it.
 */
function currentType(type: ProjectType, published: Awaited<ReturnType<typeof publishedRulebook>>): ProjectType {
  if (!published || type.rulebookId !== published.id) {
    return type
  }
  const built = buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, today())
  return { ...type, definition: bindDefinition(type.definition, built) }
}

export type ProjectTypeListItem = ProjectType & { applicationCount: number }

export type ProjectTypesOverview = {
  projectTypes: ProjectTypeListItem[]
  /** The things a project type can cover, for adding one by hand; empty before a rulebook is published. */
  subjects: ProjectSubject[]
  hasPublishedRulebook: boolean
}

/** Every project type with how many applications use it, and what a new one can cover. */
export const getProjectTypesOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProjectTypesOverview> => {
    const context = await requireAdministrator()
    const db = getDb()
    const [types, published] = await Promise.all([
      listProjectTypeRecords(db, context.hoa.id),
      publishedRulebook(context.hoa.id)
    ])
    return {
      projectTypes: await Promise.all(
        types.map(async (type) => ({
          ...type,
          applicationCount: await countApplicationsOfType(db, context.hoa.id, type.id)
        }))
      ),
      subjects: published ? projectSubjects(published.rulesFile, applicationRequestType) : [],
      hasPublishedRulebook: published !== null
    }
  }
)

export type ProjectTypeView = {
  projectType: ProjectType
  applicationCount: number
  /** Every requirement the published rulebook places on this kind of project. */
  requirements: RequirementGroup[]
  /** The labels of the things it covers. */
  subjectLabels: string[]
  /** Whether it was built against an earlier rulebook than the published one. */
  isOutdated: boolean
  /** Every question the rules about its subjects can ask, for adding back one the administrator removed. */
  available: ProjectTypeDefinition
  /** What each question checks, by property key: the vocabulary's meaning and the rules that read it. */
  questionInfo: Record<string, QuestionInfo>
  /** The passages the questions cite, by provision key; a key missing here is a link the rulebook no longer has. */
  citations: Record<string, CitedProvision>
  /** The units the vocabulary has, for the administrator's own amount questions. */
  units: VocabularyUnit[]
}

export type VocabularyUnit = ReturnType<typeof vocabularyUnits>[number]

export type QuestionInfo = { meaning: string | null; ruleKeys: string[] }

function questionInfoOf(rulesFile: T.RulesFile, subjects: readonly string[]): Record<string, QuestionInfo> {
  const vocabulary = rulebookVocabulary(rulesFile)
  return Object.fromEntries(
    Object.entries(propertyRules(rulesFile, applicationRequestType, subjects, today())).map(([property, ruleKeys]) => [
      property,
      { meaning: definitionOf(vocabulary, property) ?? scopeNoteOf(vocabulary, property), ruleKeys }
    ])
  )
}

/** Every provision key a definition's questions cite, asked or kept aside. */
const citedKeys = (definition: ProjectTypeDefinition) =>
  new Set([
    ...allQuestions(definition).flatMap((item) => item.field.citations ?? []),
    ...definition.documents.flatMap((document) => document.citations)
  ])

/** The cited passages that exist in the rulebook's documents, as screens show them. */
function citationsOf(rulesFile: T.RulesFile, keys: Iterable<string>): Record<string, CitedProvision> {
  const index = citationIndex(rulesFile)
  return Object.fromEntries(
    [...keys]
      .filter((key) => index.provisions.has(key))
      .map((key) => [key, citedProvision(index, { provisionKey: key, highlight: null, region: null })])
  )
}

export const getProjectTypeView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ projectTypeId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<ProjectTypeView> => {
    const context = await requireAdministrator()
    const db = getDb()
    const [type, published, applicationCount] = await Promise.all([
      loadOwnType(context.hoa.id, data.projectTypeId),
      publishedRulebook(context.hoa.id),
      countApplicationsOfType(db, context.hoa.id, data.projectTypeId)
    ])
    const subjects = published ? projectSubjects(published.rulesFile, applicationRequestType) : []
    const current = currentType(type, published)
    const available = published
      ? buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, today())
      : type.definition
    return {
      projectType: current,
      applicationCount,
      requirements: published
        ? projectRequirements(published.rulesFile, applicationRequestType, type.definition.subjects, today())
        : [],
      subjectLabels: type.definition.subjects.map(
        (key) => subjects.find((subject) => subject.key === key)?.label ?? key
      ),
      isOutdated: published !== null && type.rulebookId !== published.id,
      available,
      questionInfo: published ? questionInfoOf(published.rulesFile, type.definition.subjects) : {},
      citations: published
        ? citationsOf(published.rulesFile, [...citedKeys(current.definition), ...citedKeys(available)])
        : {},
      units: vocabularyUnits(published?.rulesFile ?? null)
    }
  })

/** Every passage of the published rulebook's documents, for linking one to a question. */
export const listCitableProvisions = createServerFn({ method: "GET" }).handler(async (): Promise<CitedProvision[]> => {
  const context = await requireAdministrator()
  const published = await publishedRulebook(context.hoa.id)
  if (!published) {
    return []
  }
  const index = citationIndex(published.rulesFile)
  return published.rulesFile.provisions.map((provision) =>
    citedProvision(index, { provisionKey: provision.key, highlight: null, region: null })
  )
})

/**
 * Project types the governing documents suggest: the model reads the published rulebook and proposes types; code keeps
 * only fields the rules test and documents the rules require.
 */
export const suggestProjectTypes = createServerFn({ method: "POST" }).handler(
  async (): Promise<ProjectTypeSuggestion[]> => {
    const context = await requireAdministrator()
    const ai = createAiContext()
    if (!ai.isConfigured) {
      throw new Error(`Suggestions need ${ai.missing.join(", ")}.`)
    }
    const [published, existing] = await Promise.all([
      requirePublished(context.hoa.id),
      listProjectTypeRecords(getDb(), context.hoa.id)
    ])
    const on = today()
    try {
      const result = await runObjectPrompt({
        loadPrompt: ai.loadPrompt,
        createModel: ai.createModel,
        defaultModelId: ai.modelId,
        prompt: pipelinePrompts.projectTypeSuggestion,
        schema: suggestionAnswerSchema,
        variables: {
          rulebook: rulebookForPrompt(published.rulesFile, applicationRequestType, on),
          projectTypes: projectTypesForPrompt(existing)
        },
        traceName: "project-type-suggestion",
        environment: ai.environment,
        sessionId: `project-types-${context.hoa.id}`
      })
      return checkSuggestions(result.object, {
        rulesFile: published.rulesFile,
        requestType: applicationRequestType,
        on,
        existing
      })
    } finally {
      await ai.flush()
    }
  }
)

const newProjectType = projectTypeDetails.extend({
  subjects: z.array(z.string()),
  /** A suggestion's definition, checked against the rules; without one, the rules' full definition. */
  definition: projectTypeDefinition.nullable()
})

export const createProjectType = createServerFn({ method: "POST" })
  .validator((data: unknown) => newProjectType.parse(data))
  .handler(async ({ data }): Promise<ProjectType> => {
    const context = await requireAdministrator()
    const published = await requirePublished(context.hoa.id)
    const known = new Set(projectSubjects(published.rulesFile, applicationRequestType).map((subject) => subject.key))
    const subjects = data.subjects.filter((key) => known.has(key))
    const built = buildDefinition(published.rulesFile, applicationRequestType, subjects, today())
    return insertProjectType(getDb(), {
      hoaId: context.hoa.id,
      label: data.label,
      description: data.description || null,
      rulebookId: published.id,
      definition: data.definition ? bindDefinition(data.definition, built) : built,
      now: new Date().toISOString()
    })
  })

/** Saves the label, description and form; the form is checked against the rules again. */
export const updateProjectType = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    projectTypeDetails.extend({ id: z.string(), definition: projectTypeDefinition }).parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const [type, published] = await Promise.all([
      loadOwnType(context.hoa.id, data.id),
      requirePublished(context.hoa.id)
    ])
    const built = buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, today())
    // A newly linked passage must be in the documents; one a rebuild removed stays until the administrator fixes it.
    const known = new Set([...citedKeys(type.definition), ...citedKeys(built)])
    const index = citationIndex(published.rulesFile)
    const unknown = [...citedKeys(data.definition)].filter((key) => !known.has(key) && !index.provisions.has(key))
    if (unknown.length > 0) {
      throw new Error("A linked passage isn't in the rulebook's documents. Choose it again.")
    }
    await updateProjectTypeRecord(getDb(), context.hoa.id, data.id, {
      label: data.label,
      description: data.description || null,
      definition: bindDefinition(data.definition, built),
      rulebookId: published.id,
      updatedAt: new Date().toISOString()
    })
  })

/** Rebuilds the form against the published rulebook, keeping the administrator's wording where a field still binds. */
export const refreshProjectType = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const [type, published] = await Promise.all([
      loadOwnType(context.hoa.id, data.id),
      requirePublished(context.hoa.id)
    ])
    const built = buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, today())
    const kept = bindDefinition(type.definition, built)
    await updateProjectTypeRecord(getDb(), context.hoa.id, data.id, {
      definition: kept.groups.length > 0 ? kept : built,
      rulebookId: published.id,
      updatedAt: new Date().toISOString()
    })
  })

/** Archives a project type (hidden from new applications, kept for existing ones) or unarchives it. */
export const setProjectTypeStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string(), status: z.enum(projectTypeStatuses) }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await loadOwnType(context.hoa.id, data.id)
    await updateProjectTypeRecord(getDb(), context.hoa.id, data.id, {
      status: data.status,
      updatedAt: new Date().toISOString()
    })
  })

/** Deletes a project type no application uses; one in use can only be archived. */
export const deleteProjectType = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    await loadOwnType(context.hoa.id, data.id)
    if ((await countApplicationsOfType(db, context.hoa.id, data.id)) > 0) {
      throw new Error("Applications use this project type, so it can be archived but not deleted.")
    }
    await deleteProjectTypeRecord(db, context.hoa.id, data.id)
  })
