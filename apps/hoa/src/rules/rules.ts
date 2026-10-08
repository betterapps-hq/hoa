import { z } from "zod"

/** Project types homeowners can submit. Rules are tagged with the types they apply to. */
export const projectTypes = [{ id: "fence", label: "Fence" }] as const
export const projectTypeIds = ["fence"] as const
export type ProjectTypeId = (typeof projectTypeIds)[number]

export const ruleKinds = [
  "allowed-values",
  "numeric-limit",
  "placement",
  "required-document",
  "prohibition",
  "process"
] as const
export type RuleKind = (typeof ruleKinds)[number]

export const ruleKindLabels: Record<RuleKind, string> = {
  "allowed-values": "Allowed values",
  "numeric-limit": "Numeric limit",
  placement: "Placement",
  "required-document": "Required document",
  prohibition: "Prohibition",
  process: "Process"
}

export const ruleSourceSchema = z.object({
  document: z.string().min(1, "Enter the source document."),
  section: z.string().min(1, "Enter the section."),
  page: z.number().int().positive().nullable(),
  quote: z.string()
})

/** A rule as the extraction model returns it, before the app assigns an ID. */
export const extractedRuleSchema = z.object({
  title: z.string().min(1, "Enter a title."),
  requirement: z.string().min(1, "Describe the requirement."),
  kind: z.enum(ruleKinds),
  projectTypes: z.array(z.enum(projectTypeIds)).min(1, "Select at least one project type."),
  source: ruleSourceSchema
})

export const ruleSchema = extractedRuleSchema.extend({ id: z.string().min(1) })
export type Rule = z.infer<typeof ruleSchema>

export const extractionOutputSchema = z.object({ rules: z.array(extractedRuleSchema) })

export const rulebookSchema = z.object({
  hoaName: z.string().min(1),
  documents: z.array(z.string()),
  publishedAt: z.iso.datetime(),
  rules: z.array(ruleSchema)
})
export type Rulebook = z.infer<typeof rulebookSchema>

export function rulesForProject(rulebook: Rulebook, projectType: ProjectTypeId) {
  return rulebook.rules.filter((rule) => rule.projectTypes.includes(projectType))
}

export function formatCitation(source: Rule["source"]) {
  return [source.document, source.section, source.page === null ? undefined : `page ${source.page}`]
    .filter(Boolean)
    .join(", ")
}
