import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RoleProvider, useRole } from "./RoleProvider"

function CurrentRole() {
  const { role, user, hoaName, navigation } = useRole()
  return (
    <p>
      {role.name} at {hoaName} as {user.name}:{" "}
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
        hoaName="Maple Hollow"
        committees={[{ name: "Design Review", kind: "architectural" }]}
      >
        <CurrentRole />
      </RoleProvider>
    )
    expect(
      screen.getByText(
        "Administrator at Maple Hollow as Sam Rivera: Home (Dashboard), Design Review (Applications, Project types), Organization (Rulebook, People)"
      )
    ).toBeInTheDocument()
  })

  it("requires the provider", () => {
    expect(() => render(<CurrentRole />)).toThrow("useRole must be used inside RoleProvider.")
  })
})
