import { Link, useRouterState } from "@tanstack/react-router"
import {
  ClipboardCheckIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon
} from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar"
import type { NavItem, NavSection } from "@/features/role/roles"
import { cn } from "@/lib/utils"

const icons: Record<NavItem["to"], typeof LayoutDashboardIcon> = {
  "/": LayoutDashboardIcon,
  "/rules": ScrollTextIcon,
  "/project-types": LayersIcon,
  "/applications": ClipboardCheckIcon,
  "/people": UsersIcon,
  "/settings": SettingsIcon
}

/** The sidebar's links: the dashboard on its own, then each section under its heading. */
export function NavMain({ sections }: { sections: NavSection[] }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { setOpenMobile } = useSidebar()
  // Stock groups pad 8px on every side and the content puts 8px between them, so after the dashboard's single link a
  // heading would sit 24px below it; the sections share one 8px gap instead, and the heading's own row spaces it.
  return sections.map((section, index) => (
    <SidebarGroup
      key={section.label ?? "home"}
      className={cn(index > 0 && "pt-0", index < sections.length - 1 && "pb-0")}
    >
      {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => {
            const Icon = icons[item.to]
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)}
                  render={<Link to={item.to} />}
                  // On a small screen the full navigation opens over the page; following a link closes it.
                  onClick={() => setOpenMobile(false)}
                >
                  <Icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ))
}
