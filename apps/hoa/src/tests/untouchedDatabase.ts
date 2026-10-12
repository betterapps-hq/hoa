import { createDatabase } from "@/db/database"

/**
 * A database that code under test must never reach, such as a permission check made before any query: every query
 * throws, so a test fails if the code goes on past it.
 */
export function untouchedDatabase() {
  const refuse = (): never => {
    throw new Error("The code under test reached the database.")
  }
  return createDatabase({ prepare: refuse, batch: refuse, exec: refuse, withSession: refuse, dump: refuse })
}
