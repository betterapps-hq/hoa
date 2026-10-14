import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import {
  deleteOrganization,
  setOrganizationLogo,
  updateOrganizationDetails,
  updateOrganizationSettings
} from "@/db/organizationRepository"
import { logoMaxBytes, logoTypes, organizationDetailsSchema, settingsInputSchema } from "@/organization/organization"
import { requireAdministrator } from "@/session/requestContext.server"
import { organizationLogoKey, organizationPrefix } from "@/storage/keys"
import { deleteObjectsUnder, toHex } from "@/storage/objects"
import { getBucket } from "@/storage/storage.server"

// The association's settings page (docs/design/people.md, Settings): what its documents don't say, kept by an
// administrator. What the documents do say is the rulebook's settings.

/** The association as its settings page shows it. */
export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { organization } = await requireAdministrator()
  return {
    id: organization.id,
    name: organization.name,
    logo: organization.logo,
    address: organization.address,
    settings: organization.settings
  }
})

/** Renames the association and sets its mailing address. */
export const saveDetails = createServerFn({ method: "POST" })
  .validator((data: unknown) => organizationDetailsSchema.parse(data))
  .handler(async ({ data }) => {
    const { organization } = await requireAdministrator()
    await updateOrganizationDetails(getDb(), organization.id, data)
  })

/** The settings for applications: the units forms offer, and how long applications are kept. */
export const saveSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) => settingsInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { organization } = await requireAdministrator()
    await updateOrganizationSettings(getDb(), organization.id, data)
  })

/** Replaces the association's logo with an image: a PNG, JPEG or WebP of 1 MB or less. */
export const uploadLogo = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const file = data instanceof FormData ? data.get("file") : null
    if (!(file instanceof File)) {
      throw new Error("Expected an image.")
    }
    if (!logoTypes.some((type) => type === file.type)) {
      throw new Error("Use a PNG, JPEG or WebP image.")
    }
    if (file.size > logoMaxBytes) {
      throw new Error("Use an image of 1 MB or less.")
    }
    return file
  })
  .handler(async ({ data }) => {
    const { organization } = await requireAdministrator()
    const bytes = await data.arrayBuffer()
    await getBucket().put(organizationLogoKey(organization.id), bytes, { httpMetadata: { contentType: data.type } })
    // A new address for each image, so browsers that kept the last one fetch this one.
    const version = toHex(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 12)
    await setOrganizationLogo(getDb(), organization.id, `/files/organizations/${organization.id}/logo?v=${version}`)
  })

/** Takes the logo off: the association shows its initials again. */
export const removeLogo = createServerFn({ method: "POST" }).handler(async () => {
  const { organization } = await requireAdministrator()
  await setOrganizationLogo(getDb(), organization.id, null)
  await getBucket().delete(organizationLogoKey(organization.id))
})

/**
 * Deletes the association for good: everything it keeps, then its files. The name is typed to confirm, so a click
 * alone never does it.
 */
export const deleteAssociation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { organization } = await requireAdministrator()
    if (data.name.trim() !== organization.name) {
      throw new Error("Type the association's name as it's shown.")
    }
    await deleteOrganization(getDb(), organization.id)
    await deleteObjectsUnder(getBucket(), organizationPrefix(organization.id))
  })
