import { createFileRoute } from "@tanstack/react-router"
import { getAuth } from "@/auth/auth.server"

/** Better Auth's endpoints: sign-in codes, passwords, Google's redirect and sessions (docs/design/people.md). */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => getAuth().handler(request),
      POST: async ({ request }) => getAuth().handler(request)
    }
  }
})
