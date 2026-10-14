import handler from "@tanstack/react-start/server-entry"
import { postEveryonesDues } from "./jobs/postDues.server"

// The Worker entry: TanStack Start handles requests, the daily Cron Trigger posts dues, and the Workflow classes are
// exported for their bindings.
export { ApplicationReview } from "./workflows/applicationReview.server"
export { DocumentIngest } from "./workflows/documentIngest.server"
export { RulebookBuild } from "./workflows/rulebookBuild.server"

export default {
  fetch: (request: Request) => handler.fetch(request),
  scheduled: (_controller, _env, context) => {
    context.waitUntil(postEveryonesDues())
  }
} satisfies ExportedHandler<Env>
