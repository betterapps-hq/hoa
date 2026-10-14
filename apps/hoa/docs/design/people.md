# People, accounts and organizations

An association's people: everyone on its roll, the homes they own, live in or rent, the board and committees they sit
on, and the accounts they sign in with.

## Two halves

**Better Auth** keeps accounts and who has one in each association:

| Table | Holds |
| --- | --- |
| `users`, `sessions`, `accounts`, `verifications` | Accounts, signed-in browsers, Google and password logins, email codes |
| `organizations` | Each association (the organization plugin's table), with the app's `settings_json` |
| `members` | Who has an account in an organization, and their role: `admin` manages it, `member` is everyone else |
| `invitations` | Who's been asked to join, with the role they'll have, until they join or it lapses (14 days) |
| `rate_limits` | Request counts for its rate limits |

**The app** keeps the roll, because most homeowners never make an account, yet dues, notices and votes need them all:

| Table | Holds |
| --- | --- |
| `people` | Everyone on the roll, with or without an account. `user_id` links the account once they join |
| `units`, `unit_people` | Homes, and who owns, lives in or rents each, from one day to another |
| `committees`, `committee_members` | The board and committees, and each seat: chair or member, an office such as President, and its term |

Everything else that belongs to an association carries its `organization_id`.

## Joining

Signing in joins every roll with the account's proven email (`peopleForAccount`, then `joinRolls`). The person is
linked to the account, and the account becomes a member with the role its invitation gave, or `member` without one;
the invitation is then accepted. Nobody has to click an invitation link: the roll is what decides who belongs.

A member who isn't on the roll, such as one the platform's operators added from Better Auth's dashboard, is put on it.

Someone in several associations is in the session's active organization (`sessions.active_organization_id`), or the
first they joined.

## Access and roles

- **Administrator:** a member with the `admin` role. Changes everything. An administrator's access changes only once
  they've joined; until then it's their invitation's. The roll keeps at least one administrator.
- **Committee work:** follows the seats someone holds today (`committeesInView`). The board reads the roll, adds
  people and keeps who owns, lives in or rents each home; the architectural committee works on applications and project
  types. An administrator does every committee's work.
- **The sidebar** has the organization's pages (People for the board), then a section for each committee whose work
  they do that has pages of its own, named as the association names it (`navigationFor`).

The platform's operators are separate: Better Auth's admin plugin, with `users.role` set to `admin`. They open any
association from the switcher atop the sidebar and work in it as an administrator without being on its roll
(`openOrganization`, which remembers it in a cookie of its own; a member's switch sets Better Auth's active
organization). There they can view the app as someone who's joined, under a yellow bar across the top with the way
back.

## Homes

Someone with no home on the roll can claim one nobody owns from their account page. The claim is one SQL statement, so
two people can't both win it. Changing a home's owner after that is the board's or an administrator's: recording a
sale ends the owners' ownership on the day and starts the buyer's; removing someone ends their time there on a day.
History stays: nothing on the roll is deleted, only ended or marked removed.

## Addresses

A unit's address is kept in parts: street, unit number, city, state and ZIP code. Typing the street searches Google's
Places API (New) from the server, near the association's other units first; picking a suggestion fills the other parts
and keeps the place's id and coordinates for the map. The unit's name follows the house number until someone types
one. Without `GOOGLE_MAPS_API_KEY` the search is off and the parts are typed.

## Storage

Stored files keep the `hoas/{organizationId}/…` prefix they were written under ([documents.md](documents.md)).
