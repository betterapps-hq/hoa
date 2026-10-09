import type { Review, Settings } from "@/schema/types"

// What a rulebook's settings are where its documents say nothing (schema.md, Settings): the usual order of authority
// among governing documents, calendar days without rolling forward, no liability, cure or preconditions, and the
// decision policy and confidence thresholds the review starts from. A build replaces each clause its documents state.

const unreviewed: Review = { status: "proposed", by: null, at: null, note: null }

const defaultClauses: Settings["clauses"] = {
  precedence: {
    order: [
      ["statute", "ordinance"],
      ["declaration", "supplemental-declaration", "plat"],
      ["articles"],
      ["bylaws"],
      ["design-guidelines"],
      ["rules", "policy", "resolution"],
      ["minutes"]
    ],
    citations: []
  },
  // The demo's organization is in Washington; organizations don't record a time zone yet.
  time: {
    days: "calendar-day",
    rollForward: false,
    holidays: "us-federal",
    zone: "America/Los_Angeles",
    citations: []
  },
  liability: [],
  cure: null,
  deciders: [],
  sanctionPreconditions: []
}

const defaultPolicy: Settings["policy"] = {
  decisionPolicy: { "change-detail": "approve-with-conditions", redesign: "deny", none: "deny" },
  thresholds: { factConfidence: 0.8, judgmentConfidence: 0.8 }
}

/** A build's settings: the clauses its documents state over the defaults, proposed for review. */
export function buildSettings(clauses: Partial<Settings["clauses"]>, issues: Settings["issues"]): Settings {
  return { clauses: { ...defaultClauses, ...clauses }, policy: defaultPolicy, review: unreviewed, issues }
}
