import {
  BuildingIcon,
  HandshakeIcon,
  HomeIcon,
  EyeIcon,
  MailIcon,
  ShieldCheckIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon
} from "lucide-react"
import { useMemo, useState, type ComponentProps, type ReactNode } from "react"
import { toast } from "sonner"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { PageActions } from "@/components/PageActions/PageActions"
import { RowActions } from "@/components/RowActions/RowActions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSearch } from "@/lib/search"
import {
  accessLabels,
  committeeKindLabels,
  relationLabels,
  seatLabel,
  type Access,
  type Committee,
  type CommitteeKind,
  type CommitteeRole,
  type Person,
  type Unit,
  type UnitRelation
} from "@/people/people"
import { phoneText } from "@/people/phone"
import {
  committeeViews,
  personRows,
  accountStatusLabels,
  unitRows,
  type PersonRow,
  type RollData,
  type UnitRow
} from "@/people/roll"
import { AssignmentsDialog, CommitteeDialog, MemberDialog } from "../CommitteeDialogs/CommitteeDialogs"
import { EndDialog, type EndChoice } from "../EndDialog/EndDialog"
import { PersonDialog, type PersonSave } from "../PersonDialog/PersonDialog"
import type { RollChoice } from "../RollPicker/RollPicker"
import { UnitDialog, UnitPeopleDialog } from "../UnitDialogs/UnitDialogs"

/** The People page's changes, each throwing an Error that says what went wrong. */
export type PeopleActions = {
  savePerson: (id: string | null, person: PersonSave["person"]) => Promise<Person>
  removePerson: (id: string) => Promise<void>
  invite: (id: string, access: Access) => Promise<void>
  saveUnit: (id: string | null, unit: { label: string; address: string; lot: string }) => Promise<void>
  removeUnit: (id: string) => Promise<void>
  addToUnit: (link: { unitId: string; personId: string; relation: UnitRelation; startedOn: string }) => Promise<void>
  leaveUnit: (linkId: string, endedOn: string) => Promise<void>
  recordSale: (unitId: string, buyerId: string, soldOn: string) => Promise<void>
  saveCommittee: (id: string | null, committee: { name: string; kind: CommitteeKind }) => Promise<void>
  dissolveCommittee: (id: string) => Promise<void>
  addToCommittee: (member: {
    committeeId: string
    personId: string
    role: CommitteeRole
    office: string
    startedOn: string
  }) => Promise<void>
  leaveCommittee: (memberId: string, endedOn: string) => Promise<void>
  /** For the platform's operators: views the app as someone who's joined; null for everyone else. */
  viewAs: ((userId: string) => Promise<void>) | null
}

type Open =
  | { kind: "person"; person: Person | null }
  | { kind: "unit"; unit: Unit | null }
  | { kind: "unit-people"; unit: Unit; mode: "add" | "sale" }
  | { kind: "committee"; committee: Committee | null }
  | { kind: "member"; committee: Committee }
  | { kind: "assignments"; personId: string }
  | {
      kind: "end"
      title: string
      legend: string
      choices: EndChoice[]
      run: (choiceId: string, endedOn: string) => Promise<void>
    }
  | { kind: "confirm"; title: string; description: string; confirm: string; run: () => Promise<void> }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/** Today, where the viewer is: YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString("en-CA")

/**
 * The association's people (docs/design/people.md): everyone on its roll and whether they can sign in yet, the units
 * and who owns, lives in or rents each, and the board and committees. An administrator changes all of it; the board
 * adds people and keeps who owns, lives in or rents each home.
 */
