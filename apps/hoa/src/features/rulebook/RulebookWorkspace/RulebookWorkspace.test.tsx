import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { mockActions, noPages, sampleRecords } from "@/tests/rulebookWorkspace"
import { RulebookWorkspace } from "./RulebookWorkspace"

describe("RulebookWorkspace", () => {
  it("opens a rule's card from any rule link, and moves between tabs", async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RulebookWorkspace
          records={sampleRecords()}
          source={noPages}
          actions={mockActions()}
          audience="administrator"
        />
      </QueryClientProvider>
    )
    await user.type(screen.getByRole("searchbox", { name: "Search rules" }), "55 or older")
    await user.click(screen.getByRole("button", { name: "Each occupied Unit has someone 55 or older" }))
    const sheet = await screen.findByRole("dialog", { name: "Each occupied Unit has someone 55 or older" })
    expect(within(sheet).getByRole("region", { name: "Statement" })).toBeInTheDocument()
    expect(within(sheet).getByRole("button", { name: "Approve" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("tab", { name: "Questions" }))
    expect(screen.getByText(/7 of 7 to answer/)).toBeInTheDocument()
  })

  it("shows a member the rules and terms only, read-only", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RulebookWorkspace records={sampleRecords()} source={noPages} actions={null} audience="member" />
      </QueryClientProvider>
    )
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Rules", "Terms"])
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument()
  })
})
