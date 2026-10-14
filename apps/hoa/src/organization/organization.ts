import { z } from "zod"
import { addressInputSchema, type Address } from "@/places/address"

const days = z
  .number("Give a number of days.")
  .int("Give whole days.")
  .min(1, "At least a day.")
  .max(3650, "At most ten years.")

export const unitSystems = ["imperial", "metric"] as const
export type UnitSystem = (typeof unitSystems)[number]

export const unitSystemLabels: Record<UnitSystem, string> = { imperial: "Feet and inches", metric: "Meters" }

/** The settings as an administrator edits them. */
export const settingsInputSchema = z.object({
  /** Days an application is kept after the committee's last decision. */
  retentionDays: days,
  /** Days an application that was never submitted is kept after its last change. */
  draftRetentionDays: days,
  /** The units forms offer for amounts: feet and inches, or meters. */
  unitSystem: z.enum(unitSystems)
})

/** The settings as an organization keeps them, with each one's default for one that doesn't have it yet. */
export const organizationSettingsSchema = settingsInputSchema.extend({
  retentionDays: days.default(365),
  draftRetentionDays: days.default(30),
  unitSystem: z.enum(unitSystems).default("imperial")
})

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>

/** An association's name and mailing address, as an administrator edits them. */
export const organizationDetailsSchema = z.object({
  name: z.string().trim().min(1, "Give the association's name.").max(200, "Keep the name under 200 characters."),
  address: addressInputSchema
})

export type OrganizationDetailsInput = z.input<typeof organizationDetailsSchema>

/** The kinds of image a logo may be, and the largest. */
export const logoTypes = ["image/png", "image/jpeg", "image/webp"] as const
export const logoMaxBytes = 1024 * 1024

export type Organization = {
  id: string
  name: string
  slug: string
  /** Its logo's URL; null shows its initials. */
  logo: string | null
  /** Its own mailing address. */
  address: Address
  settings: OrganizationSettings
}
