import { createFileRoute, redirect } from "@tanstack/react-router"

/** The governing documents live with the rulebook built from them (encoding.md, UX). */
export const Route = createFileRoute("/documents/")({
  beforeLoad: () => {
    throw redirect({ to: "/rules", replace: true })
  }
})
