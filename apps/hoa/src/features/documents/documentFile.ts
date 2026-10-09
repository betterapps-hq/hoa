// Serving a governing document's uploaded file (encoding.md, UX, Documents): its URL, and the header that names it.

/** Where a governing document's original file is served: to save it, or to open it in the browser at a page. */
export function documentFileUrl(documentId: string, options: { download?: boolean; page?: number } = {}) {
  const path = `/files/governing/${encodeURIComponent(documentId)}`
  const query = options.download ? "?download" : ""
  return `${path}${query}${options.page ? `#page=${options.page}` : ""}`
}

/**
 * A Content-Disposition header that keeps the file's original name: an ASCII fallback for old clients and the exact
 * name, percent-encoded (RFC 6266 and RFC 8187).
 */
export function contentDisposition(disposition: "attachment" | "inline", fileName: string) {
  const fallback = fileName.replaceAll(/[^\x20-\x7e]|["\\]/g, "_")
  const encoded = encodeURIComponent(fileName).replaceAll(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
