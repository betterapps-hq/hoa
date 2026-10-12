import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { SkippedNotice } from "./SkippedNotice"

// What processing that completed with errors skipped, as `skippedParts` words it for the draft review.

const parts: SkippedPart[] = [
  {
    id: "structure-rules rule Declaration 10",
    place: { label: "Declaration 10", href: "/documents/declaration?provision=declaration%3A10" },
    text: "2 rules not drafted"
  },
  {
    id: "find-rules section Declaration 11",
    place: { label: "Declaration 11", href: "/documents/declaration?provision=declaration%3A11" },
    text: "not read for rules"
  },
  {
    id: "defined-terms document CC&Rs",
    place: { label: "Sudden Valley CC&Rs", href: "/documents/declaration" },
    text: "defined terms not read"
  },
  { id: "consolidate", place: null, text: "Rules not checked for conflicts" }
]

const meta = {
  component: SkippedNotice,
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    )
  ],
  args: { parts, onRetry: fn() }
} satisfies Meta<typeof SkippedNotice>

export default meta
type Story = StoryObj<typeof meta>

export const SeveralPlaces: Story = {}

export const OneRule: Story = {
  args: { parts: parts.slice(0, 1).map((part) => ({ ...part, text: "1 rule not drafted" })) }
}

/** While the documents are processed again, there's nothing to try. */
export const TryingAgain: Story = {
  render: (args) => <SkippedNotice {...args} onRetry={null} />
}
