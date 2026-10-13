import { AttachmentMedia } from "@/components/ui/attachment"
import { fileTypeOf, type FileFamily } from "./FileTypeMedia.utils"

// Tailwind palette tints, as the status colors use them: red for PDFs, blue for Word, green for photos.
const tints: Record<FileFamily, string> = {
  pdf: "bg-red-500/10 text-red-600 dark:text-red-400",
  word: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  image: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  other: "text-muted-foreground"
}

export type FileTypeMediaProps = { fileName: string; mediaType?: string }

/** An attachment's media for a file: its extension on a tile tinted by its kind. The name beside it says the rest. */
export function FileTypeMedia({ fileName, mediaType }: FileTypeMediaProps) {
  const { label, family } = fileTypeOf(fileName, mediaType)
  return (
    <AttachmentMedia className={tints[family]}>
      <span aria-hidden className="text-[0.625rem] leading-none font-semibold tracking-wide">
        {label}
      </span>
    </AttachmentMedia>
  )
}
