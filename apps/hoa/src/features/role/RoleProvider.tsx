import { createContext, use, type ReactNode } from "react"
import type { SessionUser } from "@/session/session.functions"
import { roles, type Role, type RoleId } from "./roles"

type RoleContextValue = { role: Role; user: SessionUser; hoaName: string }

const RoleContext = createContext<RoleContextValue | null>(null)

export type RoleProviderProps = {
  children: ReactNode
  /** The signed-in person's role, from the server's session. */
  roleId: RoleId
  user: SessionUser
  hoaName: string
}

/** The signed-in person's role, account and association, for the app shell. */
export function RoleProvider({ children, roleId, user, hoaName }: RoleProviderProps) {
  return <RoleContext value={{ role: roles[roleId], user, hoaName }}>{children}</RoleContext>
}

export function useRole() {
  const context = use(RoleContext)
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider.")
  }
  return context
}
