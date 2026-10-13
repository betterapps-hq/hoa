import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type ImageViewerProps = {
  /** The image at full size; while it loads, the viewer holds its place. */
  src: string | undefined
  /** The file's name: the viewer's title and the image's alternative text. */
  name: string
  /** What opens it, such as a thumbnail. Without it, `open` and `onOpenChange` control the viewer. */
  trigger?: ReactNode
  /** The trigger's classes, such as its size. */
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** A photo as large as the screen allows, over the page; Escape or the close button returns to where it opened. */
export function ImageViewer({ src, name, trigger, className, open, onOpenChange }: ImageViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogTrigger
          aria-label={`View ${name}`}
          className={cn(
            "shrink-0 cursor-zoom-in rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
            className
          )}
        >
          {trigger}
        </DialogTrigger>
      ) : null}
      <DialogContent className="gap-3 p-4 sm:max-w-[min(92vw,72rem)]">
        <DialogTitle className="truncate pr-8 leading-7" title={name}>
          {name}
        </DialogTitle>
        {src ? (
          <img
            src={src}
            alt={name}
            className="mx-auto max-h-[calc(100dvh-9rem)] max-w-full rounded-md object-contain"
          />
        ) : (
          <Skeleton className="aspect-[4/3] w-full rounded-md" />
        )}
      </DialogContent>
    </Dialog>
  )
}
