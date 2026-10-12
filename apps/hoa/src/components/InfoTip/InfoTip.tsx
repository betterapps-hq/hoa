import { CircleHelpIcon, InfoIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type InfoTipProps = {
  /** The button's accessible name: "Help with the height". */
  label: string
  children: ReactNode
  /** "help" for help answering (a question mark), "info" for an explanation (an i). */
  icon?: "help" | "info"
}

/**
 * A small explanation beside something: it opens on hover, focus and Enter, and on a tap, so it works with a mouse,
 * a keyboard and a touch screen alike, and its text stays readable while the pointer moves into it.
 */
export function InfoTip({ label, children, icon = "help" }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          />
        }
      >
        {icon === "help" ? <CircleHelpIcon /> : <InfoIcon />}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-80 max-w-[calc(100vw-2rem)] gap-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}
