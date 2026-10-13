import type { ComponentProps } from "react"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { RoleSwitcher } from "@/components/role-switcher"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"

/**
 * The app's navigation. Collapsed, it keeps a rail of icons (each link's name as a tooltip), the workspace's icon and
 * the user's avatar, so everything stays a click away; on a phone it opens over the page instead.
 */
export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { role } = useRole()
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <RoleSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={role.navigation} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
