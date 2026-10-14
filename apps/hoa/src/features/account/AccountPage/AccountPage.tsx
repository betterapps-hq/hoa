import {
  HomeIcon,
  KeyRoundIcon,
  MailIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SmartphoneIcon,
  TabletIcon,
  UserMinusIcon,
  UsersIcon,
  type LucideIcon
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { RowActions } from "@/components/RowActions/RowActions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from "@/components/ui/item"
import { ResignDialog } from "@/features/people/EndDialog/EndDialog"
import { localToday } from "@/lib/days"
import { relationLabels, resignedText, seatTermLabel } from "@/people/people"
import { phoneText } from "@/people/phone"
import { initialsOf } from "@/session/users"
import type { AccountDetails, AccountDevice, AccountMembership } from "../account.functions"
import { lastUsedText, type DeviceKind } from "../devices"
import { GoogleMark } from "../GoogleMark"
import { ClaimHomeDialog, DetailsDialog, PasswordDialog, type Details } from "./AccountDialogs"

/** Changing the account, each throwing an Error that says what went wrong. */
export type AccountActions = {
  saveDetails: (details: Details) => Promise<void>
  addPassword: (password: string) => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  connectGoogle: () => Promise<void>
  disconnectGoogle: (accountId: string) => Promise<void>
  signOutDevice: (id: string) => Promise<void>
  signOutElsewhere: () => Promise<void>
  claimHome: (unitId: string) => Promise<void>
  /** Leaves one of their seats on a committee on a day. */
  resign: (seatId: string, endedOn: string) => Promise<void>
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/** Runs an action, saying in a toast how it went. */
async function run(action: () => Promise<void>, done: string) {
  try {
    await action()
    toast.success(done)
  } catch (caught) {
    toast.error(messageOf(caught))
  }
}

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })

const deviceIcons: Record<DeviceKind, LucideIcon> = {
  desktop: MonitorIcon,
  mobile: SmartphoneIcon,
  tablet: TabletIcon
}

/**
 * The signed-in person's account (docs/design/people.md): who they are and what their association has on file, how they
 * sign in, and the browsers they're signed in on.
 */
export function AccountPage({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  const { membership } = account
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 lg:px-6">
      <ProfileHeader account={account} />
      <Section title="Details">
        <DetailsCard account={account} actions={actions} />
      </Section>
      {membership ? (
        <Section title={membership.homes.length > 1 ? "Homes" : "Home"}>
          <HomesCard membership={membership} actions={actions} />
        </Section>
      ) : null}
      {membership && membership.committees.length > 0 ? (
        <Section title="Committees">
          <CommitteesCard membership={membership} actions={actions} />
        </Section>
      ) : null}
      <Section title="Sign-in">
        <SignInCard account={account} actions={actions} />
      </Section>
      <Section title="Sessions">
        <DevicesCard devices={account.devices} asOf={account.asOf} actions={actions} />
      </Section>
    </div>
  )
}

/** How they belong to their association, as they'd say it: "Owner at Maple Hollow", or just its name without a home. */
function homeLine({ association, homes }: NonNullable<AccountDetails["membership"]>) {
  const [home] = homes
  return home ? `${relationLabels[home.relation]} at ${association}` : association
}

function ProfileHeader({ account }: { account: AccountDetails }) {
  const { membership } = account
  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        <AvatarFallback className="text-lg">{initialsOf(account.name, account.email)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-xl font-semibold">{account.name || account.email}</h2>
        <p className="text-sm text-muted-foreground">{membership ? homeLine(membership) : account.email}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

/** A card of rows, with an optional footer for the card's own action. */
function RowsCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">{children}</ItemGroup>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">{footer}</div> : null}
    </Card>
  )
}

function Row({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <Item className="flex-wrap sm:flex-nowrap">
      <ItemMedia className="size-9 rounded-md bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
        {icon}
      </ItemMedia>
      {/* Wide enough to read before the action wraps below it on a phone. */}
      <ItemContent className="min-w-0 basis-44">
        <ItemTitle className="break-words">{title}</ItemTitle>
        {description ? <ItemDescription className="line-clamp-none break-words">{description}</ItemDescription> : null}
      </ItemContent>
      {action ? <ItemActions className="ml-auto">{action}</ItemActions> : null}
    </Item>
  )
}

/** A label above its value, for the details card's rows. */
function Labeled({ label, value }: { label: string; value: string | null }) {
  return (
    <ItemContent className="min-w-0">
      <ItemDescription>{label}</ItemDescription>
      <ItemTitle
        className={value ? "line-clamp-none break-words whitespace-pre-line" : "font-normal text-muted-foreground"}
      >
        {value ?? "None"}
      </ItemTitle>
    </ItemContent>
  )
}

