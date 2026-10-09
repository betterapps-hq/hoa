import { z } from "zod"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptLoader } from "@/ai/promptLoader"
import type { PromptDefinition, PromptVariables } from "@/ai/prompts"
import {
  runObjectPrompt,
  type ModelFactory,
  type PromptAttachment,
  type PromptCache,
  type PromptRunMetrics
} from "@/ai/runPrompt"
import { otherDocumentKind } from "@/documents/applicationDocumentKinds"
import type { Answers, ConditionAnswer } from "@/engine/context"
import { decide } from "@/engine/decide"
import { evaluate } from "@/engine/evaluate"
import { modelCall, modelCallOf, type ModelCall, type StepRunner } from "@/jobs/steps"
import type * as T from "@/schema/types"
import { evaluationRequest, fact, finding } from "@/schema/zod"
import { candidateTypes, rootTypes } from "./candidates"
import { documentAnswers, documentRequirements, documentResults, documentsAnswerSchema } from "./documents"
import { documentTypes, rulebookVocabulary } from "./documentTypes"
import { entityGroup, entityGroups, factPlan, planFacts, type EntityGroup } from "./factPlan"
import { expandShared, factsAnswerSchema, type ConditionResponse, type FactsAnswer } from "./factSchema"
import { judgmentAnswerSchema, judgmentCalls, judgmentFacts, judgmentPages, toJudgment } from "./judgments"
import { requestSkeleton } from "./load"
import { normalizeFacts, partyValues, unitLabels } from "./normalize"
import { imagesFor, packetPageTexts, pagesForPrompt, type Packet, type PageRef, type PacketImage } from "./packet"
import {
  candidateTypesForPrompt,
  documentTypesForPrompt,
  entitiesForPrompt,
  factsForPrompt,
  partiesForPrompt,
  propertiesForPrompt,
  requirementsForPrompt,
  subjectForPrompt,
  textConditionsForPrompt
} from "./promptInputs"
import {
  actionItemSchema,
  conditionAnswerSchema,
  documentResultSchema,
  normalizationSchema,
  recommendations
} from "./reviewModel"
import { reconcileReadings, secondReadingGroups } from "./secondReading"
import { selectRules, selectedRulesFile } from "./select"
import { requestEntities, subjectsAnswerSchema, withIdentified, workType } from "./subjects"
import { actionItems, applySummary, markableRules, summaryAnswerSchema, summaryVariables } from "./write"

// The application review after OCR (application-review.md, Stages 4 to 14): classify, subjects, select, plan, facts,
// normalize, documents, judgments, evaluate, decide and write. Everything is injected: a step runner (Workflow steps in
// the app, plain calls in the evaluation runner and tests), the models and cache, the rules file and the packet. The
// ApplicationReview Workflow and `pnpm eval:review` both run this, so they can't drift.

/** The job stages the review reports, in order, after resolve-prompts, load and ocr. */
export type ReviewStage =
  | "classify"
  | "subjects"
  | "select"
  | "plan"
  | "facts"
  | "normalize"
  | "documents"
  | "judgments"
  | "evaluate"
  | "decide"
  | "write"

export type ReviewAi = {
  loadPrompt: PromptLoader
  createModel: ModelFactory
  /** `OPENROUTER_MODEL`, for prompts whose version names no model. */
  modelId: string
  /** `OPENROUTER_SMALL_MODEL`, for classification. */
  smallModelId: string
  environment: string
  /** The job id: one review is one Langfuse session. */
  sessionId: string
  promptVersions: Readonly<Record<string, number>>
  cache?: (traceName: string) => PromptCache
}

export type ReviewInput = {
  organizationId: string
  rulesFile: T.RulesFile
  application: {
    requestType: T.TermKey
    /** The project kind the homeowner chose: a hint, never a filter. */
    projectKind: T.TermKey | null
    description: string | null
    submittedOn: T.IsoDate | null
  }
  packet: Packet
  step: StepRunner
  ai: ReviewAi
  /** When the review runs: the evaluation date and every finding's time. */
  now: T.Timestamp
  progress?: (stage: ReviewStage, done: number, total: number) => Promise<void>
}

/** A model call or step that failed without failing the review, as the job records it. */
export type ReviewFailure = { stage: string; itemId: string; message: string }

