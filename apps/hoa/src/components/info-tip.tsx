import { InfoIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type InfoTipProps = {
  /** What the tip explains, for screen readers: "About who decides". */
  label: string
  children: ReactNode
}

/** A small info button that explains a field in a tooltip. */
export function InfoTip({ label, children }: InfoTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <InfoIcon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{children}</TooltipContent>
    </Tooltip>
  )
}
