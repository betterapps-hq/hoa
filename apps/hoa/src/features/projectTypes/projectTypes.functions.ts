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
import { bindDefinition } from "@/projectTypes/bind"
import {
  buildDefinition,
  projectSubjects,
  propertyRules,
  vocabularyUnits,
  type ProjectSubject
} from "@/projectTypes/build"
import {
  projectTypeDefinition,
  projectTypeDetails,
  projectTypeStatuses,
  type DocumentTemplate,
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
import { rulebookChanges, type RulebookChange } from "@/projectTypes/updates"
import { definitionOf, rulebookVocabulary, scopeNoteOf } from "@/review/documentTypes"
import type * as T from "@/schema/types"
import { getRequestContext, requireAdministrator } from "@/session/requestContext.server"
import { projectTypeKeys } from "@/storage/keys"
import { deleteObjectsUnder } from "@/storage/objects"
import { getBucket, presignerOrNull } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"
import type { CitedProvision } from "../rulebook/citedProvision"
import { citationIndex, citedProvision } from "../rulebook/rulebookRecords"
import { citationsOf, citedKeys, currentType, offerType, type OfferedProjectType } from "./offeredTypes"
import { isOutdatedType, ownRulesFile, publishedRulebook } from "./publishedRules.server"
import { projectRequirements, type RequirementGroup } from "./requirements"

// Project types (application-review.md, Project types): the organization's own list, which homeowners pick from and
// administrators keep. Definitions, suggestions and requirements are built against the published rulebook.

const today = () => new Date().toISOString().slice(0, 10)

async function requirePublished(organizationId: string) {
  const published = await publishedRulebook(organizationId)
  if (!published) {
    throw new Error("Publish the rulebook first: project types are built from its rules.")
  }
  return published
}

async function loadOwnType(organizationId: string, id: string) {
  const type = await getProjectType(getDb(), organizationId, id)
  if (!type) {
    throw new Error("The project type doesn't exist.")
  }
  return type
}

/** The project types homeowners can choose: the active ones. */
export const listActiveProjectTypes = createServerFn({ method: "GET" }).handler(
  async (): Promise<OfferedProjectType[]> => {
    const context = await getRequestContext()
    const [types, published] = await Promise.all([
      listProjectTypeRecords(getDb(), context.organization.id),
      publishedRulebook(context.organization.id)
    ])
    return types.filter((type) => type.status === "active").map((type) => offerType(type, published, today()))
  }
)

export type ProjectTypeListItem = ProjectType & {
  applicationCount: number
  /** When the rulebook it's out of date with was published; null while it's current. */
  outdatedSince: string | null
}

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
      listProjectTypeRecords(db, context.organization.id),
      publishedRulebook(context.organization.id)
    ])
    return {
      projectTypes: await Promise.all(
        types.map(async (type) => ({
          ...type,
          applicationCount: await countApplicationsOfType(db, context.organization.id, type.id),
          outdatedSince: isOutdatedType(type, published) ? (published?.publishedAt ?? null) : null
        }))
      ),
      subjects: published ? projectSubjects(published.rulesFile, applicationRequestType) : [],
      hasPublishedRulebook: published !== null
    }
  }
)

/** How many active project types are out of date with the published rulebook, for the HOA management dashboard. */
export const countOutdatedProjectTypes = createServerFn({ method: "GET" }).handler(async (): Promise<number> => {
  const context = await getRequestContext()
  if (context.role !== "administrator") {
    return 0
  }
  const [types, published] = await Promise.all([
    listProjectTypeRecords(getDb(), context.organization.id),
    getPublishedRulesFile(getDb(), context.organization.id)
  ])
  return published
    ? types.filter((type) => type.status === "active" && type.rulebookId !== published.rulebookId).length
    : 0
})

