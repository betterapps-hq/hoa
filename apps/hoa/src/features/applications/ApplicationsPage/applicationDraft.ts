import { z } from "zod"
import { projectAnswers } from "@/projectTypes/projectType"

// A homeowner's unsent application, kept in the tab's session storage as they type (not the files), so a reload or an
// accidental navigation never loses their answers. One draft per organization, with the answers for each project type
// they've filled in.

const answersOfType = z.object({ description: z.string(), answers: projectAnswers })

const draftSchema = z.object({
  projectTypeId: z.string(),
  byType: z.record(z.string(), answersOfType)
})

export type ApplicationDraft = z.infer<typeof draftSchema>
type DraftEntry = z.infer<typeof answersOfType>

const keyOf = (organization: string) => `application-draft:${organization}`

/** The organization's draft, or null when there's none or storage can't be read. */
export function readDraft(organization: string): ApplicationDraft | null {
  try {
    const stored = window.sessionStorage.getItem(keyOf(organization))
    const parsed = stored ? draftSchema.safeParse(JSON.parse(stored)) : null
    return parsed?.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The answers drafted for a project type, if any were typed. */
export const draftFor = (draft: ApplicationDraft | null, projectTypeId: string): DraftEntry | null =>
  draft?.byType[projectTypeId] ?? null

/** Keeps what's typed for the chosen project type; nothing is kept before a type is chosen. */
export function saveDraft(organization: string, projectTypeId: string, entry: DraftEntry) {
  if (projectTypeId === "") {
    return
  }
  try {
    const draft = readDraft(organization)
    const next: ApplicationDraft = { projectTypeId, byType: { ...draft?.byType, [projectTypeId]: entry } }
    window.sessionStorage.setItem(keyOf(organization), JSON.stringify(next))
  } catch {
    // Storage can be full or blocked; the form still works without a draft.
  }
}

/** Forgets the draft once the application is created. */
export function clearDraft(organization: string) {
  try {
    window.sessionStorage.removeItem(keyOf(organization))
  } catch {
    // Nothing to clear.
  }
}
