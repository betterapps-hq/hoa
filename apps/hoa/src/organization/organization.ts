import { z } from "zod"

export const organizationSettingsSchema = z.object({
  /** The recommendation when every unmet rule is curable. */
  curableOutcome: z.enum(["approve-with-conditions", "reject"]).default("approve-with-conditions"),
  /** Days an application is kept after the committee's last decision. */
  retentionDays: z.number().int().positive().default(365),
  /** Days an application that was never submitted is kept after its last change. */
  draftRetentionDays: z.number().int().positive().default(30),
  /** The units forms offer for amounts: feet and inches, or meters. */
  unitSystem: z.enum(["imperial", "metric"]).default("imperial")
})

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

export type Organization = {
  id: string
  name: string
  slug: string
  settings: OrganizationSettings
}
