import { projectTypes, type ProjectTypeId } from "@/rules/catalog"
import { ruleTopics } from "@/rules/rule"

/** The catalog as the extraction and facts prompts see it: every attribute with scope, unit and allowed values. */
export function catalogForPrompt(projectType: ProjectTypeId) {
  const type = projectTypes[projectType]
  return JSON.stringify(
    {
      projectType: type.id,
      components: type.components,
      attributes: type.attributes.map((attribute) => ({
        key: attribute.key,
        scope: attribute.scope,
        label: attribute.label,
        kind: attribute.kind,
        ...(attribute.unit ? { unit: attribute.unit } : {}),
        ...(attribute.values ? { values: attribute.values } : {})
      })),
      documentRequirements: type.documents.map((document) => ({ id: document.id, label: document.label }))
    },
    null,
    1
  )
}

/** Project types and topics for the routing prompt. */
export function routingOptions() {
  return {
    projectTypes: Object.values(projectTypes)
      .map((type) => `${type.id}: ${type.label}, with ${type.components.join(" and ")} components`)
      .join("\n"),
    topics: ruleTopics.join(", ")
  }
}

/** Keeps a prompt variable within a budget, cutting at a line break. */
export function truncate(text: string, maxCharacters: number) {
  if (text.length <= maxCharacters) {
    return text
  }
  const cut = text.lastIndexOf("\n", maxCharacters)
  return `${text.slice(0, cut > 0 ? cut : maxCharacters)}\n[truncated]`
}
