/** A cited provision as screens show it; the text is always the stored provision, so it can't drift from the document. */
export type CitedProvision = {
  provisionKey: string
  /** "Declaration 4.3(b)" */
  label: string
  documentTitle: string
  heading: string | null
  /** The ancestors' lead-ins that govern it, outermost first. */
  intros: string[]
  text: string
  /** The ancestors' wrap-ups that finish it, nearest first. */
  wrapUps: string[]
  /** The operative words within `text`; null means all of it. */
  highlight: { start: number; end: number } | null
  /** Where the provision is on its file's pages. */
  anchors: { fileId: string; page: number; start: number; end: number }[]
}

/** "Declaration 4.3(b): Plans and specifications" */
export const citationTitle = (citation: Pick<CitedProvision, "label" | "heading">) =>
  citation.heading ? `${citation.label}: ${citation.heading}` : citation.label
