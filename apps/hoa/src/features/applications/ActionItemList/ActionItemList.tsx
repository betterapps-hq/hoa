import type { ActionItem } from "@/review/reviewModel"
import { parseRuleMarkers } from "@/review/ruleMarkers"
import { MarkedText } from "../MarkedText/MarkedText"
import { actionItemId, entityLabel, type ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"

export type ActionItemListProps = {
  title: string
  description: string
  items: readonly ActionItem[]
  context: ReviewContext
}

const marks = (text: string, ruleKey: string) =>
  parseRuleMarkers(text).some((part) => part.type === "rule" && part.ruleKey === ruleKey)

/** One kind of action: each item in the writer's words, the things it covers, and its rule when the words don't name it. */
export function ActionItemList({ title, description, items, context }: ActionItemListProps) {
  if (items.length === 0) {
    return null
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="flex flex-col gap-3 text-sm">
        {items.map((item) => (
          // Only a finding's link focuses an item, after a click as often as a key, so it shows on any focus.
          <li
            key={item.id}
            id={actionItemId(item)}
            tabIndex={-1}
            className="flex flex-col gap-1 rounded-md border-l-2 py-1 pr-2 pl-3 outline-none focus:ring-2 focus:ring-ring/50"
          >
            <p>
              <MarkedText text={item.text} context={context} />
            </p>
            <p className="text-muted-foreground">{item.entities.map((id) => entityLabel(context, id)).join(", ")}</p>
            {marks(item.text, item.ruleKey) ? null : <ReviewRuleReference ruleKey={item.ruleKey} context={context} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
