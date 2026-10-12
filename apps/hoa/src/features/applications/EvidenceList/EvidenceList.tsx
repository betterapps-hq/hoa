import { useQuery } from "@tanstack/react-query"
import { FileTextIcon, ImageIcon } from "lucide-react"
import type { ReactNode } from "react"
import { ImageViewer } from "@/components/ImageViewer/ImageViewer"
import { cn } from "@/lib/utils"
import type { Evidence } from "@/schema/types"
import { opensInBrowser } from "../applicationFile"
import { evidenceFile, type ReviewContext } from "../reviewContext"

export type EvidenceListProps = {
  evidence: readonly Evidence[]
  context: Pick<ReviewContext, "files" | "loadImage" | "fileUrl">
}

function Thumbnail({
  fileId,
  name,
  loadImage
}: {
  fileId: string
  name: string
  loadImage: (id: string) => Promise<string>
}) {
  const { data: url } = useQuery({ queryKey: ["packet-image", fileId], queryFn: () => loadImage(fileId) })
  return url ? (
    <ImageViewer
      src={url}
      name={name}
      trigger={<img src={url} alt={name} className="h-20 w-28 rounded-md border object-cover" />}
    />
  ) : (
    <div className="h-20 w-28 shrink-0 animate-pulse rounded-md border bg-muted" aria-hidden />
  )
}

/** The file and page a quote came from: a link that opens the file there, when the browser can show it. */
function SourceLine({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const className = "flex w-fit max-w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      // The name and the page are separate pieces of the line; read together, as one place.
      aria-label={label}
      className={cn(
        className,
        "rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  )
}

/**
 * Where the review read something: the words quoted, then the file and its page, and the photo when it's one, which
 * opens at full size.
 */
export function EvidenceList({ evidence, context }: EvidenceListProps) {
  if (evidence.length === 0) {
    return null
  }
  return (
    <ul className="flex flex-col gap-4">
      {evidence.map((item, index) => {
        const file = evidenceFile(context, item.fileId)
        const name = file?.fileName ?? item.fileId
        const isPhoto = file?.mediaType.startsWith("image/") === true
        const Icon = isPhoto ? ImageIcon : FileTextIcon
        // A document the browser shows opens at the page it was read from; a photo opens from its thumbnail.
        const href =
          file && !isPhoto && context.fileUrl && opensInBrowser(file.mediaType)
            ? `${context.fileUrl(file.id)}${item.page === null ? "" : `#page=${item.page}`}`
            : null
        return (
          // Evidence has no id; a fact's list never reorders.
          <li key={index} className="flex gap-3 text-sm">
            {isPhoto && file && context.loadImage ? (
              <Thumbnail fileId={file.id} name={name} loadImage={context.loadImage} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1.5">
              {item.quote ? (
                <blockquote className="rounded-md border-l-2 bg-muted/50 px-3 py-1.5 break-words text-muted-foreground italic">
                  “{item.quote}”
                </blockquote>
              ) : null}
              <SourceLine href={href} label={item.page === null || isPhoto ? name : `${name}, page ${item.page}`}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={name}>
                  {name}
                </span>
                {item.page !== null && !isPhoto ? <span className="-ml-1.5 shrink-0">, page {item.page}</span> : null}
              </SourceLine>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
