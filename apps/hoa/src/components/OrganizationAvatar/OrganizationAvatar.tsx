import { cn } from "cn"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { organizationHue, organizationInitials } from "./OrganizationAvatar.utils"

type OrganizationAvatarProps = {
  organization: { id: string; name: string; logo: string | null }
  size?: "default" | "sm"
  className?: string
}

/** An association's logo or, without one, its initials on a color of its own, so each is told apart at a glance. */
export function OrganizationAvatar({ organization, size = "default", className }: OrganizationAvatarProps) {
  return (
    <Avatar size={size} className={cn("rounded-lg after:rounded-lg", className)}>
      {organization.logo ? <AvatarImage src={organization.logo} alt="" className="rounded-lg" /> : null}
      <AvatarFallback
        className="rounded-lg font-medium text-white"
        style={{ backgroundColor: `oklch(0.55 0.12 ${organizationHue(organization.id)})` }}
      >
        {organizationInitials(organization.name)}
      </AvatarFallback>
    </Avatar>
  )
}
