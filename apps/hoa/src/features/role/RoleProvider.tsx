import { createContext, use, type ReactNode } from "react"
import type { Committee } from "@/people/people"
import type { SessionUser } from "@/session/session.functions"
import { doesWorkOf, navigationFor, roles, type NavSection, type Role, type RoleId } from "./roles"

type RoleContextValue = {
  role: Role
  user: SessionUser
  organizationName: string
  /** The sidebar's sections, from their role and the committees whose work they do. */
  navigation: NavSection[]
  /** Whether they do a kind of committee's work (`doesWorkOf`). */
  doesWorkOf: (kind: Parameters<typeof doesWorkOf>[2]) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

export type RoleProviderProps = {
  children: ReactNode
  /** The signed-in person's role, from the server's session. */
  roleId: RoleId
  user: SessionUser
  organizationName: string
  committees: readonly Pick<Committee, "name" | "kind">[]
}

/** The signed-in person's role, account, association and navigation, for the app shell. */
export function RoleProvider({ children, roleId, user, organizationName, committees }: RoleProviderProps) {
  return (
    <RoleContext
      value={{
        role: roles[roleId],
        user,
        organizationName,
        navigation: navigationFor(roleId, committees),
        doesWorkOf: (kind) => doesWorkOf(roleId, committees, kind)
      }}
    >
      {children}
    </RoleContext>
  )
}

export function useRole() {
  const context = use(RoleContext)
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider.")
  }
  return context
}
