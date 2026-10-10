import { dateText } from "../dashboard/dashboardDisplay"

/** "Out of date with the rulebook published Oct 12": the one line a type out of date with the rulebook shows. */
export const outdatedText = (publishedAt: string | null) =>
  publishedAt
    ? `Out of date with the rulebook published ${dateText(publishedAt)}`
    : "Out of date with the published rulebook"
