import { useLocalStorage } from "@mantine/hooks"
import { createContext, use, type ReactNode } from "react"
import { isRoleId, roles, type Role, type RoleId } from "./roles"

type RoleContextValue = { role: Role; setRole: (role: RoleId) => void }

const RoleContext = createContext<RoleContextValue | null>(null)

export type RoleProviderProps = {
  children: ReactNode
  initialRole?: RoleId
}

/** Holds the demo role, remembered in this browser. */
export function RoleProvider({ children, initialRole = "homeowner" }: RoleProviderProps) {
  const [roleId, setRoleId] = useLocalStorage<RoleId>({
    key: "hoa-demo-role",
    defaultValue: initialRole,
    deserialize: (value) => (isRoleId(value) ? value : initialRole),
    serialize: (value) => value
  })
  return <RoleContext value={{ role: roles[roleId], setRole: setRoleId }}>{children}</RoleContext>
}

export function useRole() {
  const context = use(RoleContext)
  if (!context) {
    throw new Error("useRole must be used inside RoleProvider.")
  }
  return context
}
