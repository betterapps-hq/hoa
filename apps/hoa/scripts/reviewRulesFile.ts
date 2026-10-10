import { mergeRulesFiles } from "../src/evaluation/review/rulesFile.ts"
import type { RulesFile } from "../src/schema/types.ts"
import { fenceRulesFile } from "../src/tests/fenceSchemaFixture.ts"
import { sampleDeclarationRulesFile } from "../src/tests/sampleRulesFile.ts"

/**
 * The rules file applications are reviewed against, by evaluation (`pnpm eval:review`) and by the app
 * (`pnpm db:seed:sample --review`) alike, so both review with the same rules: the sample Declaration (the golden rules
 * file without its Design Guidelines slice) plus the fence fixture's stand-in for the Design Guidelines' encoding.
 * Everything the review knows about the organization comes from these files' terms and rules.
 */
export function reviewRulesFile(): RulesFile {
  return mergeRulesFiles(sampleDeclarationRulesFile(), fenceRulesFile())
}
