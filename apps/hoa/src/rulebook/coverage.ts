import { z } from "zod"

/** The build's coverage report (encoding.md, Merge): how many provisions it read, and the keys of those nothing covers. */
export const rulebookCoverage = z.object({
  provisions: z.number().int().nonnegative(),
  uncovered: z.array(z.string())
})
export type RulebookCoverage = z.infer<typeof rulebookCoverage>
