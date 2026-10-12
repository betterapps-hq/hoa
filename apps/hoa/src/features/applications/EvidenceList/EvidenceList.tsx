import { useQuery } from "@tanstack/react-query"
import { FileTextIcon, ImageIcon } from "lucide-react"
import { ImageViewer } from "@/components/ImageViewer/ImageViewer"
import type { Evidence } from "@/schema/types"
import { evidenceFile, type ReviewContext } from "../reviewContext"

export type EvidenceListProps = {
  evidence: readonly Evidence[]
  context: Pick<ReviewContext, "files" | "loadImage">
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
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={name}>
                  {name}
                </span>
                {item.page !== null && !isPhoto ? <span className="-ml-1.5 shrink-0">, page {item.page}</span> : null}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
