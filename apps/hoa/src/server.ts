import handler from "@tanstack/react-start/server-entry"

// The Worker entry: TanStack Start handles requests, and the Workflow classes are exported for their bindings.
export { ApplicationReview } from "./workflows/applicationReview.server"
export { DocumentIngest } from "./workflows/documentIngest.server"
export { RulebookBuild } from "./workflows/rulebookBuild.server"

export default {
  fetch: (request: Request) => handler.fetch(request)
} satisfies ExportedHandler<Env>
