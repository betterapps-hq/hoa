import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  BanIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  GavelIcon,
  ListPlusIcon,
  MailIcon,
  MessageSquareIcon,
  RotateCcwIcon
} from "lucide-react"
import { useState } from "react"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
import { ImageViewer } from "@/components/ImageViewer/ImageViewer"
import { PageActions, type PageActionsProps } from "@/components/PageActions/PageActions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RuleReference } from "@/features/rulebook/RuleReference/RuleReference"
import { attempt } from "@/lib/attempt"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import { sentenceCase } from "@/lib/text"
import { violationStatusLabels, type FactValue, type ViolationParty } from "@/violations/violation"
import {
  FactDialog,
  ImposeDialog,
  RespondDialog,
  SendNoticeDialog,
  StepDialog,
  type StepKind
} from "../ViolationDialogs/ViolationDialogs"
import { amountText, cureText, eventText, firstStepsText, sanctionTypeLabels } from "../violationDisplay"
import type { ViolationStep } from "../violations.functions"
import type { FactQuestion, SanctionView, ViolationView } from "../violations.server"

// A violation (violations.md): what was seen, the rules it breaks and the time to correct it, and its history. The
// board takes it through the documents' steps and sees what they allow; whoever answers for it replies or asks for a
// hearing.

export type ViolationActions = {
  sendNotice: () => Promise<void>
  recordStep: (step: ViolationStep) => Promise<void>
  impose: (imposed: { ruleKey: string; enforced: string; amountCents: number | null; note: string }) => Promise<void>
  respond: (kind: "reply" | "hearing-requested", note: string) => Promise<void>
  addPhotos: (files: File[]) => Promise<void>
  stateFact: (property: string, value: FactValue) => Promise<void>
}

export type ViolationPageProps = {
  view: ViolationView
  actions: ViolationActions
  /** Reloads the page's data after a change. */
  onChanged: () => void
  onBack: () => void
}

type OpenDialog =
  | { type: "notice" }
  | { type: "step"; kind: StepKind }
  | { type: "impose"; sanction: SanctionView }
  | { type: "respond"; kind: "reply" | "hearing-requested" }
  | { type: "fact"; question: FactQuestion }
  | null

const partyLabels: Record<ViolationParty, string> = {
  owner: "Owner",
  occupant: "Lives there",
  tenant: "Tenant",
  guest: "Guest"
}

const list = (items: readonly string[]) => new Intl.ListFormat("en-US").format(items)

