import { useQuery } from "@tanstack/react-query"
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
    <img src={url} alt={name} className="h-20 w-28 shrink-0 rounded-md border object-cover" />
  ) : (
    <div className="h-20 w-28 shrink-0 animate-pulse rounded-md border bg-muted" aria-hidden />
  )
}

/** Where the review read something: the file, its page, the words quoted, and the photo when it's one. */
export function EvidenceList({ evidence, context }: EvidenceListProps) {
  if (evidence.length === 0) {
    return null
  }
  return (
    <ul className="flex flex-col gap-2">
      {evidence.map((item, index) => {
        const file = evidenceFile(context, item.fileId)
        const name = file?.fileName ?? item.fileId
        const isPhoto = file?.mediaType.startsWith("image/") === true
        return (
          // Evidence has no id; a fact's list never reorders.
          <li key={index} className="flex gap-3 text-sm">
            {isPhoto && file && context.loadImage ? (
              <Thumbnail fileId={file.id} name={name} loadImage={context.loadImage} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="break-words text-muted-foreground">
                {name}
                {item.page !== null && !isPhoto ? `, page ${item.page}` : ""}
              </span>
              {item.quote ? (
                <blockquote className="border-l-2 pl-3 break-words italic">“{item.quote}”</blockquote>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