export type ProjectTypeView = {
  projectType: ProjectType
  applicationCount: number
  /** Every requirement the published rulebook places on this kind of project. */
  requirements: RequirementGroup[]
  /** The labels of the things it covers. */
  subjectLabels: string[]
  /** Whether it was built against an earlier rulebook than the published one. */
  isOutdated: boolean
  /**
   * While it's out of date: when the published rulebook was published, what changed for this form, and the form the
   * published rulebook gives, which accepted changes come from.
   */
  updates: { publishedAt: string | null; changes: RulebookChange[]; latest: ProjectTypeDefinition } | null
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

export const getProjectTypeView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ projectTypeId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<ProjectTypeView> => {
    const context = await requireAdministrator()
    const db = getDb()
    const [type, published, applicationCount] = await Promise.all([
      loadOwnType(context.organization.id, data.projectTypeId),
      publishedRulebook(context.organization.id),
      countApplicationsOfType(db, context.organization.id, data.projectTypeId)
    ])
    const subjects = published ? projectSubjects(published.rulesFile, applicationRequestType) : []
    const current = currentType(type, published, today())
    const own = await ownRulesFile(context.organization.id, type, published)
    const buildFrom = (rulesFile: T.RulesFile) =>
      buildDefinition(rulesFile, applicationRequestType, type.definition.subjects, today())
    const available = own ? buildFrom(own.rulesFile) : type.definition
    const isOutdated = isOutdatedType(type, published)
    const latest = published && isOutdated ? buildFrom(published.rulesFile) : null
    const updates =
      published && latest
        ? {
            publishedAt: published.publishedAt,
            latest,
            changes: rulebookChanges(
              type.definition,
              own && own.id !== published.id ? available : null,
              latest,
              new Set(published.rulesFile.provisions.map((provision) => provision.key))
            )
          }
        : null
    return {
      projectType: current,
      applicationCount,
      requirements: published
        ? projectRequirements(published.rulesFile, applicationRequestType, type.definition.subjects, today())
        : [],
      subjectLabels: type.definition.subjects.map(
        (key) => subjects.find((subject) => subject.key === key)?.label ?? key
      ),
      isOutdated,
      updates,
      available,
      questionInfo: published ? questionInfoOf(published.rulesFile, type.definition.subjects) : {},
      citations: published
        ? citationsOf(published.rulesFile, [
            ...citedKeys(current.definition),
            ...citedKeys(available),
            ...(latest ? citedKeys(latest) : [])
          ])
        : {},
      units: vocabularyUnits(published?.rulesFile ?? null)
    }
  })

/** Every passage of the published rulebook's documents, for linking one to a question. */
export const listCitableProvisions = createServerFn({ method: "GET" }).handler(async (): Promise<CitedProvision[]> => {
  const context = await requireAdministrator()
  const published = await publishedRulebook(context.organization.id)
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
      requirePublished(context.organization.id),
      listProjectTypeRecords(getDb(), context.organization.id)
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
        sessionId: `project-types-${context.organization.id}`
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
    const published = await requirePublished(context.organization.id)
    const known = new Set(projectSubjects(published.rulesFile, applicationRequestType).map((subject) => subject.key))
    const subjects = data.subjects.filter((key) => known.has(key))
    const built = buildDefinition(published.rulesFile, applicationRequestType, subjects, today())
    return insertProjectType(getDb(), {
      organizationId: context.organization.id,
      label: data.label,
      description: data.description || null,
      rulebookId: published.id,
      definition: data.definition ? bindDefinition(data.definition, built) : built,
      createdBy: context.user.id,
      now: new Date().toISOString()
    })
  })

/** A newly linked passage must be in the published rulebook's documents; one a rebuild removed stays until fixed. */
function checkCitations(definition: ProjectTypeDefinition, before: ProjectTypeDefinition, rulesFile: T.RulesFile) {
  const known = citedKeys(before)
  const index = citationIndex(rulesFile)
  const unknown = [...citedKeys(definition)].filter((key) => !known.has(key) && !index.provisions.has(key))
  if (unknown.length > 0) {
    throw new Error("A linked passage isn't in the rulebook's documents. Choose it again.")
  }
}

/** The templates a form gives that the stored form didn't. */
const newTemplates = (definition: ProjectTypeDefinition, before: ProjectTypeDefinition) => {
  const known = new Set(before.documents.flatMap((document) => document.template?.id ?? []))
  return definition.documents.flatMap((document) =>
    document.template && !known.has(document.template.id) ? [document.template] : []
  )
}

/** Refuses a form whose new templates aren't in storage as uploaded. */
async function checkTemplates(organizationId: string, projectTypeId: string, templates: readonly DocumentTemplate[]) {
  const keys = projectTypeKeys(organizationId, projectTypeId)
  const stored = await Promise.all(
    templates.map((template) => getBucket().head(keys.template(template.id, template.fileName)))
  )
  if (stored.some((object, index) => !object || object.size !== templates[index]?.sizeBytes)) {
    throw new Error("A template didn't finish uploading. Choose it again.")
  }
}

export type TemplateUpload = { template: DocumentTemplate; uploadUrl: string | null; contentType: string }