/** A violation's page, for the board or for whoever answers for it. */
export function ViolationPage({ view, actions, onChanged, onBack }: ViolationPageProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [isUploading, setIsUploading] = useState(false)
  const close = (open: boolean) => {
    if (!open) {
      setDialog(null)
    }
  }
  const run = async (change: () => Promise<unknown>, success: string) => {
    await attempt(change, success)
    onChanged()
  }
  const addPhotos = async (files: File[]) => {
    setIsUploading(true)
    try {
      await run(() => actions.addPhotos(files), files.length === 1 ? "Photo added" : "Photos added")
    } catch {
      // The toast has said why.
    } finally {
      setIsUploading(false)
    }
  }
  const { violation, steps } = view
  const isOpen = violation.status === "open"
  const ruleTitles = new Map(view.rules.map((rule) => [rule.key, rule.title]))
  const enforcedTitle = (sanction: SanctionView) =>
    view.rules.length > 1 ? (ruleTitles.get(sanction.enforced) ?? null) : null
  const emailTo = view.people.flatMap((person) => (person.email ? [person.name] : []))
  const noticeCure = noticeCureText(view)
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 lg:px-6">
      <PageActions {...pageActions(view, setDialog)} />
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
        <ArrowLeftIcon />
        Violations
      </Button>
      <header className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-balance">{violation.title}</h2>
          <Badge variant={isOpen ? "default" : "outline"}>{violationStatusLabels[violation.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {placeOf(view.unit)}. Seen on {dayText(violation.observedOn)}.
        </p>
      </header>
      {view.canRespond && !view.canManage && isOpen ? <OwnerAlert view={view} /> : null}
      {violation.description || view.photos.length > 0 || view.canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>What was seen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {violation.description ? (
              <p className="max-w-prose whitespace-pre-wrap text-pretty">{violation.description}</p>
            ) : null}
            {view.photos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {view.photos.map((photo) => (
                  <ImageViewer
                    key={photo.id}
                    src={photo.url}
                    name={photo.fileName}
                    className="size-24"
                    trigger={<img src={photo.url} alt={photo.fileName} className="size-24 rounded-md object-cover" />}
                  />
                ))}
              </div>
            ) : null}
            {view.canManage ? (
              <FileDropzone
                id="violation-photos"
                target="photo"
                size="compact"
                prompt="Add photos"
                disabled={isUploading}
                onFiles={(files) => void addPhotos(files)}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{view.rules.length === 1 ? "The rule it breaks" : "The rules it breaks"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-4">
            {view.rules.map((rule) => {
              const cure = view.cures.find((candidate) => candidate.ruleKey === rule.key)
              return (
                <li key={rule.key} className="flex flex-col gap-1">
                  <RuleReference rule={rule.reference} />
                  <p className="max-w-prose text-sm text-pretty text-muted-foreground">{rule.statement}</p>
                  {cure && isOpen && (view.canManage || cure.status === "running") ? (
                    <p className="text-sm">{cureText(cure, !view.canManage)}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
      {view.canManage && view.facts.length > 0 ? (
        <FactsCard facts={view.facts} onAnswer={isOpen ? (question) => setDialog({ type: "fact", question }) : null} />
      ) : null}
      {view.canManage ? (
        <AllowedCard
          view={view}
          enforcedTitle={enforcedTitle}
          onImpose={isOpen ? (sanction) => setDialog({ type: "impose", sanction }) : null}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">
            {view.events.map((event) => (
              <li key={event.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <span className="text-sm text-muted-foreground tabular-nums">{dayText(event.occurredOn)}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{eventText(event)}</span>
                  {event.sanction?.amountCents ? (
                    <Link
                      to="/ledger/$unitId"
                      params={{ unitId: view.unit.id }}
                      className="w-fit text-sm text-link underline-offset-4 hover:underline"
                    >
                      See the ledger
                    </Link>
                  ) : null}
                  <span className="text-sm text-muted-foreground">{event.by}</span>
                  {event.note ? <p className="max-w-prose text-sm whitespace-pre-wrap">{event.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Who answers for it</CardTitle>
          <CardDescription>
            {steps.noticeDeliveredOn
              ? `Noticed on ${dayText(steps.noticeDeliveredOn)}.`
              : "They see it once the notice is sent."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view.people.length === 0 ? (
            <p className="text-muted-foreground">Nobody: the unit had no owner on the roll when it was reported.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.people.map((person) => (
                <li key={person.personId} className="flex min-w-0 flex-col">
                  <span className="font-medium">{person.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {partyLabels[person.party]}
                    {view.canManage ? `, ${person.email ?? "no email on the roll"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {dialog?.type === "notice" ? (
        <SendNoticeDialog
          emailTo={emailTo}
          cureText={noticeCure}
          observedOn={violation.observedOn}
          today={view.today}
          onSend={() => run(actions.sendNotice, "Notice sent")}
          onRecord={(step) => run(() => actions.recordStep(step), "Notice recorded")}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "step" ? (
        <StepDialog
          kind={dialog.kind}
          observedOn={violation.observedOn}
          today={view.today}
          onRecord={(step) => run(() => actions.recordStep(step), "Recorded")}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "impose" ? (
        <ImposeDialog
          sanction={dialog.sanction}
          enforcedTitle={enforcedTitle(dialog.sanction)}
          onImpose={(imposed) =>
            run(
              () =>
                actions.impose({ ruleKey: dialog.sanction.ruleKey, enforced: dialog.sanction.enforced, ...imposed }),
              "Imposed"
            )
          }
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "fact" ? (
        <FactDialog
          question={dialog.question}
          onAnswer={(value) => run(() => actions.stateFact(dialog.question.key, value), "Saved")}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "respond" ? (
        <RespondDialog
          kind={dialog.kind}
          onRespond={(note) =>
            run(() => actions.respond(dialog.kind, note), dialog.kind === "reply" ? "Reply sent" : "Hearing asked for")
          }
          onOpenChange={close}
        />
      ) : null}
    </div>
  )
}

/** The page's actions: the board's next step, or the owner's reply and request for a hearing. */
function pageActions(view: ViolationView, open: (dialog: OpenDialog) => void): PageActionsProps {
  const isOpen = view.violation.status === "open"
  if (view.canManage) {
    if (!isOpen) {
      return {
        primary: { label: "Reopen", icon: RotateCcwIcon, onSelect: () => open({ type: "step", kind: "reopened" }) }
      }
    }
    const recordStep = {
      label: "Record a step",
      icon: ListPlusIcon,
      onSelect: () => open({ type: "step", kind: "note" })
    }
    const more = [
      { label: "Close", icon: CheckCheckIcon, onSelect: () => open({ type: "step", kind: "closed" }) },
      { label: "Dismiss", icon: BanIcon, onSelect: () => open({ type: "step", kind: "dismissed" }) }
    ]
    return view.steps.noticeDeliveredOn
      ? { primary: recordStep, more }
      : {
          primary: { label: "Send the notice", icon: MailIcon, onSelect: () => open({ type: "notice" }) },
          secondary: recordStep,
          more
        }
  }
  if (!view.canRespond || !isOpen) {
    return {}
  }
  return {
    primary: { label: "Reply", icon: MessageSquareIcon, onSelect: () => open({ type: "respond", kind: "reply" }) },
    secondary: view.steps.hearingRequestedOn
      ? null
      : {
          label: "Ask for a hearing",
          icon: GavelIcon,
          onSelect: () => open({ type: "respond", kind: "hearing-requested" })
        }
  }
}

/** What a notice sent today gives as the time to correct it. */
function noticeCureText(view: ViolationView) {
  const timed = view.curesFromNotice.filter((cure) => cure.status !== "none")
  const endsOn = timed.flatMap((cure) => (cure.endsOn ? [cure.endsOn] : [])).toSorted()[0]
  if (endsOn) {
    return `Sent today, it gives until ${dayText(endsOn)} to correct it.`
  }
  const needs = [...new Set(timed.flatMap((cure) => cure.needs))]
  return needs.length > 0
    ? `The time to correct it needs ${list(needs)} first. Answer it under What the documents need to know.`
    : "The documents give no time to correct it."
}

/** What the owner needs to do, and by when. */
function OwnerAlert({ view }: { view: ViolationView }) {
  const running = view.cures
    .filter((cure) => cure.status === "running" && cure.endsOn)
    .map((cure) => cure.endsOn ?? "")
    .toSorted()[0]
  const { hearingRequestedOn, hearingHeldOn, curedOn } = view.steps
  const hearingSet = view.events.findLast((event) => event.kind === "hearing-set")?.hearing
  const title = (() => {
    if (curedOn) {
      return "Recorded as corrected"
    }
    return running ? `Correct it by ${dayText(running)}` : "Please correct it"
  })()
  const hearing = (() => {
    if (hearingSet && !hearingHeldOn) {
      return ` Your hearing is on ${dayText(hearingSet.on)}${hearingSet.place ? `, ${hearingSet.place}` : ""}.`
    }
    return hearingRequestedOn && !hearingHeldOn ? " You've asked for a hearing; the board will set a day." : ""
  })()
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {curedOn
          ? `The board recorded it corrected on ${dayText(curedOn)}.`
          : `${view.association} can fine a violation that isn't corrected in time. Reply if it's been corrected, or if you think it isn't a violation.`}
        {hearing}
      </AlertDescription>
    </Alert>
  )
}

type FactsCardProps = {
  facts: FactQuestion[]
  /** Opens the dialog to answer one; null when it's closed. */
  onAnswer: ((question: FactQuestion) => void) | null
}

/** The facts the documents turn on that only the board can say, such as the day it set to cure by. */
function FactsCard({ facts, onAnswer }: FactsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What the documents need to know</CardTitle>
        <CardDescription>The time to cure and the sanctions turn on these. Answer them as they stand.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {facts.map((fact) => (
            <li key={fact.key} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{sentenceCase(fact.label)}</span>
                {fact.note ? (
                  <span className="max-w-prose text-sm text-pretty text-muted-foreground">{fact.note}</span>
                ) : null}
                <span className="text-sm">{fact.valueText ?? "Not answered yet"}</span>
              </div>
              {onAnswer ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit shrink-0"
                  aria-label={`${fact.valueText ? "Change" : "Answer"}: ${fact.label}`}
                  onClick={() => onAnswer(fact)}
                >
                  {fact.valueText ? "Change" : "Answer"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

type AllowedCardProps = {
  view: ViolationView
  enforcedTitle: (sanction: SanctionView) => string | null
  /** Opens the dialog to impose an available sanction; null when nothing can be imposed now. */
  onImpose: ((sanction: SanctionView) => void) | null
}

/** What the documents allow the board to do about it now, what has to come first, and what doesn't apply. */
function AllowedCard({ view, enforcedTitle, onImpose }: AllowedCardProps) {
  const now = view.sanctions.filter((sanction) => sanction.outcome === "available")
  const waiting = view.sanctions.filter(
    (sanction) => sanction.outcome === "pending" || sanction.outcome === "missing-information"
  )
  const others = view.sanctions.filter(
    (sanction) => sanction.outcome === "blocked" || sanction.outcome === "not-applicable"
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>What the documents allow</CardTitle>
        <CardDescription>
          What the rules it breaks can lead to, and when. The board decides what to impose.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {view.sanctions.length === 0 ? (
          <p className="text-muted-foreground">The documents name no sanction for the rules it breaks.</p>
        ) : null}
        {now.length > 0 ? (
          <SanctionList title="Now" sanctions={now} enforcedTitle={enforcedTitle} onImpose={onImpose} />
        ) : null}
        {waiting.length > 0 ? (
          <SanctionList title="Not yet" sanctions={waiting} enforcedTitle={enforcedTitle} onImpose={null} />
        ) : null}
        {others.length > 0 ? (
          <Collapsible className="flex flex-col gap-3">
            <CollapsibleTrigger
              render={<Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" />}
            >
              <ChevronDownIcon className="transition-transform in-data-panel-open:rotate-180" />
              {others.length === 1 ? "1 that doesn't apply" : `${others.length} that don't apply`}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SanctionList sanctions={others} enforcedTitle={enforcedTitle} onImpose={null} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  )
}

type SanctionListProps = {
  title?: string
  sanctions: SanctionView[]
  enforcedTitle: (sanction: SanctionView) => string | null
  onImpose: ((sanction: SanctionView) => void) | null
}

function SanctionList({ title, sanctions, enforcedTitle, onImpose }: SanctionListProps) {
  return (
    <section className="flex flex-col gap-3">
      {title ? <h3 className="text-sm font-medium text-muted-foreground">{title}</h3> : null}
      <ul className="flex flex-col gap-4">
        {sanctions.map((sanction) => {
          const enforced = enforcedTitle(sanction)
          const amount = sanction.outcome === "available" ? amountText(sanction.amount) : null
          return (
            <li
              key={`${sanction.ruleKey} ${sanction.enforced}`}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={sanction.outcome === "available" ? "secondary" : "outline"}>
                    {sanctionTypeLabels[sanction.type]}
                  </Badge>
                  <RuleReference rule={sanction.rule.reference} />
                </div>
                {enforced ? <p className="text-sm text-muted-foreground">For {enforced}</p> : null}
                {amount ? <p className="text-sm">{amount}</p> : null}
                <p className="max-w-prose text-sm text-pretty text-muted-foreground">{detailOf(sanction)}</p>
                {sanction.imposedCents > 0 ? (
                  <p className="text-sm">Imposed so far: {money(sanction.imposedCents)}</p>
                ) : null}
              </div>
              {onImpose ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit shrink-0"
                  aria-label={`Impose: ${sanction.rule.title}`}
                  onClick={() => onImpose(sanction)}
                >
                  Impose
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Who imposes a sanction and on whom, when it's available; why it isn't, otherwise. */
function detailOf(sanction: SanctionView) {
  if (sanction.procedure?.steps && sanction.procedure.steps.length > 0) {
    return firstStepsText(sanction.procedure.steps)
  }
  if (sanction.outcome === "pending" && sanction.availableOn) {
    return `Available from ${dayText(sanction.availableOn)}.`
  }
  if (sanction.outcome !== "available") {
    return sanction.reason
  }
  const { against, imposedBy, suspends } = sanction.labels
  const on = against.length > 0 ? `, on the ${list(against)}` : ""
  const suspended = suspends.length > 0 ? ` It suspends ${list(suspends)}.` : ""
  return `The ${imposedBy} imposes it${on}.${suspended}`
}

/** A unit as people find it: its label, with its address when that says more. */
function placeOf(unit: ViolationView["unit"]) {
  if (!unit.address || unit.address.startsWith(unit.label)) {
    return unit.address ?? unit.label
  }
  return `${unit.label}, ${unit.address}`
}
