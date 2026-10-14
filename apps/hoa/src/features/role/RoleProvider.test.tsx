import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RoleProvider, useRole } from "./RoleProvider"

function CurrentRole() {
  const { role, user, hoaName } = useRole()
  return (
    <p>
      {role.name} at {hoaName} as {user.name}:{" "}
      {role.navigation
        .flatMap((section) => section.items)
        .map((item) => item.title)
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
      >
        <CurrentRole />
      </RoleProvider>
    )
    expect(
      screen.getByText(
        "Administrator at Maple Hollow as Sam Rivera: Dashboard, Applications, Project types, Rulebook, People"
      )
    ).toBeInTheDocument()
  })

  it("requires the provider", () => {
    expect(() => render(<CurrentRole />)).toThrow("useRole must be used inside RoleProvider.")
  })
})
