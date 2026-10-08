import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { RoleProvider, useRole } from "./RoleProvider"
import { isRoleId } from "./roles"

function CurrentRole() {
  const { role, setRole } = useRole()
  return (
    <>
      <p>
        {role.name}: {role.navigation.map((item) => item.title).join(", ")}
      </p>
      <button type="button" onClick={() => setRole(role.id === "homeowner" ? "administrator" : "homeowner")}>
        Switch
      </button>
    </>
  )
}

describe("RoleProvider", () => {
  afterEach(() => {
    localStorage.clear()
  })

  it("starts as a homeowner, switches roles and remembers the choice", async () => {
    const { unmount } = render(
      <RoleProvider>
        <CurrentRole />
      </RoleProvider>
    )
    expect(screen.getByText("Homeowner: Dashboard, Submit a project")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Switch" }))
    expect(screen.getByText("Administrator: Dashboard, Rulebook, Review an application")).toBeInTheDocument()
    unmount()

    render(
      <RoleProvider>
        <CurrentRole />
      </RoleProvider>
    )
    expect(await screen.findByText(/^Administrator/)).toBeInTheDocument()
  })

  it("ignores an unknown stored role", async () => {
    localStorage.setItem("hoa-demo-role", "superuser")
    render(
      <RoleProvider>
        <CurrentRole />
      </RoleProvider>
    )
    expect(await screen.findByText(/^Homeowner/)).toBeInTheDocument()
  })

  it("requires the provider", () => {
    expect(() => render(<CurrentRole />)).toThrow("useRole must be used inside RoleProvider.")
  })
})

describe("isRoleId", () => {
  it("accepts only the demo roles", () => {
    expect(isRoleId("administrator")).toBe(true)
    expect(isRoleId("guest")).toBe(false)
  })
})