const traceNames: Record<string, string> = {
  [pipelinePrompts.pageClassification.name]: "page-classification",
  [pipelinePrompts.subjectIdentification.name]: "subject-identification",
  [pipelinePrompts.entityFacts.name]: "entity-facts",
  [pipelinePrompts.documentReview.name]: "document-review",
  [pipelinePrompts.judgmentCheck.name]: "judgment-check",
  [pipelinePrompts.reviewSummary.name]: "review-summary"
}

const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

const withCall = <S extends z.ZodType>(schema: S) => z.object({ answer: schema, call: modelCall })

const plannedOutput = z.object({ plan: factPlan, groups: z.array(entityGroup) })

const normalizedOutput = z.object({
  facts: z.array(fact),
  normalizations: z.array(normalizationSchema),
  conditionAnswers: z.array(conditionAnswerSchema)
})

const decisionGroup = z.object({ ruleKey: z.string(), entities: z.array(z.string()), remedy: finding.shape.remedy })
const decisionOutput = z.object({
  recommendation: z.enum(recommendations),
  changes: z.array(decisionGroup),
  missingInformation: z.array(decisionGroup),
  committeeDecisions: z.array(decisionGroup),
  suggestions: z.array(decisionGroup)
})

const writtenOutput = z.object({
  assessment: z.string(),
  feedback: z.string(),
  changes: z.array(actionItemSchema),
  missingInformation: z.array(actionItemSchema),
  committeeDecisions: z.array(actionItemSchema),
  suggestions: z.array(actionItemSchema),
  call: modelCall
})

const callOf = (itemId: string, metrics: PromptRunMetrics) => modelCallOf(itemId, metrics, traceNames)

async function attachmentsOf(images: readonly PacketImage[]): Promise<PromptAttachment[]> {
  return Promise.all(
    images.map(async (image) => ({
      type: "file" as const,
      filename: image.filename,
      mediaType: image.mediaType,
      data: await image.load()
    }))
  )
}

