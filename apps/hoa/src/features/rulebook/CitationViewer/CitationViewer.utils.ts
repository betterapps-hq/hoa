import type { CitedProvision } from "./CitationViewer"

/** "Declaration 4.3(b): Plans and specifications" */
export const citationTitle = (citation: Pick<CitedProvision, "label" | "heading">) =>
  citation.heading ? `${citation.label}: ${citation.heading}` : citation.label
