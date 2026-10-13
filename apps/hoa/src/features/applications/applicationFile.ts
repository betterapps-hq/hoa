// Serving a packet file as the homeowner uploaded it (application-review.md, UX): its URL, and what opens in place.

/** Where a packet file is served: to save it, or to open it in the browser. */
export function applicationFileUrl(applicationId: string, fileId: string, options: { download?: boolean } = {}) {
  const path = `/files/applications/${encodeURIComponent(applicationId)}/${encodeURIComponent(fileId)}`
  return options.download ? `${path}?download` : path
}

/** The uploads a browser shows in place; anything else is saved, never rendered from the homeowner's bytes. */
export const opensInBrowser = (mediaType: string) =>
  mediaType === "application/pdf" || mediaType === "image/png" || mediaType === "image/jpeg"
