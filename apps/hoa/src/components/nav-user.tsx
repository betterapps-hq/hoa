import { EllipsisVerticalIcon, HomeIcon, ShieldCheckIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"
import { roles } from "@/features/role/roles"
import { ThemeSubmenu } from "@/features/theme/ThemeSubmenu"

/** The demo user for the active role, with a shortcut to the other workspace. */
export function NavUser() {
  const { isMobile } = useSidebar()
  const { role, setRole } = useRole()
  const other = role.id === "homeowner" ? roles.administrator : roles.homeowner
  const OtherIcon = other.id === "homeowner" ? HomeIcon : ShieldCheckIcon

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}>
            <Avatar className="size-8 rounded-lg grayscale">
              <AvatarFallback className="rounded-lg">{role.user.initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{role.user.name}</span>
              <span className="truncate text-xs text-foreground/70">{role.user.email}</span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarFallback className="rounded-lg">{role.user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{role.user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {role.name}, {role.user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setRole(other.id)}>
                <OtherIcon />
                Switch to {other.name.toLowerCase()}
              </DropdownMenuItem>
              <ThemeSubmenu />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
