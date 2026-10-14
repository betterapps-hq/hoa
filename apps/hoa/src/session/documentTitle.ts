import type { Session } from "./session.functions"

/**
 * The browser tab's title: the page, then the association it belongs to, so someone with several associations open
 * can tell the tabs apart. Before someone joins an association, just the page.
 */
export function documentTitle(page: string | undefined, session: Session | undefined): string {
  const association = session?.status === "member" ? session.hoaName : null
  return [page, association].filter(Boolean).join(" | ")
}
