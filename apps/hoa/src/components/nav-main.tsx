import { Link, useRouterState } from "@tanstack/react-router"
import { ClipboardCheckIcon, FilesIcon, LayoutDashboardIcon, ScrollTextIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import type { NavItem } from "@/features/role/roles"

const icons: Record<NavItem["to"], typeof LayoutDashboardIcon> = {
  "/": LayoutDashboardIcon,
  "/documents": FilesIcon,
  "/rules": ScrollTextIcon,
  "/submit": ClipboardCheckIcon
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Design review</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = icons[item.to]
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton tooltip={item.title} isActive={pathname === item.to} render={<Link to={item.to} />}>
                  <Icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
