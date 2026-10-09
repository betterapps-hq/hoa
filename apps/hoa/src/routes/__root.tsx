import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router"
import { ThemeProvider } from "next-themes"
import { useState, type ReactNode } from "react"
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RoleProvider } from "@/features/role/RoleProvider"
import { getSession, setDemoRole } from "@/session/session.functions"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "HOA design review" }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
  loader: () => getSession(),
  shellComponent: RootDocument,
  component: RootLayout
})

type RootDocumentProps = {
  children: ReactNode
}

function RootDocument({ children }: RootDocumentProps) {
  return (
    // next-themes sets the theme class on <html> before React hydrates, so React must not compare it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

// Sidebar and header sizes from shadcn's dashboard-01 block.
const layoutStyle: Record<string, string> = {
  "--sidebar-width": "calc(var(--spacing) * 72)",
  "--header-height": "calc(var(--spacing) * 12)"
}

/** The shadcn dashboard-01 layout: inset sidebar, site header and a container-query content column. */
function RootLayout() {
  const session = Route.useLoaderData()
  const router = useRouter()
  const [queryClient] = useState(() => new QueryClient())
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <RoleProvider
          roleId={session.roleId}
          onRoleChange={async (roleId) => {
            await setDemoRole({ data: { roleId } })
            await router.invalidate()
          }}
        >
          <TooltipProvider>
            <SidebarProvider style={layoutStyle}>
              <AppSidebar variant="inset" />
              <SidebarInset>
                <SiteHeader />
                <div className="flex flex-1 flex-col">
                  <div className="@container/main flex flex-1 flex-col gap-2">
                    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                      <ErrorBoundary FallbackComponent={AppError}>
                        <Outlet />
                      </ErrorBoundary>
                    </div>
                  </div>
                </div>
              </SidebarInset>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </RoleProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

function AppError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="px-4 lg:px-6">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "An unexpected error occurred."}
      </p>
      <Button className="mt-4" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  )
}
