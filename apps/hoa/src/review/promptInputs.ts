import type { DocumentKind } from "@/documents/applicationDocumentKinds"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"
import type { CandidateType } from "./candidates"
import type { Requirement } from "./documents"
import type { EntityGroup, FactPlan, PlannedProperty } from "./factPlan"

// What the review's prompts receive (application-review.md, Prompts and models), serialized compactly and in a
// stable order so the content cache hits when nothing changed. The page markers are in packet.ts.

type Entity = T.EvaluationRequest["entities"][number]

const json = (value: unknown) => JSON.stringify(value)

/** The project type the homeowner chose, as the organization labels and describes it. */
export function projectTypeForPrompt(type: { label: string; description: string | null } | null) {
  if (!type) {
    return "not given"
  }
  return type.description ? `${type.label}: ${type.description}` : type.label
}

export function documentTypesForPrompt(kinds: readonly DocumentKind[]) {
  return kinds
    .map((kind) => `- ${kind.key}: ${kind.labels.join(", ")}${kind.definition ? `. ${kind.definition}` : ""}`)
    .join("\n")
}

export function candidateTypesForPrompt(candidates: readonly CandidateType[]) {
  return json(
    candidates.map((candidate) => ({
      type: candidate.key,
      labels: candidate.labels,
      definition: candidate.definition,
      ...(candidate.scopeNote ? { scopeNote: candidate.scopeNote } : {}),
      ...(candidate.categories.length > 0
        ? {
            kinds: candidate.categories.map(({ scopeNote, ...category }) => ({
              ...category,
              ...(scopeNote ? { scopeNote } : {})
            }))
          }
        : {}),
      ...(candidate.references.length > 0 ? { refersTo: candidate.references } : {}),
      ...(candidate.isSigner ? { note: "A party who signs documents: name each person of it the packet names." } : {})
    }))
  )
}

/**
 * A facts call's entities, then the other entities its reference properties can point to (the item another sits on), marked
 * as there only to be referred to: without them the model can't name what a reference points to.
 */
export function entitiesForPrompt(
  group: EntityGroup,
  plan: FactPlan,
  entities: readonly Entity[],
  vocabulary: EngineVocabulary
) {
  const targets = plan.properties.flatMap((property) =>
    group.properties.includes(property.key) && property.valueType.type === "reference" ? [property.valueType.to] : []
  )
  const isReferable = (entity: Entity) =>
    !group.entities.includes(entity.id) && targets.some((to) => to === null || vocabulary.isKindOf(entity.type, to))
  const shown = (entity: Entity) => ({ id: entity.id, type: vocabulary.label(entity.type), label: entity.label })
  return json([
    ...entities.filter((entity) => group.entities.includes(entity.id)).map(shown),
    ...entities.filter(isReferable).map((entity) => ({ ...shown(entity), onlyToReferTo: true }))
  ])
}

function typeOf(property: PlannedProperty, vocabulary: EngineVocabulary) {
  const { valueType } = property
  switch (valueType.type) {
    case "quantity":
      return `a quantity with its unit, such as ${vocabulary.label(valueType.unit, true)}`
    case "choice":
      return property.isComplete
        ? "one of the allowed values"
        : "one of the allowed values, or another value as written"
    case "reference":
      return `the id of ${valueType.to ? `a ${vocabulary.label(valueType.to)}` : "another thing"} among the entities`
    case "party":
      return "a party, by role"
    default:
      return valueType.type
  }
}

export function propertiesForPrompt(plan: FactPlan, keys: readonly T.TermKey[], vocabulary: EngineVocabulary) {
  return json(
    plan.properties
      .filter((property) => keys.includes(property.key))
      .map((property) => ({
        property: property.key,
        of: vocabulary.label(property.owner),
        labels: property.labels,
        ...(property.definition ? { definition: property.definition } : {}),
        ...(property.scopeNote ? { scopeNote: property.scopeNote } : {}),
        type: typeOf(property, vocabulary),
        ...(property.values
          ? {
              allowed: property.values.map((value) => ({
                key: value.key,
                labels: value.labels,
                ...(value.meaning ? { meaning: value.meaning } : {})
              }))
            }
          : {}),
        silence: property.ifUnstated === "absent" ? "none" : "missing",
        ...(property.many ? { many: true } : {}),
        ...(property.askedInForm.length > 0 ? { askedInForm: property.askedInForm } : {})
      }))
  )
}

export function textConditionsForPrompt(
  plan: FactPlan,
  ids: readonly string[],
  entities: readonly Entity[],
  vocabulary: EngineVocabulary
) {
  const conditions = plan.conditions
    .filter((condition) => ids.includes(condition.id))
    .map((condition) => ({
      id: condition.id,
      question: condition.text,
      for: entities
        .filter((entity) => condition.types.includes(vocabulary.thingOf(entity.type)))
        .map((entity) => entity.id)
    }))
  return conditions.length > 0 ? json(conditions) : "none"
}

export function requirementsForPrompt(requirements: readonly Requirement[], entities: readonly Entity[]) {
  return json(
    requirements.map((requirement) => ({
      id: requirement.id,
      rule: requirement.rule,
      document: {
        type: requirement.documentType,
        labels: requirement.documentLabels,
        definition: requirement.definition
      },
      mustState: requirement.mustState,
      signedBy: requirement.signedBy,
      for: requirement.isPerSubject
        ? `${requirement.entity}: ${entities.find((entity) => entity.id === requirement.entity)?.label ?? ""}`
        : "the application"
    }))
  )
}

export function partiesForPrompt(parties: readonly Entity[], vocabulary: EngineVocabulary) {
  return parties.length > 0
    ? json(parties.map((party) => ({ id: party.id, role: vocabulary.label(party.type), label: party.label })))
    : "none named"
}

export function factsForPrompt(facts: readonly T.Fact[], vocabulary: EngineVocabulary) {
  return facts.length > 0
    ? json(
        facts.map((fact) => ({
          property: vocabulary.label(fact.property),
          state: fact.state,
          stated: fact.stated,
          value: fact.value,
          evidence: fact.evidence.map((item) => ({ fileId: item.fileId, page: item.page, quote: item.quote }))
        }))
      )
    : "none recorded"
}

export function subjectForPrompt(entity: Entity | undefined, vocabulary: EngineVocabulary) {
  return entity ? `${entity.label} (${vocabulary.label(entity.type)}, id ${entity.id})` : "the application"
}