/** Reviews an application packet against a rules file (application-review.md, Stages 4 to 14). */
export async function reviewApplication(input: ReviewInput) {
  const { ai, step, packet, rulesFile, application } = input
  const progress = async (stage: ReviewStage, done: number, total: number) => input.progress?.(stage, done, total)
  const failures: ReviewFailure[] = []
  const calls: ModelCall[] = []
  const vocabulary = rulebookVocabulary(rulesFile)
  const requestType = application.requestType
  const label = (key: T.TermKey) => vocabulary.label(key)

  const run = async <Answer, Prompt extends PromptDefinition>(
    prompt: Prompt,
    itemId: string,
    options: {
      schema: z.ZodType<Answer>
      variables: PromptVariables<Prompt>
      attachments?: PromptAttachment[]
      isSmall?: boolean
    }
  ) => {
    const traceName = traceNames[prompt.name] ?? prompt.name
    const result = await runObjectPrompt({
      loadPrompt: ai.loadPrompt,
      createModel: ai.createModel,
      defaultModelId: options.isSmall ? ai.smallModelId : ai.modelId,
      prompt,
      promptVersion: ai.promptVersions[prompt.name],
      schema: options.schema,
      variables: options.variables,
      attachments: options.attachments,
      traceName,
      environment: ai.environment,
      sessionId: ai.sessionId,
      cache: ai.cache?.(traceName)
    })
    return { answer: result.object, call: callOf(itemId, result) }
  }

  // 4. Classify: each page's document type, with the small model.
  const kinds = documentTypes(rulesFile, requestType)
  const kindKeys = kinds.map((kind) => kind.key)
  const classification = z.object({ type: z.enum([otherDocumentKind, ...kindKeys]) })
  const readable = packet.files.filter((file) => file.isReadable)
  await progress("classify", 0, readable.length)
  const pageTypes = new Map<string, string[]>()
  for (const [index, file] of readable.entries()) {
    const output = await step(
      `classify:${file.id}`,
      z.object({ types: z.array(z.string()), calls: z.array(modelCall), failures: z.array(z.string()) }),
      async () => {
        const results = await Promise.allSettled(
          file.pages.map((page) =>
            run(pipelinePrompts.pageClassification, `${file.id}:${page.pageIndex}`, {
              schema: classification,
              isSmall: true,
              variables: {
                documentTypes: documentTypesForPrompt(kinds),
                contextText: file.contextText ?? "none",
                visualDescriptions:
                  file.visuals
                    .filter((visual) => visual.pageIndex === page.pageIndex)
                    .map((visual) => visual.description)
                    .join("\n") || "none",
                pageText: page.text.slice(0, 12_000) || "[no text]"
              }
            })
          )
        )
        return {
          types: results.map((result) =>
            result.status === "fulfilled" ? result.value.answer.type : otherDocumentKind
          ),
          calls: results.flatMap((result) => (result.status === "fulfilled" ? [result.value.call] : [])),
          failures: results.flatMap((result, page) =>
            result.status === "rejected" ? [`page ${page + 1}: ${messageOf(result.reason)}`] : []
          )
        }
      },
      "model"
    )
    pageTypes.set(file.id, output.types)
    calls.push(...output.calls)
    failures.push(...output.failures.map((message) => ({ stage: "classify", itemId: file.id, message })))
    await progress("classify", index + 1, readable.length)
  }
  const allPages = pagesForPrompt(packet, pageTypes)
  const pageText = packetPageTexts(packet)

  // 5. Subjects: the entities the application is about.
  await progress("subjects", 0, 1)
  const candidates = candidateTypes(rulesFile, requestType)
  const subjects = await step(
    "subjects",
    withCall(subjectsAnswerSchema),
    async () =>
      run(pipelinePrompts.subjectIdentification, "packet", {
        schema: subjectsAnswerSchema,
        variables: {
          requestType: label(requestType),
          projectKind: application.projectKind ? label(application.projectKind) : "not given",
          description: application.description ?? "none",
          candidateTypes: candidateTypesForPrompt(candidates),
          pages: allPages
        },
        attachments: await attachmentsOf(imagesFor(packet))
      }),
    "model"
  )
  calls.push(subjects.call)
  const identified = requestEntities(
    subjects.answer,
    candidates,
    { requestType, projectLabel: application.projectKind ? label(application.projectKind) : null },
    vocabulary
  )
  failures.push(
    ...identified.dropped.map((itemId) => ({ stage: "subjects", itemId, message: "Not a candidate type; dropped." }))
  )
  const { entities } = identified
  const skeleton = requestSkeleton({
    organizationId: input.organizationId,
    rulesFile,
    requestType,
    submittedOn: application.submittedOn,
    now: input.now
  })

  // 6. Select: the rules that can apply, and the rules that override them.
  await progress("select", 0, 1)
  const { selected } = await step("select", z.object({ selected: z.array(z.string()) }), async () => ({
    selected: selectRules(rulesFile, {
      type: requestType,
      governingDate: skeleton.governingDate,
      entityTypes: entities.map((entity) => entity.type),
      lotRef: null
    })
  }))
  const reviewedFile = selectedRulesFile(rulesFile, selected)

  // 7. Plan: every property the selected rules read, split into entity groups.
  await progress("plan", 0, 1)
  const { plan, groups } = await step("plan", plannedOutput, async () => {
    const factPlan = planFacts(rulesFile, selected, requestType)
    return {
      plan: factPlan,
      groups: entityGroups(factPlan, entities, vocabulary, [...rootTypes(requestType), workType])
    }
  })

  // 8. Facts: one call per entity group.
  await progress("facts", 0, groups.length)
  const schemaContext = {
    entities,
    vocabulary,
    units: unitLabels(rulesFile, vocabulary).flatMap((unit) => {
      const dimension = vocabulary.unit(unit.unit)?.dimension
      return dimension ? [{ key: unit.unit, dimension }] : []
    })
  }
  const images = imagesFor(packet)
  const readFacts = async (group: EntityGroup) => {
    const schema = factsAnswerSchema(plan, group, schemaContext)
    return step(
      `facts:${group.id}`,
      withCall(schema),
      async () =>
        run(pipelinePrompts.entityFacts, group.id, {
          schema,
          variables: {
            requestType: label(requestType),
            description: application.description ?? "none",
            entities: entitiesForPrompt(group, plan, entities, vocabulary),
            properties: propertiesForPrompt(plan, group.properties, vocabulary),
            textConditions: textConditionsForPrompt(plan, group.conditions, entities, vocabulary),
            pages: allPages
          },
          attachments: await attachmentsOf(images)
        }),
      "model"
    )
  }
  const readAll = async (toRead: readonly EntityGroup[]) => {
    let done = 0
    await progress("facts", done, toRead.length)
    const results = await Promise.allSettled(
      toRead.map(async (group) => {
        const output = await readFacts(group)
        done += 1
        await progress("facts", done, toRead.length)
        return { group, output }
      })
    )
    return results.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        const { group, output } = result.value
        calls.push(output.call)
        return [expandShared(output.answer, plan, group, schemaContext)]
      }
      failures.push({ stage: "facts", itemId: toRead[index]?.id ?? String(index), message: messageOf(result.reason) })
      return []
    })
  }
  const factAnswers: FactsAnswer[] = await readAll(groups)

  // What identification read (the run a gate is on, a return fence's location) joins the facts stage's readings. Then
  // 8b: a second, focused reading of every fact read below the confidence threshold, reconciled with the first.
  const factConfidence = rulesFile.settings.policy.thresholds.factConfidence
  const firstFacts = withIdentified(
    factAnswers.flatMap((answer) => answer.facts),
    identified.readings,
    factConfidence
  )
  const secondFacts = (await readAll(secondReadingGroups(groups, firstFacts, entities, factConfidence))).flatMap(
    (answer) => answer.facts
  )
  const readFactAnswers = reconcileReadings(firstFacts, secondFacts, factConfidence)

  // 9. Normalize: typed values, evidence verified, conflicts, the confidence threshold.
  await progress("normalize", 0, 1)
  const normalized = await step("normalize", normalizedOutput, async () => {
    const { facts, normalizations } = normalizeFacts(readFactAnswers, {
      plan,
      vocabulary,
      units: unitLabels(rulesFile, vocabulary),
      parties: partyValues(rulesFile, vocabulary),
      entities,
      referenceDate: skeleton.governingDate,
      factConfidence,
      pageText,
      at: input.now
    })
    const conditionText = new Map(plan.conditions.map((condition) => [condition.id, condition.text]))
    const conditionAnswers: ConditionAnswer[] = factAnswers
      .flatMap((answer): ConditionResponse[] => answer.conditions)
      .flatMap((response) => {
        const text = conditionText.get(response.condition)
        return text
          ? [{ entity: response.entity, text, holds: response.answer === "unknown" ? null : response.answer === "yes" }]
          : []
      })
    return { facts: [...skeleton.facts, ...facts], normalizations, conditionAnswers }
  })
  const request: T.EvaluationRequest = {
    organizationId: skeleton.organizationId,
    type: skeleton.type,
    governingDate: skeleton.governingDate,
    evaluationDate: skeleton.evaluationDate,
    lot: skeleton.lot,
    entities,
    facts: normalized.facts,
    documents: []
  }

  // 10. Documents: every required document, its statements and signers.
  await progress("documents", 0, 1)
  const requirements = documentRequirements(reviewedFile.rules, entities, vocabulary)
  const parties = entities.filter((entity) => vocabulary.isParty(entity.type))
  const documentTypeKeys = new Set(requirements.map((requirement) => requirement.documentType))
  // A page of a generic kind (a drawing, a photo) may be any of the required documents; only a page classified as
  // another of the rulebook's own types is left out.
  const genericKinds = new Set(kinds.filter((kind) => !vocabulary.get(kind.key)).map((kind) => kind.key))
  const visualKinds = new Set([...genericKinds].filter((kind) => kind !== otherDocumentKind))
  const isRequiredPage = (page: PageRef) => {
    const type = pageTypes.get(page.fileId)?.[page.pageIndex - 1]
    return (
      type !== undefined &&
      (genericKinds.has(type) || [...documentTypeKeys].some((key) => vocabulary.isKindOf(type, key)))
    )
  }
  const hasRequiredPages = packet.files.some((file) =>
    file.pages.some((page) => isRequiredPage({ fileId: file.id, pageIndex: page.pageIndex }))
  )
  const documents = await step(
    "documents",
    z.object({ results: z.array(documentResultSchema), call: modelCall.nullable() }),
    async () => {
      if (requirements.length === 0) {
        return { results: [], call: null }
      }
      const schema = documentsAnswerSchema(requirements)
      const result = await run(pipelinePrompts.documentReview, "packet", {
        schema,
        variables: {
          requirements: requirementsForPrompt(requirements, entities),
          parties: partiesForPrompt(parties, vocabulary),
          pages: hasRequiredPages ? pagesForPrompt(packet, pageTypes, isRequiredPage) : allPages
        }
      })
      return {
        results: documentResults(requirements, result.answer, new Set(parties.map((party) => party.id))),
        call: result.call
      }
    },
    "model"
  )
  if (documents.call) {
    calls.push(documents.call)
  }
  const fromDocuments = documentAnswers(documents.results)
  request.documents = fromDocuments.documents
  const answers: Answers = {
    documentReviews: fromDocuments.reviews,
    judgments: [],
    conditionAnswers: normalized.conditionAnswers
  }

  // 11. Judgments: one call per judgment check and subject the engine can't decide without one.
  const unjudged = evaluate({ rulesFile: reviewedFile, request, answers, evaluatedAt: input.now })
  const pending = judgmentCalls(unjudged, reviewedFile.rules, vocabulary)
  await progress("judgments", 0, pending.length)
  let judged = 0
  const judgmentResults = await Promise.allSettled(
    pending.map(async (call) => {
      const facts = judgmentFacts(call, request.facts)
      const includes = judgmentPages(call, facts, pageTypes, vocabulary, visualKinds)
      const output = await step(
        `judgment:${call.ruleKey}:${call.entity}`,
        withCall(judgmentAnswerSchema),
        async () =>
          run(pipelinePrompts.judgmentCheck, `${call.ruleKey}:${call.entity}`, {
            schema: judgmentAnswerSchema,
            variables: {
              statement: call.statement,
              question: call.question,
              subject: subjectForPrompt(
                entities.find((entity) => entity.id === call.entity),
                vocabulary
              ),
              facts: factsForPrompt(facts, vocabulary),
              evidencePages: pagesForPrompt(packet, pageTypes, includes)
            },
            attachments: await attachmentsOf(imagesFor(packet, includes))
          }),
        "model"
      )
      judged += 1
      await progress("judgments", judged, pending.length)
      return toJudgment(call, output.answer)
    })
  )
  const judgments = pending.flatMap((call, index) => {
    const result = judgmentResults[index]
    if (result?.status === "fulfilled") {
      return [result.value]
    }
    failures.push({ stage: "judgments", itemId: `${call.ruleKey}:${call.entity}`, message: messageOf(result?.reason) })
    return []
  })
  answers.judgments.push(...judgments)

  // 12. Evaluate: one finding per rule and subject.
  await progress("evaluate", 0, 1)
  const findings = await step(
    "evaluate",
    z.object({ request: evaluationRequest, findings: z.array(finding) }),
    async () => ({
      request,
      findings: evaluate({ rulesFile: reviewedFile, request, answers, evaluatedAt: input.now })
    })
  )

  // 13. Decide: the recommendation and the action items.
  await progress("decide", 0, 1)
  const decision = await step("decide", decisionOutput, async () =>
    decide(findings.findings, reviewedFile, requestType)
  )

  // 14. Write: the assessment, the homeowner's feedback and each action item, from the findings only.
  await progress("write", 0, 1)
  const writerContext = {
    rules: new Map(reviewedFile.rules.map((rule) => [rule.key, rule])),
    entities,
    findings: findings.findings,
    vocabulary
  }
  const items = actionItems(decision, writerContext)
  const written = await step(
    "write",
    writtenOutput,
    async () => {
      const result = await run(pipelinePrompts.reviewSummary, "review", {
        schema: summaryAnswerSchema(markableRules(findings.findings, selected)),
        variables: summaryVariables(reviewedFile, decision.recommendation, items, writerContext)
      })
      return { ...applySummary(result.answer, items), call: result.call }
    },
    "model"
  )
  calls.push(written.call)

  return {
    request: findings.request,
    provisional: skeleton.provisional,
    selected,
    entityEvidence: identified.evidence,
    pageTypes: Object.fromEntries(pageTypes),
    documents: documents.results,
    normalizations: normalized.normalizations,
    judgments,
    conditionAnswers: normalized.conditionAnswers,
    findings: findings.findings,
    recommendation: decision.recommendation,
    changes: written.changes,
    missingInformation: written.missingInformation,
    committeeDecisions: written.committeeDecisions,
    suggestions: written.suggestions,
    assessment: written.assessment,
    feedback: written.feedback,
    calls,
    failures,
    costUsd: calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0)
  }
}

export type ReviewResult = Awaited<ReturnType<typeof reviewApplication>>
