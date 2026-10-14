// Deleting an account (docs/design/people.md, Deleting an account): its sign-in methods, sessions and access go; each
// association keeps the person on its roll.

/** How recently someone must have signed in to delete their account without signing in again. */
export const freshSignInSeconds = 60 * 60 * 24

/** Whether a session began recently enough to delete its account (`freshSignInSeconds`). */
export const isFreshSignIn = (session: { createdAt: Date }, now: Date) =>
  now.getTime() - session.createdAt.getTime() < freshSignInSeconds * 1000

const listFormat = new Intl.ListFormat("en-US", { type: "conjunction" })

/** Why an account that's an association's only administrator can't be deleted yet, naming the associations. */
export const lastAdministratorText = (associations: readonly string[]) =>
  `You’re the only administrator of ${listFormat.format(associations)}. Make someone else an administrator, or delete the association, first.`
