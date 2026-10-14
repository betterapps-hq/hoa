import {
  BuildingIcon,
  HandshakeIcon,
  HomeIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { DataTable } from "@/components/DataTable/DataTable"
import { dataTableColumns } from "@/components/DataTable/DataTable.utils"
import { PageActions } from "@/components/PageActions/PageActions"
import { ActionsMenu, RowActions } from "@/components/RowActions/RowActions"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createSearch } from "@/lib/search"
import {
  committeeKindLabels,
  relationLabels,
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
  signInStatusLabels,
  unitRows,
  type PersonRow,
  type RollData,
  type UnitRow
} from "@/people/roll"
import { CommitteeDialog, MemberDialog } from "../CommitteeDialogs/CommitteeDialogs"
import { PersonDialog, type PersonSave } from "../PersonDialog/PersonDialog"
import type { RollChoice } from "../RollPicker/RollPicker"
import { UnitDialog, UnitPeopleDialog } from "../UnitDialogs/UnitDialogs"

/** The People page's changes, each throwing an Error that says what went wrong. */
export type PeopleActions = {
  savePerson: (id: string | null, person: PersonSave["person"]) => Promise<Person>
  removePerson: (id: string) => Promise<void>
  invite: (id: string) => Promise<void>
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
}

type Open =
  | { kind: "person"; person: Person | null }
  | { kind: "unit"; unit: Unit | null }
  | { kind: "unit-people"; unit: Unit; mode: "add" | "sale" }
  | { kind: "committee"; committee: Committee | null }
  | { kind: "member"; committee: Committee }
  | { kind: "confirm"; title: string; description: string; confirm: string; run: () => Promise<void> }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/** Today, where the viewer is: YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString("en-CA")

/**
 * The association's people (docs/design/people.md): everyone on its roll and whether they can sign in yet, the units
 * and who owns, lives in or rents each, and the board and committees.
 */
