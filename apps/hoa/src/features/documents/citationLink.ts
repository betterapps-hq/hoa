// Where a citation opens (docs/ux.md, Citations): the document reader's route, at the cited provision, with the other
// citations of the same rule to step through. One contract for every link to the reader.

/** The reader's search params: the provision it opens at, and the citations to step through, comma separated. */
export type ReaderSearch = { provision?: string; cites?: string }

/**
 * The reader's search params from a URL's, keeping only well-formed values. `cites` lists provision keys; the
 * provision it opens at is added to it when missing.
 */
export function readerSearch(search: Record<string, unknown>): ReaderSearch {
  const provision = typeof search.provision === "string" && search.provision !== "" ? search.provision : undefined
  const cites = typeof search.cites === "string" && search.cites !== "" ? search.cites : undefined
  return { ...(provision ? { provision } : {}), ...(cites ? { cites } : {}) }
}

/** The provision keys `cites` lists, in order, without blanks or repeats. */
export const citesOf = (cites: string | undefined): string[] => [
  ...new Set((cites ?? "").split(",").filter((key) => key !== ""))
]

/**
 * The reader's URL: `/documents/$documentId`, at a provision (highlighted, scrolled into view) when one is given, with
 * `cites` when there are several citations to step through.
 */
export function citationHref(documentId: string, provisionKey?: string | null, cites?: readonly string[]) {
  const params = new URLSearchParams()
  if (provisionKey) {
    params.set("provision", provisionKey)
  }
  if (cites && cites.length > 1) {
    params.set("cites", cites.join(","))
  }
  const query = params.toString()
  return `/documents/${encodeURIComponent(documentId)}${query ? `?${query}` : ""}`
}

/**
 * The document a cited provision is read in: the upload its text was read from, or its document's key when it has no
 * pages (a document whose text came from a rules file); the reader accepts either.
 */
export const citationDocumentId = (citation: { provisionKey: string; anchors: readonly { fileId: string }[] }) =>
  citation.anchors[0]?.fileId ?? citation.provisionKey.slice(0, Math.max(0, citation.provisionKey.indexOf(":")))

/** The reader's URL at a cited provision, with the other citations to step through. */
export const citedProvisionHref = (
  citation: { provisionKey: string; anchors: readonly { fileId: string }[] },
  cites?: readonly string[]
) => citationHref(citationDocumentId(citation), citation.provisionKey, cites)

/** The document, provision and citations a reader URL opens at; null for a URL that isn't the reader's. */
export function readerTargetOf(href: string) {
  const url = new URL(href, "http://reader.invalid")
  const [, documents, documentId, ...rest] = url.pathname.split("/")
  if (documents !== "documents" || !documentId || rest.length > 0) {
    return null
  }
  const search = readerSearch(Object.fromEntries(url.searchParams))
  return {
    documentId: decodeURIComponent(documentId),
    provision: search.provision ?? null,
    cites: citesOf(search.cites)
  }
}
