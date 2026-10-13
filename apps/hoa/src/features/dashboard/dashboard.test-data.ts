import type { DashboardApplication } from "./dashboardData"

/** A synthetic application as the dashboards read it: a draft started Oct 1, with whatever the test overrides. */
export const dashboardApplication = (overrides: Partial<DashboardApplication> = {}): DashboardApplication => ({
  id: "application",
  projectTypeLabel: "Deck",
  description: "A deck behind the house.",
  status: "draft",
  createdAt: "2026-10-01T15:00:00.000Z",
  updatedAt: "2026-10-01T15:00:00.000Z",
  revisedAt: "2026-10-01T15:00:00.000Z",
  submittedAt: null,
  decision: null,
  reviews: [],
  missingInformation: [],
  ...overrides
})

/** A decision as the committee records it. */
export const decision = (
  outcome: NonNullable<DashboardApplication["decision"]>["outcome"],
  decidedAt: string,
  note: string | null = null
): DashboardApplication["decision"] => ({ outcome, decidedAt, note })
