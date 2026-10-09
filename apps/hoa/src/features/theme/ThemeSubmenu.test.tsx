import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "next-themes"
import { afterEach, describe, expect, it } from "vitest"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ThemeSubmenu } from "./ThemeSubmenu"

function renderMenu() {
  render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DropdownMenu>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ThemeSubmenu />
        </DropdownMenuContent>
      </DropdownMenu>
    </ThemeProvider>
  )
}

async function openThemes() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Account" }))
  await user.click(await screen.findByRole("menuitem", { name: "Theme" }))
}

describe("ThemeSubmenu", () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.className = ""
  })

  it("follows the device's setting until a theme is chosen", async () => {
    renderMenu()
    await openThemes()

    expect(await screen.findByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true")
  })

  it("applies and remembers a theme chosen from the keyboard", async () => {
    renderMenu()
    const user = userEvent.setup()
    screen.getByRole("button", { name: "Account" }).focus()

    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Theme" })).toHaveFocus())
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveFocus())
    await user.keyboard("{ArrowDown}{Enter}")

    expect(document.documentElement).toHaveClass("dark")
    expect(localStorage.getItem("theme")).toBe("dark")
  })
})
