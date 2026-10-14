# Product roadmap

The app is an AI-native HOA management platform built on each association's governing documents. Design review is
the module it starts with, not the whole product. The benchmark is PayHOA, the all-in-one platform many self-managed
associations use: to win them over, the app needs what PayHOA does day to day, and its own edge on top. What PayHOA
does is listed under [Compared with PayHOA](#compared-with-payhoa), from its website, help center and reviews.

## What sets it apart

Answering questions from an association's documents is common now: PayHOA's Penny (on its websites) and Gable (an
assistant for administrators, in beta) do it, and so do at least five other HOA platforms. The edge isn't a chatbot.
It's that this app turns the documents into a reviewed, published rulebook ([design/](design/README.md)), so every
module can **follow** that association's own rules, not just quote them:

- **Applications** are checked against the rules that apply, with each finding citing its provision
  ([design/application-review.md](design/application-review.md)).
- **Who decides** an application, and how: one named member, or a majority of the committee at a meeting with a quorum.
- **Deadlines:** an application approved by default when the committee doesn't act in time, appeal windows, notice
  periods before meetings and votes.
- **Thresholds:** quorum, and the share of owners an amendment or a special assessment needs.
- **Who maintains what:** the association or the owner, for a maintenance request.
- **Enforcement:** which rule a violation breaks, the cure period, hearing and appeal, and the fine schedule.

Each of these is proposed from the rulebook and confirmed by an administrator, so a wrong reading never acts on its
own. Few HOA tools apply the documents to decisions: CINC checks that architectural requests arrive complete,
HOALife sets up violation types from the documents, and HomeHerald (free up to 50 units) checks violation photos
against the covenants. The window is open, but not for long.

## Built

- **Governing documents:** upload with OCR, editions over time ([design/documents.md](design/documents.md)).
- **Rulebook:** the build that turns documents into rules, terms and vocabulary, and the editor to review and publish
  it ([design/encoding.md](design/encoding.md)).
- **Project types:** the questions and documents each kind of project asks for, form templates, and fees and
  signatures at the end ([design/document-requirements.md](design/document-requirements.md)).
- **Applications:** homeowners apply, upload files, and get an AI review against the rulebook; the committee decides
  ([design/application-review.md](design/application-review.md)).
- **Roles:** a demo switcher between a homeowner and an administrator. There are no real accounts or memberships yet.

## Modules

### 1. People

Everything else needs to know who owns what and who may do what.

- Units and lots, with their owners, residents and tenants (tenants with their own sign-in, which PayHOA lacks), a
  mailing address apart from the unit's, and tags and custom fields to group and filter them.
- Accounts and sign-in with two-step login, invitations, owners of several units under one login, and import from a
  spreadsheet or another platform (units, owners, opening balances); export of everything.
- **Change of ownership:** which balances and charges carry over, and the new owner not seeing the old owner's
  history.
- Roles: board members and officers, committee members, managers, owners, residents, and what each may see and do.
  PayHOA has no named roles, only read or edit per module.
- Committees (architectural, finance, social, rules): their members, chair and terms.
- A resident directory, each owner choosing what shows.

### 2. Notifications and messages

One notification system every module sends through.

- Email, text message, automated voice calls and WhatsApp; mailed letters (first class and certified) through a print
  and mail service. Each person picks their channels.
- Announcements to everyone, a committee, or a tag; templates with merge fields; scheduling.
- A log for each owner and unit of everything sent, and whether it was delivered, opened or bounced.
- Email from the association's own address, which PayHOA doesn't offer.
- Consent: text messages need recorded opt-in and carrier registration, and WhatsApp needs approved message templates,
  so both need setup time before launch.

### 3. Applications (extends what's built)

- **Neighbor sign-off:** the homeowner picks the neighbors a project needs; each gets the permission form and a copy
  of the application, and signs online. The signature attaches to the application. No HOA platform found offers this.
- **Online signatures** wherever a form asks for one (also the application's own signature).
- **Committee decisions** follow the association's "who decides" setting: any one member, named reviewers, or a
  majority vote. Any reviewer can ask for more information alone (it's low stakes, and in some associations it's what
  stops an application being approved by default). Approve, approve with conditions, or deny follows the authority
  setting: with a majority vote, one member proposes the decision and the others agree or object.
- Members with a conflict (the applicant's neighbor, say) step aside.
- A countdown to any approved-by-default deadline; appeals routed to the body the documents name (the board, or a
  rules committee first), with their deadlines.
- A resubmission shows the earlier decision and votes.
- The AI review stays advice to the committee, never the decision.

### 4. Money

- A ledger for each unit: what's owed, paid and credited, which owners see and export.
- Dues and special assessments, one-time or on a schedule; automatic payments by bank transfer or card through a
  payment provider (Stripe, say); one checkout for several units; paying ahead; early-payment discounts.
- Late fees and interest as the documents allow (flat, percentage or compounding; once or monthly), with reminders
  before and after the due date and monthly statements.
- Payment plans, credits, returned payments, writing off bad debt, and locking an account in collections.
- Checks: recorded by hand, or scanned through a bank lockbox.
- Fines: a violation becomes a charge on the unit's ledger, citing its rule and the fine schedule.
- Processing fees pass to whoever pays. PayHOA charges $2.45 a bank payment and 3.5% plus $0.50 a card payment, and
  its fees are a common complaint, so lower bank-payment fees are an opening.
- **QuickBooks sync** rather than full accounting at first. PayHOA has no QuickBooks connection and builds its own
  books instead. Its books are where its reviews are weakest (bank links that break, rigid reports, reserves by hand
  journal entries), so the full books can come later:
  - General ledger (cash or accrual), chart of accounts, bank feeds and reconciliation, budgets and budget against
    actual, reports and board packets.
  - Reserve funds, and later reserve studies.
  - Payables: vendor bills by email read automatically, approval chains, paying vendors, 1099s.

### 5. Violations

- Report a violation with photos, citing the rule it breaks; one violation can cover several units.
- Inspections on a phone, working offline, for walk-throughs and drive-bys. PayHOA has none.
- Notice letters, a cure period, a hearing or appeal, then a fine, as the documents set out, each step in the unit's
  history. Escalating through hearings and appeals is a weak spot in PayHOA's reviews.

### 6. Meetings and votes

- **Meetings:** agenda, notice sent within the documents' notice period, a calendar with reminders and Google Calendar
  sync, video-call links, attendance and quorum, minutes (the AI drafts them from notes), and motions with each
  member's recorded vote.
- **Owner ballots:** elections, amendments and special assessments; yes or no, choices, ranked choice; online, or
  mailed paper ballots counted with online votes; proxies, quorum, weighted votes and secret ballots; who may vote and
  the threshold each needs, from the documents.
- **Surveys,** anonymous or not.
- Two kinds of votes, kept apart: board or committee members voting on motions, and every owner voting on a ballot.

### 7. Maintenance requests

- Homeowners report what's wrong and where, with photos, for a common area or their own unit.
- The rulebook says whose job it is, citing the provision. When it's the owner's, the reply says so; when neglect
  breaks a rule, it can become a violation.
- Work orders to the manager, a committee or a vendor, with priority; quotes; the vendor's bill to payables and
  QuickBooks.
- Vendors' contracts and insurance certificates, with a warning before insurance lapses.
- Status updates through notifications; a history for each common area; recurring upkeep and the assets it's for,
  which later feed reserve planning.

### 8. Community

- **Owner portal:** balance and history, payments, applications and requests, violations and replies, documents,
  calendar and message boards, in one place.
- **Mobile app** for owners and the board. PayHOA has none yet (it told a reviewer in March 2026 one is coming), and
  reviews name it as a drawback.
- **Documents:** beyond the governing documents, folders for minutes, budgets and forms, shared with everyone, a
  group or a unit.
- **Message boards:** announcements only, a private board for the board or a committee, or open to every owner.
- **Website:** a public site with the association's documents and contacts, and its own address.
- **Amenity bookings:** rules on length, buffers and daily limits; fees and late-cancellation fees; waivers; approval
  when needed; deposits.
- **Resale documents:** title companies and lenders order the resale certificate and estoppel online; unpaid balances
  and move-in fees are collected at closing; the buyer becomes the owner on closing. PayHOA does this through
  HomeWiseDocs.
- Other languages for owners (Spanish first).

### 9. AI assistants

- **Owners:** questions answered from the rulebook with citations, in the portal and on the website (PayHOA's Penny
  answers from uploaded files instead).
- **Administrators:** an assistant that drafts replies, letters, minutes and board reports, sorts requests and codes
  transactions, with every action approved first (PayHOA's Gable, in beta, does this).
- **Their own AI:** let an association's own assistant (Claude, ChatGPT) read the rulebook and act through the app.

### Not planned

Gate and visitor access, package tracking, and short-term rental tracking: other platforms offer them, mostly for
condominiums and gated communities, and PayHOA doesn't.

## Build order

1. **People:** accounts, units, roles and committees. Every other module depends on it.
2. **Notifications:** every later module sends through it.
3. **Applications:** neighbor sign-off, online signatures and committee decisions, on the module that's built.
4. **Money:** payments, dues and autopay, fines, then the QuickBooks sync.
5. **Owner portal and documents,** as money and applications need somewhere for owners to see them.
6. **Meetings and votes.**
7. **Violations** with enforcement, and **maintenance requests.**
8. **Community:** message boards, website, amenity bookings, resale documents, the mobile app.
9. **Full books**, if associations want them over QuickBooks.

## Compared with PayHOA

Every PayHOA plan has every feature. What it does, and where this app stands:

| Area | PayHOA | This app |
| --- | --- | --- |
| Owners and units | Import, tags, custom fields, ownership change, tenants as contacts only | Planned: People |
| Roles | Read or edit per module, no named roles | Planned: People, with named roles and committees |
| Sign-in | One login for several units, optional two-step login | Planned: People |
| Invoices and dues | One-time and recurring, bulk by tag, emailed or mailed | Planned: Money |
| Payments | Stripe bank and card, autopay, lockbox, pass-through fees | Planned: Money |
| Late fees and collections | Flat, percentage or compounding; reminders; payment plans; account lock | Planned: Money |
| Books | Ledger, chart of accounts, bank feeds, reconciliation (with AI), budgets, 30+ reports, board packets | QuickBooks sync first; full books later |
| Payables | Invoice inbox read automatically, approval chains, mailed checks, 1099s | Later, with full books |
| Banking | Account with vendor bank payments and spend cards (beta) | Not planned |
| Bookkeeping and tax filing | Paid service from $199 a month; 1120-H from $399 | Not planned (a partner, later) |
| Messages | Email, text, voice calls, delivery log, scheduling | Planned: Notifications, plus WhatsApp and the association's own email address |
| Mail | Letters, statements and checks by post | Planned: Notifications |
| Message boards | Open, private and announcement boards | Planned: Community |
| Website | Builder, its own address, Penny chatbot | Planned: Community and AI assistants |
| Calendar | Events, reminders, Google Calendar | Planned: Meetings |
| Violations | Photos, statuses that change the letter, fines, mailing | Planned: Violations, plus enforcement steps and phone inspections |
| Requests | Custom forms, statuses, named approvers approve or deny | **Built** for applications, with AI review; maintenance planned |
| Documents | Unlimited folders, sharing by group or unit | Governing documents **built**; folders planned |
| Voting and surveys | Ranked choice, paper ballots with QR codes, quorum, weighted, anonymous | Planned: Meetings and votes, plus thresholds from the documents |
| Meetings and minutes | Minutes stored as documents only | Planned: Meetings, with AI-drafted minutes |
| Owner portal | Balance, payments, requests, violations, documents | Planned: Community |
| Mobile app | None ("in the works") | Planned: Community |
| Amenities | Bookings with rules, fees, waivers and approval | Planned: Community |
| Resale documents | Through HomeWiseDocs | Planned: Community |
| AI | Penny for owners, Gable for administrators (beta), AI bank reconciliation | Rulebook and application review **built**; assistants planned |
| Management companies | One login across associations | Later |
| QuickBooks | No connection | Planned: Money |
| E-signatures | Waivers accepted by click only | Planned: Applications |

### Where PayHOA is weak

From reviews on Capterra, G2, Software Advice and BBB (about 4.7 of 5 overall):

- Bugs and slow fixes that disrupt books and payments: the most common complaint.
- Bank links through Plaid that break or miss transactions, especially at small banks.
- Processing fees owners find high and confusing.
- Rigid reports, and reserves and adjustments done by hand.
- No mobile app.
- Basic violation escalation and approval workflows.

What users praise: support that answers quickly, a low price against a management company, and ease of use.

## Pricing

To start, match PayHOA's pay scale: a flat monthly price for the association by its number of units, with every
feature in every plan. PayHOA's tiers, from [payhoa.com/pricing](https://www.payhoa.com/pricing):

| Units | Monthly | Billed yearly, per month |
| --- | --- | --- |
| 0–25 | $54 | $49 |
| 26–50 | $65 | $59 |
| 51–100 | $109 | $99 |
| 101–150 | $142 | $129 |
| 151–200 | $186 | $169 |
| 201–300 | $219 | $199 |
| 301–400 | $252 | $229 |
| 401–500 | $275 | $249 |
| Over 500 | $0.55 a unit ($275 minimum) | the same |

PayHOA also includes onboarding and moving an association's data in, with no setup fee. A small association's year
is $600 to $1,300, so the rulebook build and each AI review have to stay a small share of it. HomeHerald is free up to
50 units.

## Open questions

- Can a committee vote without a meeting (by email, say), or only where the documents allow it?
- Who pays card and bank fees: the owner paying, or the association?
- Is WhatsApp needed at launch, or after email and text?
- Full books, or QuickBooks for good? It decides whether payables and budgets are ever built.

## Sources

- PayHOA: [features](https://www.payhoa.com/features), [pricing](https://www.payhoa.com/pricing),
  [FAQ](https://www.payhoa.com/about/faq/), [help center](https://intercom.help/payhoa/en/).
- Reviews: [Capterra](https://www.capterra.com/p/146693/PayHOA/reviews/),
  [G2](https://www.g2.com/products/payhoa/reviews),
  [Software Advice](https://www.softwareadvice.com/product/61833-PayHOA/reviews/).
- Other platforms' AI: [Vantaca](https://www.vantaca.com/), [CINC](https://cincsystems.com/),
  [TownSq](https://www.townsq.io/ai), [Condo Control](https://www.condocontrol.com/solutions/ai/),
  [HomeHerald](https://www.producthunt.com/products/homeherald).
