import { DownloadIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { documentFileUrl } from "../documentFile"

export type DocumentDownloadProps = {
  documentId: string
  /** The document's title, so the button names the file it saves. */
  title: string
}

/** A quiet icon button that saves a governing document's original upload under its own name. */
export function DocumentDownload({ documentId, title }: DocumentDownloadProps) {
  return (
    <a
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      href={documentFileUrl(documentId, { download: true })}
      download
      aria-label={`Download ${title}`}
      title="Download"
    >
      <DownloadIcon aria-hidden />
    </a>
  )
}
