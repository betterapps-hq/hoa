import type { ComponentProps, ReactNode } from "react"
import { AssociationHeader } from "@/components/association-header"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"

/**
 * The app's navigation. Collapsed, it keeps a rail of icons (each link's name as a tooltip), the association's icon and
 * the user's avatar, so everything stays a click away. On a small screen the rail stays, and the header's toggle opens
 * the full navigation over the page.
 */
export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { role } = useRole()
  const navigation = (
    <>
      <SidebarHeader>
        <AssociationHeader />
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={role.navigation} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </>
  )
  return (
    <>
      <SmallScreenRail variant={props.variant}>{navigation}</SmallScreenRail>
      <Sidebar collapsible="icon" {...props}>
        {navigation}
        <SidebarRail />
      </Sidebar>
    </>
  )
}

/**
 * Below shadcn's mobile breakpoint the sidebar only opens over the page, so this keeps its collapsed rail in the layout.
 * It carries the data attributes shadcn gives a collapsed icon sidebar, so the same menu components draw themselves as
 * icons; CSS shows it only below that breakpoint, so it's there before the page hydrates.
 */
function SmallScreenRail({
  variant,
  children
}: {
  variant: ComponentProps<typeof Sidebar>["variant"]
  children: ReactNode
}) {
  return (
    <div
      className="group text-sidebar-foreground md:hidden"
      data-state="collapsed"
      data-collapsible="icon"
      data-variant={variant}
      data-side="left"
      data-slot="sidebar"
    >
      <div
        data-sidebar="sidebar"
        data-slot="sidebar-inner"
        className="sticky top-0 flex h-svh w-(--sidebar-width-icon) flex-col bg-sidebar"
      >
        {children}
      </div>
    </div>
  )
}