export function PeoplePage({ roll, actions }: { roll: RollData; actions: PeopleActions }) {
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

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <PageActions
        primary={{
          label: "Add a person",
          icon: UserPlusIcon,
          onSelect: () => setOpen({ kind: "person", person: null })
        }}
        more={[
          { label: "Add a unit", icon: HomeIcon, onSelect: () => setOpen({ kind: "unit", unit: null }) },
          { label: "Add a committee", icon: UsersIcon, onSelect: () => setOpen({ kind: "committee", committee: null }) }
        ]}
      />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
        <TabsList variant="line" aria-label="People">
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="committees">Board and committees</TabsTrigger>
        </TabsList>
        <TabsContent value="people">
          <PeopleTable
            rows={people}
            onEdit={(person) => setOpen({ kind: "person", person })}
            onInvite={(person) =>
              void attempt(() => actions.invite(person.id), `Invited ${person.name} to sign in.`).catch(() => undefined)
            }
            onRemove={(person) =>
              confirm(
                `Take ${person.name} off the roll?`,
                "They won't be able to sign in here. What they own, rent or sit on ends today; their history stays.",
                "Take off the roll",
                () => attempt(() => actions.removePerson(person.id), `${person.name} is off the roll.`)
              )
            }
          />
        </TabsContent>
        <TabsContent value="units">
          <UnitsTable
            rows={units}
            onEdit={(unit) => setOpen({ kind: "unit", unit })}
            onAdd={(unit) => setOpen({ kind: "unit-people", unit, mode: "add" })}
            onSale={(unit) => setOpen({ kind: "unit-people", unit, mode: "sale" })}
            onLeave={(unit, name, linkId) =>
              confirm(
                `End ${name}'s time at ${unit.label}?`,
                "It ends today. Their history stays.",
                "End it today",
                () => attempt(() => actions.leaveUnit(linkId, today))
              )
            }
            onRemove={(unit) =>
              confirm(
                `Take ${unit.label} off the roll?`,
                "Everyone's link to it ends today.",
                "Take off the roll",
                () => attempt(() => actions.removeUnit(unit.id), `${unit.label} is off the roll.`)
              )
            }
            onAddUnit={() => setOpen({ kind: "unit", unit: null })}
          />
        </TabsContent>
        <TabsContent value="committees" className="flex flex-col gap-4">
          {committees.length === 0 ? (
            <EmptyState
              icon={<UsersIcon />}
              title="No board or committees yet"
              description="Add the board, then committees such as architectural review, and who sits on each."
              action={<Button onClick={() => setOpen({ kind: "committee", committee: null })}>Add a committee</Button>}
            />
          ) : (
            committees.map(({ committee, members }) => (
              <Card key={committee.id}>
                <CardHeader>
                  <CardTitle>
                    <h2>{committee.name}</h2>
                  </CardTitle>
                  <CardDescription>
                    {committeeKindLabels[committee.kind]}
                    {committee.kind === "architectural" ? ", which decides applications" : ""}
                  </CardDescription>
                  <CardAction>
                    <RowActions
                      name={committee.name}
                      actions={[
                        {
                          label: "Add someone",
                          icon: UserPlusIcon,
                          onSelect: () => setOpen({ kind: "member", committee })
                        },
                        { label: "Edit", icon: PencilIcon, onSelect: () => setOpen({ kind: "committee", committee }) },
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
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody sits on it yet.</p>
                  ) : (
                    <ul className="flex flex-col divide-y">
                      {members.map(({ member, person }) => (
                        <li key={member.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium">{person.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {[member.office, member.role === "chair" ? "Chair" : null].filter(Boolean).join(", ") ||
                                "Member"}
                            </span>
                          </div>
                          <RowActions
                            name={person.name}
                            actions={[
                              {
                                label: "End their term",
                                icon: UserMinusIcon,
                                isDestructive: true,
                                onSelect: () =>
                                  confirm(
                                    `End ${person.name}'s term on ${committee.name}?`,
                                    "It ends today. Their history stays.",
                                    "End it today",
                                    () => attempt(() => actions.leaveCommittee(member.id, today))
                                  )
                              }
                            ]}
                          />
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
          units={unitChoices}
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
          onSave={(member) => attempt(() => actions.addToCommittee({ ...member, committeeId: open.committee.id }))}
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

type PeopleTableProps = {
  rows: readonly PersonRow[]
  onEdit: (person: Person) => void
  onInvite: (person: Person) => void
  onRemove: (person: Person) => void
}

function PeopleTable({ rows, onEdit, onInvite, onRemove }: PeopleTableProps) {
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
  const signedIn = rows.filter((row) => row.status === "signed-in").length
  const columns = personColumns({ onEdit, onInvite, onRemove })
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
            ? `${rows.length === 1 ? "1 person" : `${rows.length} people`} on the roll, ${signedIn} signed in.`
            : `${shown.length} of ${rows.length} people.`}
        </p>
      )}
      empty={rows.length === 0 ? "Nobody is on the roll yet. Add a person to start." : "Nobody matches."}
    />
  )
}

/** The people table's columns; their row actions call back to the page. */
function personColumns({ onEdit, onInvite, onRemove }: Pick<PeopleTableProps, "onEdit" | "onInvite" | "onRemove">) {
  return personColumn.columns([
    personColumn.accessor((row) => row.person.name, {
      id: "name",
      header: "Name",
      sortFn: "text",
      cell: ({ row }) => {
        const { person } = row.original
        return (
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 font-medium">
              {person.name}
              {person.access === "administrator" ? <Badge variant="secondary">Administrator</Badge> : null}
            </span>
            <span className="truncate text-muted-foreground">{person.email ?? "No email"}</span>
          </div>
        )
      },
      meta: { isRowHeader: true, cellClassName: "min-w-56" }
    }),
    personColumn.accessor((row) => row.units.map(({ unit }) => unit.label).join(", "), {
      id: "home",
      header: "Home",
      sortFn: "text",
      cell: ({ row }) =>
        row.original.units.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <ul className="flex flex-col">
            {row.original.units.map(({ unit, link }) => (
              <li key={link.id}>
                {unit.label}
                <span className="text-muted-foreground">, {relationLabels[link.relation].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        ),
      meta: { cellClassName: "min-w-48" }
    }),
    personColumn.accessor((row) => row.committees.map(({ committee }) => committee.name).join(", "), {
      id: "committees",
      header: "Board and committees",
      sortFn: "text",
      enableHiding: true,
      cell: ({ row }) =>
        row.original.committees.length === 0 ? null : (
          <ul className="flex flex-col">
            {row.original.committees.map(({ committee, member }) => (
              <li key={member.id}>
                {committee.name}
                {member.office || member.role === "chair" ? (
                  <span className="text-muted-foreground">, {member.office ?? "chair"}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ),
      meta: { label: "Board and committees", cellClassName: "min-w-48" }
    }),
    personColumn.accessor((row) => signInStatusLabels[row.status], {
      id: "sign-in",
      header: "Sign-in",
      cell: ({ row }) => (
        <span className={row.original.status === "signed-in" ? undefined : "text-muted-foreground"}>
          {signInStatusLabels[row.original.status]}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" }
    }),
    personColumn.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const { person, status } = row.original
        return (
          <RowActions
            name={person.name}
            actions={[
              { label: "Edit", icon: PencilIcon, onSelect: () => onEdit(person) },
              ...(status === "invited" || status === "not-invited"
                ? [
                    {
                      label: status === "invited" ? "Invite again" : "Invite to sign in",
                      icon: MailIcon,
                      onSelect: () => onInvite(person)
                    }
                  ]
                : []),
              { label: "Take off the roll", icon: Trash2Icon, isDestructive: true, onSelect: () => onRemove(person) }
            ]}
          />
        )
      }
    })
  ])
}

const unitColumn = dataTableColumns<UnitRow>()

type UnitsTableProps = {
  rows: readonly UnitRow[]
  onEdit: (unit: Unit) => void
  onAdd: (unit: Unit) => void
  onSale: (unit: Unit) => void
  onLeave: (unit: Unit, name: string, linkId: string) => void
  onRemove: (unit: Unit) => void
  onAddUnit: () => void
}

/** The units table's columns; their row actions call back to the page. */
function unitColumns({ onEdit, onAdd, onSale, onLeave, onRemove }: Omit<UnitsTableProps, "rows" | "onAddUnit">) {
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
          <ul className="flex flex-col">
            {row.original.people.map(({ person, link }) => (
              <li key={link.id} className="flex items-center gap-1">
                {person.name}
                <span className="text-muted-foreground">, {relationLabels[link.relation].toLowerCase()}</span>
                <ActionsMenu
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${person.name} at ${row.original.unit.label}`}
                    />
                  }
                  actions={[
                    {
                      label: "End it",
                      icon: UserMinusIcon,
                      isDestructive: true,
                      onSelect: () => onLeave(row.original.unit, person.name, link.id)
                    }
                  ]}
                />
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
              { label: "Add someone", icon: UserPlusIcon, onSelect: () => onAdd(unit) },
              { label: "Record a sale", icon: HandshakeIcon, onSelect: () => onSale(unit) },
              { label: "Edit", icon: PencilIcon, onSelect: () => onEdit(unit) },
              { label: "Take off the roll", icon: Trash2Icon, isDestructive: true, onSelect: () => onRemove(unit) }
            ]}
          />
        )
      }
    })
  ])
}

function UnitsTable({ rows, onEdit, onAdd, onSale, onLeave, onRemove, onAddUnit }: UnitsTableProps) {
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
        action={<Button onClick={onAddUnit}>Add a unit</Button>}
      />
    )
  }
  const columns = unitColumns({ onEdit, onAdd, onSale, onLeave, onRemove })
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.unit.id}
      label="Units"
      noun="units"
      search={{ query, ids: search.ids }}
      initialSorting={[{ id: "unit", desc: false }]}
      toolbar={
        <>
          <SearchBox label="Search units" value={query} onChange={setQuery} />
          <Button variant="outline" onClick={onAddUnit}>
            <PlusIcon />
            Add a unit
          </Button>
        </>
      }
      renderSummary={(shown) => (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {shown.length === rows.length ? `${rows.length} units.` : `${shown.length} of ${rows.length} units.`}
        </p>
      )}
      empty="No units match."
    />
  )
}
