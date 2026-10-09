import { DownloadIcon, ExternalLinkIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { documentFileUrl } from "../documentFile"

export type DocumentFileLinksProps = {
  documentId: string
  /** The document's title, so each link names the file it opens. */
  title: string
  /** With this, "Open the original" opens the file at this page, where the browser's viewer supports it. */
  page?: number
}

const linkClass = buttonVariants({ variant: "ghost", size: "sm" })

/**
 * Quiet links to a governing document's original upload: save it under its own name and, from a page of it, open it in
 * the browser at that page.
 */
export function DocumentFileLinks({ documentId, title, page }: DocumentFileLinksProps) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {page === undefined ? null : (
        <a className={linkClass} href={documentFileUrl(documentId, { page })} target="_blank" rel="noreferrer">
          <ExternalLinkIcon aria-hidden />
          Open the original
          <span className="sr-only">
            {" "}
            of {title} in a new tab, at page {page}
          </span>
        </a>
      )}
      <a className={linkClass} href={documentFileUrl(documentId, { download: true })} download>
        <DownloadIcon aria-hidden />
        Download
        <span className="sr-only"> {title}</span>
      </a>
    </span>
  )
}
