import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { toast } from "sonner"
import { OrganizationAvatar } from "@/components/OrganizationAvatar/OrganizationAvatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"
import { switchOrganization } from "@/session/session.functions"

/**
 * The association the signed-in person is in, and their role in it, atop the sidebar. Someone who can open others (a
 * member of several, or one of the platform's operators) switches here.
 */
export function AssociationHeader() {
  const { role, organizationId, organizationName, organizationLogo, organizations, isOnRoll } = useRole()
  const { isMobile } = useSidebar()
  const current = (
    <>
      <OrganizationAvatar organization={{ id: organizationId, name: organizationName, logo: organizationLogo }} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{organizationName}</span>
        <span className="truncate text-xs">{isOnRoll ? role.name : "Operator"}</span>
      </div>
    </>
  )
  const open = async (id: string) => {
    try {
      await switchOrganization({ data: { id } })
      // A full load, so nothing of the last association stays on the page.
      window.location.assign("/")
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "That didn't work. Try again.")
    }
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {organizations.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}>
              {current}
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-96 min-w-56 overflow-y-auto"
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
            >
              {organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.id}
                  onClick={() => (organization.id === organizationId ? undefined : void open(organization.id))}
                >
                  <OrganizationAvatar organization={organization} size="sm" />
                  <span className="truncate">{organization.name}</span>
                  {organization.id === organizationId ? <CheckIcon className="ml-auto" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SidebarMenuButton size="lg" render={<div />} className="hover:bg-transparent active:bg-transparent">
            {current}
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
