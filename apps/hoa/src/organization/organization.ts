import { z } from "zod"

export const organizationSettingsSchema = z.object({
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
  /** Its logo's URL; null shows its initials. */
  logo: string | null
  settings: OrganizationSettings
}
