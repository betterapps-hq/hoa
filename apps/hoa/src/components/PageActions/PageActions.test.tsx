import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PageActions, PageActionsProvider, PageActionsSlot, type PageActionsProps } from "./PageActions"

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }))

/** A window as wide as a phone or wider, for the media query the actions read. */
function windowWidth(isPhone: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: isPhone,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  }))
}

/** The page's actions put in a site header's slot, as the app lays them out. */
function renderInHeader(props: PageActionsProps) {
  render(
    <PageActionsProvider>
      <header>
        <PageActionsSlot />
      </header>
      <main>
        <PageActions {...props} />
      </main>
    </PageActionsProvider>
  )
  return { user: userEvent.setup(), actions: within(screen.getByRole("group", { name: "Page actions" })) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PageActions", () => {
  it("shows the page's actions in the site header, the main one filled and the rest in the menu", async () => {
    windowWidth(false)
    const add = vi.fn<() => void>()
    const discard = vi.fn<() => void>()
    const { user, actions } = renderInHeader({
      primary: { label: "Add", icon: PlusIcon, onSelect: add },
      secondary: { label: "Suggest", icon: SparklesIcon, onSelect: vi.fn<() => void>() },
      more: [{ label: "Discard", icon: Trash2Icon, isDestructive: true, onSelect: discard }]
    })
    expect(within(screen.getByRole("banner")).getByRole("group", { name: "Page actions" })).toBeInTheDocument()
    expect(within(screen.getByRole("main")).queryByRole("group")).not.toBeInTheDocument()
    expect(actions.getByRole("button", { name: "Suggest" })).toBeInTheDocument()
    await user.click(actions.getByRole("button", { name: "Add" }))
    expect(add).toHaveBeenCalledOnce()
    await user.click(actions.getByRole("button", { name: "More actions" }))
    await user.click(await screen.findByRole("menuitem", { name: "Discard" }))
    expect(discard).toHaveBeenCalledOnce()
  })

  it("moves the quieter action into the menu on a phone, first", async () => {
    windowWidth(true)
    const suggest = vi.fn<() => void>()
    const { user, actions } = renderInHeader({
      primary: { label: "Add", onSelect: vi.fn<() => void>() },
      secondary: { label: "Suggest", icon: SparklesIcon, onSelect: suggest },
      more: [{ label: "Discard", icon: Trash2Icon, isDestructive: true, onSelect: vi.fn<() => void>() }]
    })
    expect(actions.queryByRole("button", { name: "Suggest" })).not.toBeInTheDocument()
    await user.click(actions.getByRole("button", { name: "More actions" }))
    const [first] = await screen.findAllByRole("menuitem")
    expect(first).toHaveAccessibleName("Suggest")
    await user.click(first!)
    expect(suggest).toHaveBeenCalledOnce()
  })

  it("can't be pressed again while it's under way, and opens a link as a link", () => {
    windowWidth(false)
    const { actions } = renderInHeader({
      primary: { label: "Start an application", href: "/applications" },
      secondary: { label: "Suggest", icon: SparklesIcon, isBusy: true, onSelect: vi.fn<() => void>() }
    })
    expect(actions.getByRole("button", { name: /Suggest$/ })).toBeDisabled()
    expect(actions.getByRole("status", { name: "Loading" })).toBeInTheDocument()
    expect(actions.getByRole("link", { name: "Start an application" })).toHaveAttribute("href", "/applications")
  })
})
