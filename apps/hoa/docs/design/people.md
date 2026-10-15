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

## Terms

Each `committee_members` row is one term in a seat: chair or member, an office (President, Vice President, Secretary,
Treasurer, or another title), the day it starts, the day it's due to end (`term_ends_on`) and the day it did
(`ended_on`). Someone keeps the seat past the term's end, as bylaws usually have directors serve until their successors
take office, so a late election never takes the board's access away; the seat says the term ended. An administrator
corrects a term in place, starts someone's next term (which ends the last on the day the next starts, and keeps it as
one they served), or ends the seat on a day. Someone resigns from their own seat, from their account or the committee's
card, today or on a later day (`resignSeat`), as bylaws let a director do by notice; the board's last member can't, so
the board is never left with nobody on it.

## Addresses

Every address is kept in parts: street, unit number, city, state and ZIP code. A unit's and the association's are
columns (`addressColumns`); a person's mailing address, which they need only when mail shouldn't go to their unit, is
JSON (`mailing_address_json`), null without one. Every form edits one with the same fields (`AddressFields`): typing
the street searches Google's Places API (New) from the server, near the association's other units first; picking a
suggestion fills the other parts and keeps the place's id and coordinates for the map. It searches only once someone
types, so opening a form doesn't. A mailing address starts as a button that opens its fields, and removing it empties
them. A unit's name follows the house number until someone types one. Without `GOOGLE_MAPS_API_KEY` the search is off
and the parts are typed.

## Settings

An administrator keeps what the documents don't say on the Settings page: the association's name, logo and mailing
address, whether forms measure in US or metric units, and how long decided applications and unsent drafts are kept.
What the documents decide, such as the review policy and the time zone, is the rulebook's settings.

The logo is a PNG, JPEG or WebP image of 1 MB or less, kept at `hoas/{organizationId}/logo`. It's served publicly, like
any logo, at a URL that changes with each upload, so browsers keep it for good. Without one, the association's initials
show.

Deleting the association, after typing its name, deletes its records in every table with an `organization_id`, its
memberships and invitations, and every file under its prefix (`deleteOrganization`). Sessions that had it open open
none, and the accounts stay.

## Deleting an account

Someone deletes their own account from the account page: Better Auth's `deleteUser` takes its sign-in methods,
sessions and memberships, and invitations it sent that are still waiting. Each association keeps the person on its roll,
unlinked (`people.user_id` is cleared), so signing in again with the same email makes a new account that joins the
same rolls. It needs a sign-in in the last day, else they sign in again first, and it's refused while the account is
an association's only administrator (`organizationsOnlyAdministeredBy`), until there's another or the association is
deleted.

## Storage

Stored files keep the `hoas/{organizationId}/…` prefix they were written under ([documents.md](documents.md)).
