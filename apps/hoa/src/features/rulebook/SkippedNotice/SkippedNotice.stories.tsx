import type { Meta, StoryObj } from "@storybook/react-vite"
import type { JobFailure } from "@/jobs/job"
import type { SkippedPart } from "../DraftReview/DraftReview.utils"
import { SkippedNotice } from "./SkippedNotice"

// What a build that completed with errors skipped, as `skippedParts` words it for the draft review.

const failures: JobFailure[] = [
  {
    stage: "structure-rules",
    itemId: "declaration:10#walls",
    message: "No object generated: response did not match schema."
  },
  {
    stage: "structure-rules",
    itemId: "declaration:10#derricks",
    message: "No object generated: response did not match schema."
  },
  { stage: "find-rules", itemId: "declaration:11", message: "Provider returned error 502" },
  { stage: "defined-terms", itemId: "declaration", message: "Request timed out" },
  { stage: "consolidate", itemId: "rulebook", message: "Provider returned error 429" }
]

const parts: SkippedPart[] = [
  {
    id: "structure-rules rule Declaration 10",
    text: "Declaration 10: 2 rules weren't drafted",
    details: [failures[0]?.message ?? "", failures[1]?.message ?? ""]
  },
  {
    id: "find-rules section Declaration 11",
    text: "Declaration 11: it wasn't read for rules",
    details: ["Provider returned error 502"]
  },
  {
    id: "defined-terms document CC&Rs",
    text: "Sudden Valley CC&Rs: its defined terms weren't read",
    details: ["Request timed out"]
  },
  {
    id: "consolidate",
    text: "The rules weren't checked against each other for conflicts",
    details: ["Provider returned error 429"]
  }
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
  args: { failures, parts }
} satisfies Meta<typeof SkippedNotice>

export default meta
type Story = StoryObj<typeof meta>

export const SeveralPlaces: Story = {}

export const OneRule: Story = {
  args: {
    failures: failures.slice(0, 1),
    parts: [{ id: "rule", text: "Declaration 10: a rule wasn't drafted", details: [failures[0]?.message ?? ""] }]
  }
}

/** The errors behind the list, for whoever looks into it. */
export const WhatWentWrong: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "What went wrong" }))
  }
}
