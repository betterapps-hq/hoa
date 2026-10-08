import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { RoleProvider, useRole } from "./RoleProvider"
import { isRoleId, type RoleId } from "./roles"

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
  it("starts with the session's role, switches immediately and saves the choice", async () => {
    const onRoleChange = vi.fn<(role: RoleId) => Promise<void>>().mockResolvedValue(undefined)
    render(
      <RoleProvider roleId="homeowner" onRoleChange={onRoleChange}>
        <CurrentRole />
      </RoleProvider>
    )
    expect(screen.getByText(/^Homeowner:/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Switch" }))
    expect(screen.getByText(/^Administrator:/)).toBeInTheDocument()
    expect(onRoleChange).toHaveBeenCalledWith("administrator")
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
