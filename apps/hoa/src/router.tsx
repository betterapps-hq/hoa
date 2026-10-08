import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The page title shown in the site header. */
    title?: string
  }
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent"
  })
}