function DetailsCard({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  const [isEditing, setEditing] = useState(false)
  const { membership } = account
  return (
    <>
      <RowsCard
        footer={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            Edit details
          </Button>
        }
      >
        <Item>
          <Labeled label="Name" value={account.name || null} />
        </Item>
        <ItemSeparator className="my-0" />
        <Item>
          <Labeled label="Email" value={account.email} />
        </Item>
        {membership ? (
          <>
            <ItemSeparator className="my-0" />
            <Item>
              <Labeled label="Phone" value={membership.phone && phoneText(membership.phone)} />
            </Item>
            <ItemSeparator className="my-0" />
            <Item>
              <Labeled label="Mailing address" value={membership.mailingAddress} />
            </Item>
          </>
        ) : null}
      </RowsCard>
      {isEditing ? (
        <DetailsDialog
          details={{
            name: account.name,
            phone: membership?.phone ? phoneText(membership.phone) : "",
            mailingAddress: membership?.mailingAddress ?? ""
          }}
          hasContact={membership !== null}
          onSave={async (details) => {
            await actions.saveDetails(details)
            toast.success("Details saved.")
          }}
          onOpenChange={setEditing}
        />
      ) : null}
    </>
  )
}

/** Their homes on the roll; with none, a way to add theirs. Changing one after that is the board's or an administrator's. */
function HomesCard({ membership, actions }: { membership: AccountMembership; actions: AccountActions }) {
  const [isClaiming, setClaiming] = useState(false)
  return (
    <>
      <RowsCard>
        {membership.homes.length === 0 ? (
          <Row
            icon={<HomeIcon />}
            title="No home yet"
            action={
              <Button variant="outline" size="sm" onClick={() => setClaiming(true)}>
                <PlusIcon />
                Add your home
              </Button>
            }
          />
        ) : (
          membership.homes.map((home, index) => (
            <div key={home.id}>
              {index > 0 ? <ItemSeparator className="my-0" /> : null}
              <Row
                icon={<HomeIcon />}
                title={home.label}
                description={`${relationLabels[home.relation]}${home.since ? ` since ${monthYear.format(new Date(home.since))}` : ""}`}
              />
            </div>
          ))
        )}
      </RowsCard>
      {isClaiming ? (
        <ClaimHomeDialog
          homes={membership.claimable
            .filter((home) => !home.isOwned)
            .map((home) => ({ value: home.id, label: home.label, detail: home.detail }))}
          onClaim={async (unitId) => {
            await actions.claimHome(unitId)
            toast.success("Home added.")
          }}
          onOpenChange={setClaiming}
        />
      ) : null}
    </>
  )
}

/** The seats they hold, each with a way to resign from it. */
function CommitteesCard({ membership, actions }: { membership: AccountMembership; actions: AccountActions }) {
  const [resigning, setResigning] = useState<AccountMembership["committees"][number] | null>(null)
  const today = localToday()
  return (
    <>
      <RowsCard>
        {membership.committees.map((committee, index) => (
          <div key={committee.id}>
            {index > 0 ? <ItemSeparator className="my-0" /> : null}
            <Row
              icon={<UsersIcon />}
              title={committee.name}
              description={seatTermLabel(committee, today)}
              action={
                <RowActions
                  name={committee.name}
                  actions={[
                    {
                      label: "Resign",
                      icon: UserMinusIcon,
                      isDestructive: true,
                      onSelect: () => setResigning(committee)
                    }
                  ]}
                />
              }
            />
          </div>
        ))}
      </RowsCard>
      {resigning ? (
        <ResignDialog
          committee={resigning.name}
          seat={resigning}
          today={today}
          onOpenChange={(isOpen) => (isOpen ? undefined : setResigning(null))}
          onResign={async (endedOn) => {
            try {
              await actions.resign(resigning.id, endedOn)
            } catch (caught) {
              toast.error(messageOf(caught))
              throw caught
            }
            toast.success(resignedText(resigning.name, endedOn, today))
          }}
        />
      ) : null}
    </>
  )
}

function SignInCard({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  const [isEditingPassword, setEditingPassword] = useState(false)
  const google = account.googleAccountId
  return (
    <>
      <RowsCard>
        <Row icon={<MailIcon />} title="Code by email" description="On" />
        <ItemSeparator className="my-0" />
        <Row
          icon={<KeyRoundIcon />}
          title="Password"
          description={account.hasPassword ? "On" : "Off"}
          action={
            <Button variant="outline" size="sm" onClick={() => setEditingPassword(true)}>
              {account.hasPassword ? "Change password" : "Add a password"}
            </Button>
          }
        />
        {account.isGoogleConfigured || google ? (
          <>
            <ItemSeparator className="my-0" />
            <Row
              icon={<GoogleMark />}
              title="Google"
              description={google ? "Connected" : "Not connected"}
              action={
                google ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void run(() => actions.disconnectGoogle(google), "Google disconnected.")}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void actions.connectGoogle().catch((caught: unknown) => toast.error(messageOf(caught)))
                    }
                  >
                    Connect Google
                  </Button>
                )
              }
            />
          </>
        ) : null}
      </RowsCard>
      {isEditingPassword ? (
        <PasswordDialog
          hasPassword={account.hasPassword}
          onSave={async (current, next) => {
            if (account.hasPassword) {
              await actions.changePassword(current, next)
            } else {
              await actions.addPassword(next)
            }
            toast.success(account.hasPassword ? "Password changed." : "Password added.")
          }}
          onOpenChange={setEditingPassword}
        />
      ) : null}
    </>
  )
}

function DevicesCard({
  devices,
  asOf,
  actions
}: {
  devices: readonly AccountDevice[]
  asOf: string
  actions: AccountActions
}) {
  const others = devices.filter((device) => !device.isCurrent).length
  return (
    <RowsCard
      footer={
        others > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void run(actions.signOutElsewhere, "Signed out everywhere else.")}
          >
            Sign out everywhere else
          </Button>
        ) : (
          <p className="mr-auto text-sm text-muted-foreground">No other sessions</p>
        )
      }
    >
      {devices.map((device, index) => {
        const Icon = deviceIcons[device.kind]
        return (
          <div key={device.id}>
            {index > 0 ? <ItemSeparator className="my-0" /> : null}
            <Row
              icon={<Icon />}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {device.name}
                  {device.isCurrent ? <Badge variant="secondary">This browser</Badge> : null}
                </span>
              }
              description={device.isCurrent ? undefined : lastUsedText(device.lastActiveAt, asOf)}
              action={
                device.isCurrent ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void run(() => actions.signOutDevice(device.id), `Signed out ${device.name}.`)}
                  >
                    Sign out
                  </Button>
                )
              }
            />
          </div>
        )
      })}
    </RowsCard>
  )
}
