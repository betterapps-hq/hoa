import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { gardenStructure } from "../applications.test-data"
import { StartApplicationPage, type StartApplicationPageProps } from "./StartApplicationPage"

function setup(overrides: Partial<StartApplicationPageProps> = {}) {
  const props: StartApplicationPageProps = {
    projectTypes: [gardenStructure],
    onStart: vi.fn<StartApplicationPageProps["onStart"]>(async () => undefined),
    onBack: vi.fn<() => void>(),
    ...overrides
  }
  render(<StartApplicationPage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("StartApplicationPage", () => {
  it("offers the organization's project types and something else, with what each covers", () => {
    setup()
    expect(within(screen.getByRole("radiogroup")).getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByText("Building or changing a structure in the yard.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("starts a draft of the chosen kind", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    await user.click(screen.getByRole("button", { name: "Start the application" }))
    expect(props.onStart).toHaveBeenCalledWith("type-1")
  })

  it("starts one for something else, which has no project type", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    await user.click(screen.getByRole("button", { name: "Start the application" }))
    expect(props.onStart).toHaveBeenCalledWith(null)
  })

  it("asks for a choice first, and says why a draft wasn't started", async () => {
    const { props, user } = setup({
      onStart: vi.fn<StartApplicationPageProps["onStart"]>(async () => {
        throw new Error("Not now.")
      })
    })
    await user.click(screen.getByRole("button", { name: "Start the application" }))
    expect(screen.getByText("Choose the kind of project, or Something else.")).toBeInTheDocument()
    expect(props.onStart).not.toHaveBeenCalled()
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    await user.click(screen.getByRole("button", { name: "Start the application" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Not now.")
  })

  it("goes back to the applications", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Applications" }))
    expect(props.onBack).toHaveBeenCalled()
  })
})
