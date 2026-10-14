import { createContext, use, type ReactNode } from "react"
import type { Committee } from "@/people/people"
import type { SessionUser } from "@/session/session.functions"
import { doesWorkOf, navigationFor, roles, type NavSection, type Role, type RoleId } from "./roles"

type RoleContextValue = {
  role: Role
  user: SessionUser
  organizationId: string
  organizationName: string
  organizationLogo: string | null
  /** The organizations they can switch to, this one among them; empty with just one. */
  organizations: readonly { id: string; name: string; logo: string | null }[]
  /** False for one of the platform's operators looking at an organization whose roll they're not on. */
  isOnRoll: boolean
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
  organizationId: string
  organizationName: string
  organizationLogo: string | null
  organizations: readonly { id: string; name: string; logo: string | null }[]
  isOnRoll: boolean
  committees: readonly Pick<Committee, "name" | "kind">[]
}

/** The signed-in person's role, account, association and navigation, for the app shell. */
export function RoleProvider({ children, roleId, committees, ...shell }: RoleProviderProps) {
  return (
    <RoleContext
      value={{
        ...shell,
        role: roles[roleId],
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
