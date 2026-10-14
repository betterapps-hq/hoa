import { HomeIcon, ShieldCheckIcon } from "lucide-react"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"

/** The association the signed-in person belongs to, and their role in it, atop the sidebar. */
export function AssociationHeader() {
  const { role, hoaName } = useRole()
  const Icon = role.id === "administrator" ? ShieldCheckIcon : HomeIcon
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" render={<div />} className="hover:bg-transparent active:bg-transparent">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Icon className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{hoaName}</span>
            <span className="truncate text-xs">{role.name}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
