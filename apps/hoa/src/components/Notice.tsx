import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export type NoticeProps = {
  tone: "info" | "success" | "warning" | "danger"
  children: ReactNode
}

const icons = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleAlertIcon
}

/** shadcn's Alert with an icon per tone. Only warnings and errors interrupt screen readers. */
export function Notice({ tone, children }: NoticeProps) {
  const Icon = icons[tone]
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
    >
      <Icon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