export function PeoplePage({
  roll,
  actions,
  isAdministrator,
  viewerId
}: {
  roll: RollData
  actions: PeopleActions
  isAdministrator: boolean
  /** The signed-in person on the roll. */
  viewerId: string | null
}) {
  const today = localToday()
  const [tab, setTab] = useState("people")
  const [open, setOpen] = useState<Open | null>(null)
  const close = () => setOpen(null)
  const attempt = async (run: () => Promise<void>, success?: string) => {
    try {
      await run()
      if (success) {
        toast.success(success)
      }
    } catch (caught) {
      toast.error(messageOf(caught))
      throw caught
    }
  }
  const people = useMemo(() => personRows(roll, today), [roll, today])
  const units = useMemo(() => unitRows(roll, today), [roll, today])
  const committees = useMemo(() => committeeViews(roll, today), [roll, today])
  const personChoices: RollChoice[] = people.map(({ person, units: homes }) => ({
    value: person.id,
    label: person.name,
    detail: [person.email, homes[0]?.unit.label].filter(Boolean).join(", ") || null
  }))
  const unitChoices: RollChoice[] = roll.units.map((unit) => ({
    value: unit.id,
    label: unit.label,
    detail: unit.lot ?? unit.address
  }))
  const confirm = (title: string, description: string, label: string, run: () => Promise<void>) =>
    setOpen({ kind: "confirm", title, description, confirm: label, run })
  const endSeat = (title: string, choices: EndChoice[]) =>
    setOpen({
      kind: "end",
      title,
      legend: "Which",
      choices,
      run: (memberId, endedOn) => attempt(() => actions.leaveCommittee(memberId, endedOn), "Ended.")
    })
  // The page's main action adds what the open tab lists; the board adds people only.
  const adds = [
    { label: "Add person", icon: UserPlusIcon, onSelect: () => setOpen({ kind: "person", person: null }) },
    { label: "Add unit", icon: HomeIcon, onSelect: () => setOpen({ kind: "unit", unit: null }) },
    { label: "Add committee", icon: UsersIcon, onSelect: () => setOpen({ kind: "committee", committee: null }) }
  ]
  const addFor = (shown: string) => {
    if (!isAdministrator || shown === "people") {
      return adds[0]
    }
    return shown === "units" ? adds[1] : adds[2]
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <PageActions primary={addFor(tab)} more={isAdministrator ? adds.filter((add) => add !== addFor(tab)) : []} />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
        <TabsList variant="line" aria-label="People">
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="committees">Committees</TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <PeopleTable
            rows={people}
            actions={
              isAdministrator
                ? {
                    onEdit: (person) => setOpen({ kind: "person", person }),
                    onInvite: (person, access) =>
                      void attempt(() => actions.invite(person.id, access), `Invited ${person.name}.`).catch(
                        () => undefined
                      ),
                    viewerId,
                    onViewAs: actions.viewAs
                      ? (userId) =>
                          void attempt(async () => {
                            await actions.viewAs?.(userId)
                          }).catch(() => undefined)
                      : null,
                    onAssign: (person) => setOpen({ kind: "assignments", personId: person.id }),
                    onRemove: (person) =>
                      confirm(
                        `Remove ${person.name}?`,
                        "Their homes and assignments end today. History stays.",
                        "Remove",
                        () => attempt(() => actions.removePerson(person.id), `Removed ${person.name}.`)
                      )
                  }
                : null
            }
          />
        </TabsContent>
        <TabsContent value="units">
          <UnitsTable
            rows={units}
            onAdd={(unit) => setOpen({ kind: "unit-people", unit, mode: "add" })}
            onSale={(unit) => setOpen({ kind: "unit-people", unit, mode: "sale" })}
            onRemoveSomeone={(row) =>
              setOpen({
                kind: "end",
                title: `Remove from ${row.unit.label}`,
                legend: "Who",
                choices: row.people.map(({ person, link }) => ({
                  id: link.id,
                  title: person.name,
                  subtitle: relationLabels[link.relation]
                })),
                run: (linkId, endedOn) => attempt(() => actions.leaveUnit(linkId, endedOn), "Removed.")
              })
            }
            administration={
              isAdministrator
                ? {
                    onEdit: (unit) => setOpen({ kind: "unit", unit }),
                    onRemove: (unit) =>
                      confirm(`Remove ${unit.label}?`, "Everyone's link to it ends today.", "Remove", () =>
                        attempt(() => actions.removeUnit(unit.id), `Removed ${unit.label}.`)
                      ),
                    onAddUnit: () => setOpen({ kind: "unit", unit: null })
                  }
                : null
            }
          />
        </TabsContent>
        <TabsContent value="committees" className="flex flex-col gap-4">
          {committees.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="No committees yet"
              description="Start with the board."
              action={
                isAdministrator ? (
                  <Button onClick={() => setOpen({ kind: "committee", committee: null })}>Add committee</Button>
                ) : null
              }
            />
          ) : (
            committees.map(({ committee, members }) => (
              <Card key={committee.id}>
                <CardHeader>
                  <CardTitle>
                    <h2>{committee.name}</h2>
                  </CardTitle>
                  <CardDescription>{committeeKindLabels[committee.kind]}</CardDescription>
                  {isAdministrator ? (
                    <CardAction>
                      <RowActions
                        name={committee.name}
                        actions={[
                          {
                            label: "Add member",
                            icon: UserPlusIcon,
                            onSelect: () => setOpen({ kind: "member", committee })
                          },
                          {
                            label: "Edit",
                            icon: PencilIcon,
                            onSelect: () => setOpen({ kind: "committee", committee })
                          },
                          {
                            label: "Dissolve",
                            icon: Trash2Icon,
                            isDestructive: true,
                            onSelect: () =>
                              confirm(
                                `Dissolve ${committee.name}?`,
                                "Its members' terms end today. Its history stays.",
                                "Dissolve",
                                () =>
                                  attempt(
                                    () => actions.dissolveCommittee(committee.id),
                                    `${committee.name} is dissolved.`
                                  )
                              )
                          }
                        ]}
                      />
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  ) : (
                    <ul className="flex flex-col divide-y">
                      {members.map(({ member, person }) => (
                        <li key={member.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium">{person.name}</span>
                            <span className="text-sm text-muted-foreground">{seatLabel(member)}</span>
                          </div>
                          {isAdministrator ? (
                            <RowActions
                              name={person.name}
                              actions={[
                                {
                                  label: "End term",
                                  icon: UserMinusIcon,
                                  isDestructive: true,
                                  onSelect: () =>
                                    endSeat(`End ${person.name}'s term`, [
                                      { id: member.id, title: committee.name, subtitle: seatLabel(member) }
                                    ])
                                }
                              ]}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {open?.kind === "person" ? (
        <PersonDialog
          person={open.person}
          access={people.find((row) => row.person.id === open.person?.id && row.status === "joined")?.access ?? null}
          units={unitChoices}
          canGrantAccess={isAdministrator}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onSave={async ({ person, home }) => {
            await attempt(
              async () => {
                const saved = await actions.savePerson(open.person?.id ?? null, person)
                if (home) {
                  await actions.addToUnit({ ...home, personId: saved.id, startedOn: "" })
                }
              },
              open.person ? "Saved." : `Added ${person.name}.`
            )
          }}
        />
      ) : null}
      {open?.kind === "unit" ? (
        <UnitDialog
          unit={open.unit}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onSave={(unit) =>
            attempt(() => actions.saveUnit(open.unit?.id ?? null, unit), open.unit ? "Saved." : `Added ${unit.label}.`)
          }
        />
      ) : null}
      {open?.kind === "unit-people" ? (
        <UnitPeopleDialog
          unit={open.unit}
          mode={open.mode}
          people={personChoices}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onSave={({ personId, relation, day }) =>
            open.mode === "sale"
              ? attempt(() => actions.recordSale(open.unit.id, personId, day), "Sale recorded.")
              : attempt(() => actions.addToUnit({ unitId: open.unit.id, personId, relation, startedOn: day }))
          }
        />
      ) : null}
      {open?.kind === "end" ? (
        <EndDialog
          title={open.title}
          legend={open.legend}
          choices={open.choices}
          today={today}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onEnd={({ id, endedOn }) => open.run(id, endedOn)}
        />
      ) : null}
      {open?.kind === "committee" ? (
        <CommitteeDialog
          committee={open.committee}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onSave={(committee) =>
            attempt(
              () => actions.saveCommittee(open.committee?.id ?? null, committee),
              open.committee ? "Saved." : `Added ${committee.name}.`
            )
          }
        />
      ) : null}
      {open?.kind === "member" ? (
        <MemberDialog
          committee={open.committee}
          people={personChoices}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onSave={(member) => attempt(() => actions.addToCommittee(member), "Added.")}
        />
      ) : null}
      {open?.kind === "assignments" ? (
        <AssignmentsFor
          row={people.find((row) => row.person.id === open.personId)}
          committees={roll.committees}
          onOpenChange={(isOpen) => (isOpen ? undefined : close())}
          onAdd={(member) => attempt(() => actions.addToCommittee(member), "Added.")}
          onEnd={(memberId) => attempt(() => actions.leaveCommittee(memberId, today), "Ended.")}
        />
      ) : null}
      {open?.kind === "confirm" ? (
        <AlertDialog open onOpenChange={(isOpen) => (isOpen ? undefined : close())}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{open.title}</AlertDialogTitle>
              <AlertDialogDescription>{open.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  close()
                  void open.run().catch(() => undefined)
                }}
              >
                {open.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

/** Someone's assignments, from their row as the roll has it now, so an add or end shows at once. */
function AssignmentsFor({
  row,
  committees,
  ...props
}: { row: PersonRow | undefined } & Omit<ComponentProps<typeof AssignmentsDialog>, "person" | "seats">) {
  if (!row) {
    return null
  }
  return (
    <AssignmentsDialog
      person={row.person}
      seats={row.committees.map(({ committee, member }) => ({
        memberId: member.id,
        committee: committee.name,
        label: seatLabel(member)
      }))}
      committees={committees.filter((committee) => !row.committees.some((seat) => seat.committee.id === committee.id))}
      {...props}
    />
  )
}

function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  )
}

function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        placeholder={label}
        className="pl-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

const personColumn = dataTableColumns<PersonRow>()

/** What an administrator does to someone on the roll, from their row. */
type PersonRowActions = {
  onEdit: (person: Person) => void
  onInvite: (person: Person, access: Access) => void
  /** For the platform's operators: views the app as someone else who's joined. */
  onViewAs: ((userId: string) => void) | null
  viewerId: string | null
  /** Their seats on the board and committees, to add or end. */
  onAssign: (person: Person) => void
  onRemove: (person: Person) => void
}

type PeopleTableProps = {
  rows: readonly PersonRow[]
  /** Null for the board, which can't change someone. */
  actions: PersonRowActions | null
}

function PeopleTable({ rows, actions }: PeopleTableProps) {
  const [query, setQuery] = useState("")
  const search = useMemo(
    () =>
      createSearch(rows, {
        id: (row) => row.person.id,
        fields: {
          name: { text: (row) => row.person.name, boost: 3 },
          email: { text: (row) => row.person.email ?? "" },
          phone: { text: (row) => (row.person.phone ? `${row.person.phone} ${phoneText(row.person.phone)}` : "") },
          units: { text: (row) => row.units.map(({ unit }) => `${unit.label} ${unit.lot ?? ""}`).join(" ") }
        }
      }),
    [rows]
  )
  const joined = rows.filter((row) => row.status === "joined").length
  const columns = personColumns(actions)
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.person.id}
      label="People"
      noun="people"
      search={{ query, ids: search.ids }}
      initialSorting={[{ id: "name", desc: false }]}
      toolbar={<SearchBox label="Search people" value={query} onChange={setQuery} />}
      renderSummary={(shown) => (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length === rows.length
            ? `${rows.length === 1 ? "1 person" : `${rows.length} people`} on the roll, ${joined} joined.`
            : `${shown.length} of ${rows.length} people.`}
        </p>
      )}
      empty={rows.length === 0 ? "Nobody is on the roll yet. Add a person to start." : "Nobody matches."}
    />
  )
}

/** A line of a cell's list and, under it, what it is: a home and how they hold it, a committee and their seat. */
function Titled({ title, subtitle }: { title: ReactNode; subtitle: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span>{title}</span>
      <span className="text-muted-foreground">{subtitle}</span>
    </div>
  )
}

/** The people table's columns; their row actions, for an administrator, call back to the page. */
function personColumns(actions: PersonRowActions | null) {
  return personColumn.columns([
    personColumn.accessor((row) => row.person.name, {
      id: "name",
      header: "Name",
      sortFn: "text",
      cell: ({ row }) => {
        const { person } = row.original
        return (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{person.name}</span>
            <span className="truncate text-muted-foreground">{person.email ?? "No email"}</span>
          </div>
        )
      },
      meta: { isRowHeader: true, cellClassName: "min-w-56" }
    }),
    personColumn.accessor((row) => accessLabels[row.access], {
      id: "role",
      header: "Role",
      sortFn: "text",
      meta: { cellClassName: "whitespace-nowrap" }
    }),
    personColumn.accessor((row) => row.units.map(({ unit }) => unit.label).join(", "), {
      id: "home",
      header: "Home",
      sortFn: "text",
      cell: ({ row }) =>
        row.original.units.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {row.original.units.map(({ unit, link }) => (
              <li key={link.id}>
                <Titled title={unit.label} subtitle={relationLabels[link.relation]} />
              </li>
            ))}
          </ul>
        ),
      meta: { cellClassName: "min-w-48" }
    }),
    personColumn.accessor((row) => row.committees.map(({ committee }) => committee.name).join(", "), {
      id: "assignments",
      header: "Assignments",
      sortFn: "text",
      enableHiding: true,
      cell: ({ row }) =>
        row.original.committees.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {row.original.committees.map(({ committee, member }) => (
              <li key={member.id}>
                <Titled title={committee.name} subtitle={seatLabel(member)} />
              </li>
            ))}
          </ul>
        ),
      meta: { cellClassName: "min-w-48" }
    }),
    personColumn.accessor((row) => accountStatusLabels[row.status], {
      id: "account",
      header: "Account",
      cell: ({ row }) => (
        <span className={row.original.status === "joined" ? undefined : "text-muted-foreground"}>
          {accountStatusLabels[row.original.status]}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" }
    }),
    ...(actions ? [personActionsColumn(actions)] : [])
  ])
}

function personActionsColumn({ onEdit, onInvite, onViewAs, viewerId, onAssign, onRemove }: PersonRowActions) {
  return personColumn.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    cell: ({ row }) => {
      const { person, status, access } = row.original
      const isInvited = status === "invited"
      return (
        <RowActions
          name={person.name}
          actions={[
            { label: "Edit", icon: PencilIcon, onSelect: () => onEdit(person) },
            ...(onViewAs && person.userId && status === "joined" && person.id !== viewerId
              ? [{ label: "View as", icon: EyeIcon, onSelect: () => person.userId && onViewAs(person.userId) }]
              : []),
            ...(isInvited || status === "not-invited"
              ? [
                  {
                    label: isInvited ? "Resend invite" : "Invite",
                    icon: MailIcon,
                    onSelect: () => onInvite(person, isInvited ? access : "member")
                  },
                  ...(isInvited && access === "administrator"
                    ? []
                    : [
                        {
                          label: "Invite as admin",
                          icon: ShieldCheckIcon,
                          onSelect: () => onInvite(person, "administrator")
                        }
                      ])
                ]
              : []),
            { label: "Assignments", icon: UsersIcon, onSelect: () => onAssign(person) },
            { label: "Remove", icon: Trash2Icon, isDestructive: true, onSelect: () => onRemove(person) }
          ]}
        />
      )
    }
  })
}

const unitColumn = dataTableColumns<UnitRow>()

/** What an administrator does to the units themselves: the board keeps who's in them, not the units. */
type UnitAdministration = {
  onEdit: (unit: Unit) => void
  onRemove: (unit: Unit) => void
  onAddUnit: () => void
}

type UnitsTableProps = {
  rows: readonly UnitRow[]
  onAdd: (unit: Unit) => void
  onSale: (unit: Unit) => void
  onRemoveSomeone: (row: UnitRow) => void
  administration: UnitAdministration | null
}

/** The units table's columns; their row actions call back to the page. */
function unitColumns({ onAdd, onSale, onRemoveSomeone, administration }: Omit<UnitsTableProps, "rows">) {
  return unitColumn.columns([
    unitColumn.accessor((row) => row.unit.label, {
      id: "unit",
      header: "Unit",
      sortFn: "text",
      cell: ({ row }) => {
        const { unit } = row.original
        return (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{unit.label}</span>
            {unit.lot || unit.address ? (
              <span className="truncate text-muted-foreground">
                {[unit.lot, unit.address].filter(Boolean).join(", ")}
              </span>
            ) : null}
          </div>
        )
      },
      meta: { isRowHeader: true, cellClassName: "min-w-56" }
    }),
    unitColumn.accessor((row) => row.people.map(({ person }) => person.name).join(", "), {
      id: "people",
      header: "People",
      sortFn: "text",
      cell: ({ row }) =>
        row.original.people.length === 0 ? (
          <span className="text-muted-foreground">Nobody yet</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {row.original.people.map(({ person, link }) => (
              <li key={link.id}>
                <Titled title={person.name} subtitle={relationLabels[link.relation]} />
              </li>
            ))}
          </ul>
        ),
      meta: { cellClassName: "min-w-56 w-full" }
    }),
    unitColumn.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const { unit } = row.original
        return (
          <RowActions
            name={unit.label}
            actions={[
              { label: "Add person", icon: UserPlusIcon, onSelect: () => onAdd(unit) },
              { label: "Record sale", icon: HandshakeIcon, onSelect: () => onSale(unit) },
              ...(row.original.people.length > 0
                ? [{ label: "Remove person", icon: UserMinusIcon, onSelect: () => onRemoveSomeone(row.original) }]
                : []),
              ...(administration
                ? [
                    { label: "Edit", icon: PencilIcon, onSelect: () => administration.onEdit(unit) },
                    {
                      label: "Remove unit",
                      icon: Trash2Icon,
                      isDestructive: true,
                      onSelect: () => administration.onRemove(unit)
                    }
                  ]
                : [])
            ]}
          />
        )
      }
    })
  ])
}

function UnitsTable({ rows, onAdd, onSale, onRemoveSomeone, administration }: UnitsTableProps) {
  const [query, setQuery] = useState("")
  const search = useMemo(
    () =>
      createSearch(rows, {
        id: (row) => row.unit.id,
        fields: {
          label: { text: (row) => row.unit.label, boost: 3 },
          lot: { text: (row) => row.unit.lot ?? "" },
          address: { text: (row) => row.unit.address ?? "" },
          people: { text: (row) => row.people.map(({ person }) => person.name).join(" ") }
        }
      }),
    [rows]
  )
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BuildingIcon />}
        title="No units yet"
        description="Add each home, lot or condominium unit, then who owns, lives in or rents it."
        action={administration ? <Button onClick={administration.onAddUnit}>Add unit</Button> : null}
      />
    )
  }
  const columns = unitColumns({ onAdd, onSale, onRemoveSomeone, administration })
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.unit.id}
      label="Units"
      noun="units"
      search={{ query, ids: search.ids }}
      initialSorting={[{ id: "unit", desc: false }]}
      toolbar={<SearchBox label="Search units" value={query} onChange={setQuery} />}
      renderSummary={(shown) => (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length === rows.length ? `${rows.length} units.` : `${shown.length} of ${rows.length} units.`}
        </p>
      )}
      empty="No units match."
    />
  )
}
