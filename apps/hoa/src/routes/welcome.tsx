import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { authClient } from "@/auth/authClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/welcome")({
  staticData: { title: "Welcome" },
  component: WelcomeRoute
})

/** For someone signed in with an email no association's roll has yet (docs/design/people.md). */
function WelcomeRoute() {
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const email = session.status === "unaffiliated" ? session.user.email : ""
  const signOut = async () => {
    await authClient.signOut()
    await router.navigate({ to: "/sign-in" })
    await router.invalidate()
  }
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>Your association hasn&apos;t added you yet</h1>
          </CardTitle>
          <CardDescription>
            You&apos;re signed in as <span className="font-medium text-foreground">{email}</span>, but no association
            has this email on its roll. Ask your board or manager to add it, then come back.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void router.invalidate()}>Check again</Button>
          <Button variant="outline" render={<Link to="/account" />}>
            Account
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
