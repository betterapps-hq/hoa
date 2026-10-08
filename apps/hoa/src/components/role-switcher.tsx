import { ChevronsUpDownIcon, HomeIcon, ShieldCheckIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"
import { roleIds, roles, type RoleId } from "@/features/role/roles"

const roleIcons: Record<RoleId, typeof HomeIcon> = {
  homeowner: HomeIcon,
  administrator: ShieldCheckIcon
}

/** Switches between the homeowner and administrator workspaces for the demo. */
export function RoleSwitcher() {
  const { isMobile } = useSidebar()
  const { role, setRole } = useRole()
  const ActiveIcon = roleIcons[role.id]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <ActiveIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{role.name}</span>
              <span className="truncate text-xs">{role.description}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
              {roleIds.map((id) => {
                const Icon = roleIcons[id]
                return (
                  <DropdownMenuItem key={id} onClick={() => setRole(id)} className="gap-2 p-2">
                    <div className="flex size-6 items-center justify-center rounded-md border">
                      <Icon className="size-3.5" />
                    </div>
                    {roles[id].name}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
