import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RoleProvider, useRole } from "./RoleProvider"

function CurrentRole() {
  const { role, user, organizationName, navigation } = useRole()
  return (
    <p>
      {role.name} at {organizationName} as {user.name}:{" "}
      {navigation
        .map((section) => `${section.label ?? "Home"} (${section.items.map((item) => item.title).join(", ")})`)
        .join(", ")}
    </p>
  )
}

describe("RoleProvider", () => {
  it("gives the shell the signed-in person's role, account and association", () => {
    render(
      <RoleProvider
        roleId="administrator"
        user={{ name: "Sam Rivera", email: "sam@example.com" }}
        organizationId="maple-hollow"
        organizationName="Maple Hollow"
        organizationLogo={null}
        organizations={[]}
        isOnRoll
        committees={[{ name: "Design Review", kind: "architectural" }]}
      >
        <CurrentRole />
      </RoleProvider>
    )
    expect(
      screen.getByText(
        "Administrator at Maple Hollow as Sam Rivera: Home (Dashboard), Organization (Violations, Ledger, Rulebook, People, Settings), Design Review (Applications, Project types)"
      )
    ).toBeInTheDocument()
  })

  it("requires the provider", () => {
    expect(() => render(<CurrentRole />)).toThrow("useRole must be used inside RoleProvider.")
  })
})
