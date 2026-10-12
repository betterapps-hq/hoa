// The generic kinds of page in an application packet, offered to page classification alongside the rulebook's own
// document types (application-review.md, Classify). A rulebook type with the same key replaces the generic one. They
// live outside the review code because a rulebook may define the same keys, and review code names no rulebook term.

export type DocumentKind = { key: string; labels: string[]; definition: string }

export const genericDocumentKinds: readonly DocumentKind[] = [
  {
    key: "application-form",
    labels: ["application form"],
    definition: "The association's application form, with numbered fields and signature lines."
  },
  { key: "photo", labels: ["photo", "photograph"], definition: "A photo of the property or of the proposed work." },
  {
    key: "product-specification",
    labels: ["product specification", "product sheet"],
    definition: "A manufacturer's page, brochure, or product image describing a material, color or style."
  },
  {
    key: "drawing",
    labels: ["drawing", "site plan", "plot plan", "floor plan", "elevation"],
    definition: "A drawing of the property or the work: a site or plot plan, a plat map, a floor plan or an elevation."
  },
  { key: "other", labels: ["other"], definition: "Anything else." }
]

/** The kind for a page nothing else fits. */
export const otherDocumentKind = "other"
