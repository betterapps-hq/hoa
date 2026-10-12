import { Link, useRouterState } from "@tanstack/react-router"
import { ClipboardCheckIcon, LayersIcon, LayoutDashboardIcon, ScrollTextIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import type { NavItem, NavSection } from "@/features/role/roles"

const icons: Record<NavItem["to"], typeof LayoutDashboardIcon> = {
  "/": LayoutDashboardIcon,
  "/rules": ScrollTextIcon,
  "/project-types": LayersIcon,
  "/applications": ClipboardCheckIcon
}

/** The sidebar's links: the dashboard on its own, then each section under its heading. */
export function NavMain({ sections }: { sections: NavSection[] }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return sections.map((section) => (
    <SidebarGroup key={section.label ?? "home"}>
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