/** Names a new template for one of a type's documents and returns where to upload it; the type's next save keeps it. */
export const createTemplateUpload = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        projectTypeId: z.string(),
        fileName: z.string().min(1).max(200),
        mediaType: z.string(),
        sizeBytes: z.number().int().positive()
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<TemplateUpload> => {
    const context = await requireAdministrator()
    await loadOwnType(context.organization.id, data.projectTypeId)
    const validation = validateUpload({ name: data.fileName, type: data.mediaType, size: data.sizeBytes }, "template")
    if (!validation.isValid) {
      throw new Error(validation.message)
    }
    const template: DocumentTemplate = {
      id: crypto.randomUUID(),
      fileName: data.fileName,
      mediaType: validation.upload.mediaType,
      sizeBytes: data.sizeBytes
    }
    const presigner = presignerOrNull()
    const key = projectTypeKeys(context.organization.id, data.projectTypeId).template(template.id, template.fileName)
    return { template, uploadUrl: presigner ? await presigner.upload(key) : null, contentType: template.mediaType }
  })

/** Uploads a template through the Worker when the environment has no R2 API token for presigned URLs. */
export const uploadTemplateFile = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data.")
    }
    const file = data.get("file")
    if (!(file instanceof File)) {
      throw new Error("Expected a file.")
    }
    const ids = z
      .object({ projectTypeId: z.string(), templateId: z.uuid() })
      .parse({ projectTypeId: data.get("projectTypeId"), templateId: data.get("templateId") })
    return { ...ids, file }
  })
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await loadOwnType(context.organization.id, data.projectTypeId)
    const validation = validateUpload(data.file, "template")
    if (!validation.isValid) {
      throw new Error(validation.message)
    }
    await getBucket().put(
      projectTypeKeys(context.organization.id, data.projectTypeId).template(data.templateId, data.file.name),
      data.file,
      { httpMetadata: { contentType: validation.upload.mediaType } }
    )
  })

/**
 * Saves the label, description and form; the form is checked against the rules again: the rulebook it was built with
 * while it's out of date, so an edit never takes the published rulebook's changes unreviewed. When that rulebook can't
 * be read any more, the form is saved as it stands and the type stays out of date, for its updates to be reviewed.
 */
export const updateProjectType = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    projectTypeDetails.extend({ id: z.string(), definition: projectTypeDefinition }).parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const [type, published] = await Promise.all([
      loadOwnType(context.organization.id, data.id),
      requirePublished(context.organization.id)
    ])
    const own = await ownRulesFile(context.organization.id, type, published)
    checkCitations(data.definition, type.definition, published.rulesFile)
    await checkTemplates(context.organization.id, type.id, newTemplates(data.definition, type.definition))
    await updateProjectTypeRecord(getDb(), context.organization.id, data.id, {
      label: data.label,
      description: data.description || null,
      definition: own
        ? bindDefinition(
            data.definition,
            buildDefinition(own.rulesFile, applicationRequestType, type.definition.subjects, today())
          )
        : data.definition,
      rulebookId: own?.id ?? type.rulebookId,
      updatedAt: new Date().toISOString()
    })
  })

/**
 * Brings a type up to date with the published rulebook: the form the administrator reviewed (each change accepted or
 * their version kept, `applyChanges`), bound against the published rules.
 */
export const applyProjectTypeUpdates = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string(), definition: projectTypeDefinition }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const [type, published] = await Promise.all([
      loadOwnType(context.organization.id, data.id),
      requirePublished(context.organization.id)
    ])
    const built = buildDefinition(published.rulesFile, applicationRequestType, type.definition.subjects, today())
    checkCitations(data.definition, type.definition, published.rulesFile)
    await checkTemplates(context.organization.id, type.id, newTemplates(data.definition, type.definition))
    await updateProjectTypeRecord(getDb(), context.organization.id, data.id, {
      definition: bindDefinition(data.definition, built),
      rulebookId: published.id,
      updatedAt: new Date().toISOString()
    })
  })

/** Archives a project type (hidden from new applications, kept for existing ones) or unarchives it. */
export const setProjectTypeStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string(), status: z.enum(projectTypeStatuses) }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await loadOwnType(context.organization.id, data.id)
    await updateProjectTypeRecord(getDb(), context.organization.id, data.id, {
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
    await loadOwnType(context.organization.id, data.id)
    if ((await countApplicationsOfType(db, context.organization.id, data.id)) > 0) {
      throw new Error("Applications use this project type, so it can be archived but not deleted.")
    }
    await deleteProjectTypeRecord(db, context.organization.id, data.id)
    await deleteObjectsUnder(getBucket(), projectTypeKeys(context.organization.id, data.id).root)
  })
