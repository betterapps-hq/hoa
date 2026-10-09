import { mergeRulesFiles } from "../src/evaluation/review/rulesFile.ts"
import { storedTerm } from "../src/schema/exampleRulebook.test-data.ts"
import type { Condition, RulesFile } from "../src/schema/types.ts"
import { fenceRulesFile } from "../src/tests/fenceSchemaFixture.ts"
import { sampleRulesFile } from "../src/tests/sampleRulesFile.ts"

/**
 * The rules file applications are reviewed against before the Design Guidelines' encoding exists, by evaluation
 * (`pnpm eval:review`) and by the app (`pnpm db:seed:sample --review`) alike, so both review with the same rules: the
 * sample Declaration plus the fence fixture's Design Guidelines rules, with the project kinds the guidelines' encoding
 * would add (encoding.md: a category of work per improvement chapter) and one for the Use Restrictions' garage
 * enclosures.
 */
export function reviewRulesFile(): RulesFile {
  const merged = mergeRulesFiles(sampleRulesFile(), fenceRulesFile())
  const organizationId = merged.organization.id
  const kind = (key: string, label: string, definition: string, criteria: Condition) =>
    storedTerm({
      key,
      organizationId,
      kind: "category",
      of: "work",
      criteria,
      labels: [{ text: label, role: "preferred" }],
      definition
    })
  return mergeRulesFiles(merged, {
    ...merged,
    terms: [
      kind("fence-work", "fence", "Building, replacing or changing a fence or a gate", {
        type: "text",
        text: "Work that builds, replaces or changes a fence or a gate"
      }),
      kind("garage-enclosure-work", "garage enclosure", "Enclosing a garage as living space", {
        type: "compare",
        left: { type: "ref", path: ["work.kind"] },
        op: "=",
        right: { type: "value", term: "work-kind.garage-enclosure" }
      })
    ]
  })
}
