import { createServerFn } from "@tanstack/react-start"
import { setCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import { roleIds, type RoleId } from "@/features/role/roles"
import { getRequestContext, roleCookie } from "./requestContext.server"

export type Session = { roleId: RoleId; hoaName: string; user: { name: string; email: string } }

/** The signed-in user, their role and their HOA, for the app shell. */
export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<Session> => {
  const context = await getRequestContext()
  return {
    roleId: context.role,
    hoaName: context.hoa.name,
    user: { name: context.user.name, email: context.user.email }
  }
})

/** Switches the demo role. The role lives in a cookie so server functions can check it. */
export const setDemoRole = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ roleId: z.enum(roleIds) }).parse(data))
  .handler(async ({ data }) => {
    setCookie(roleCookie, data.roleId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 })
  })
