import { createContext, use, useState, type ReactNode } from "react"
import { roles, type Role, type RoleId } from "./roles"

type RoleContextValue = { role: Role; setRole: (role: RoleId) => void }

const RoleContext = createContext<RoleContextValue | null>(null)

export type RoleProviderProps = {
  children: ReactNode
  /** The role from the server's session. */
  roleId: RoleId
  /** Persists a new role; the app saves it in a cookie and reloads the route data. */
  onRoleChange: (role: RoleId) => void | Promise<void>
}

/** Holds the demo role. It switches immediately and is saved by `onRoleChange`. */
export function RoleProvider({ children, roleId, onRoleChange }: RoleProviderProps) {
  const [current, setCurrent] = useState(roleId)
  const setRole = (next: RoleId) => {
    setCurrent(next)
    void onRoleChange(next)
  }
  return <RoleContext value={{ role: roles[current], setRole }}>{children}</RoleContext>
}

export function useRole() {
  const context = use(RoleContext)
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider.")
  }
  return context
}
