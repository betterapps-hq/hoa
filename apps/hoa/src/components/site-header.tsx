import { useMatches } from "@tanstack/react-router"
import { PageActionsSlot } from "@/components/PageActions/PageActions"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useRole } from "@/features/role/RoleProvider"

/**
 * The dashboard header: sidebar toggle, the current page's title and the page's actions (ux.md, Page actions). It stays
 * at the top while the page scrolls, so the page's actions are always in reach.
 */
export function SiteHeader() {
  const title = useMatches({
    select: (matches) => matches.findLast((match) => match.staticData.title)?.staticData.title
  })
  const { organizationName } = useRole()
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 rounded-t-xl border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="truncate text-base font-medium">{title ?? organizationName}</h1>
        <PageActionsSlot />
      </div>
    </header>
  )
}
