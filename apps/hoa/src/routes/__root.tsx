import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRootRoute, HeadContent, Outlet, redirect, Scripts } from "@tanstack/react-router"
import { ThemeProvider } from "next-themes"
import { useState, type ReactNode } from "react"
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { AppSidebar } from "@/components/app-sidebar"
import { PageActionsProvider } from "@/components/PageActions/PageActions"
import { UnitSystemProvider } from "@/components/QuantityInput/QuantityInput"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RoleProvider } from "@/features/role/RoleProvider"
import { documentTitle } from "@/session/documentTitle"
import { getSession, type Session } from "@/session/session.functions"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  // Signed out, every page but sign-in goes to sign-in; signed in with an email no roll has, to the welcome page.
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    const path = location.pathname
    if (session.status === "signed-out" && path !== "/sign-in") {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } })
    }
    if (session.status === "unaffiliated" && path !== "/welcome" && path !== "/account") {
      throw redirect({ to: "/welcome" })
    }
    if (session.status === "member" && path === "/welcome") {
      throw redirect({ to: "/" })
    }
    return { session }
  },
  loader: ({ context }) => context.session,
  // After the loader, so TypeScript knows its data. The tab's title is the page's own (its staticData title), then the
  // association's name.
  head: ({ matches, loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: documentTitle(matches.findLast((match) => match.staticData.title)?.staticData.title, loaderData) }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
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

/** The app's providers, and the members' shell or, for sign-in and the welcome page, the page alone. */
function RootLayout() {
  const session = Route.useLoaderData()
  const [queryClient] = useState(() => new QueryClient())
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {session.status === "member" ? (
          <MemberShell session={session} />
        ) : (
          <TooltipProvider>
            <Outlet />
            <Toaster />
          </TooltipProvider>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  )
}

/** The shadcn dashboard-01 layout: inset sidebar, site header and a container-query content column. */
function MemberShell({ session }: { session: Extract<Session, { status: "member" }> }) {
  return (
    <RoleProvider roleId={session.roleId} user={session.user} hoaName={session.hoaName}>
      <TooltipProvider>
        <SidebarProvider style={layoutStyle}>
          <AppSidebar variant="inset" />
          {/* min-w-0 lets the page narrow beside the small-screen rail instead of running past the edge. */}
          <SidebarInset className="min-w-0">
            <PageActionsProvider>
              <SiteHeader />
              <div className="flex flex-1 flex-col">
                <div className="@container/main flex flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                    <ErrorBoundary FallbackComponent={AppError}>
                      <UnitSystemProvider value={session.unitSystem}>
                        <Outlet />
                      </UnitSystemProvider>
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </PageActionsProvider>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </RoleProvider>
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
