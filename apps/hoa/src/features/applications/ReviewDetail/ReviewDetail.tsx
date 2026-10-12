import type { ReactNode } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export type ReviewDetailProps = { value: string; title: string; meta?: string; children: ReactNode }

/** One section of the application page behind disclosure: a plain title, a quiet count, and the content on demand. */
export function ReviewDetail({ value, title, meta, children }: ReviewDetailProps) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 pr-2">
          <span>{title}</span> {meta ? <span className="font-normal text-muted-foreground">{meta}</span> : null}
        </span>
      </AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  )
}
