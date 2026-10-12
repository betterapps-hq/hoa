import { useWindowEvent } from "@mantine/hooks"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { createContext, use, useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { sentenceCase } from "@/lib/text"
import { approvalBlockers } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { IssueList } from "../IssueList/IssueList"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import { amountText, citedProvision } from "../rulebookRecords"
import { Statement } from "../Statement/Statement"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { Precedence } from "./Precedence"
import {
  clauseCitations,
  clauseTitles,
  dayUnits,
  dateChoices,
  enforcementChoices,
  holidayChoices,
  preconditionOf,
  liabilityLimits,
  partyChoices,
  percentOf,
  preconditionText,
  requestChoices,
  shareOf,
  withCurrent,
  zoneLabel,
  type ClauseName
} from "./SettingsTab.utils"
import { TimeZonePicker } from "./TimeZonePicker"

// The rulebook's settings (encoding.md, UX, Settings): what the documents say about deadlines, authority and
// enforcement, each as a small form in plain words with the passages it comes from, then the organization's own policy
// for what a review recommends and how sure it must be. The settings are reviewed and published like a rule. Every
// card edits one draft, laid over the saved settings, which saves or is discarded as a whole from the bar at the end.

type Clauses = T.Settings["clauses"]

const actionLabels: Record<T.RecommendedAction, string> = {
  "approve-with-conditions": "Approve with conditions",
  deny: "Deny",
  "request-information": "Ask for more information",
  "refer-to-committee": "Leave it to the committee"
}
const actionChoices = (Object.keys(actionLabels) as T.RecommendedAction[]).map((value) => ({
  value,
  label: actionLabels[value]
}))

const remedyQuestions: { remedy: T.RuleRemedy; label: string }[] = [
  { remedy: "change-detail", label: "If changing a detail would fix it" },
  { remedy: "redesign", label: "If it would take a redesign" },
  { remedy: "none", label: "If nothing would fix it" }
]

const dayLabels: Record<(typeof dayUnits)[number], string> = {
  "calendar-day": "Calendar days",
  "business-day": "Business days"
}
const dayChoices = dayUnits.map((value) => ({ value, label: dayLabels[value] }))
const cureUnits = [...dayChoices, { value: "month", label: "Months" }, { value: "year", label: "Years" }]

type Policy = T.Settings["policy"]

/** The settings being edited: the saved ones with the changes made since, and ways to change them. */
type SettingsDraft = {
  clauses: Clauses
  policy: Policy
  /** Changes some clauses in the draft. */
  change: (clauses: Partial<Clauses>) => void
  /** Puts a clause back as it's saved. */
  restore: (name: keyof Clauses) => void
  changePolicy: (change: (policy: Policy) => Policy) => void
  isEditable: boolean
}

const SettingsDraftContext = createContext<SettingsDraft | null>(null)

function useSettingsDraft() {
  const draft = use(SettingsDraftContext)
  if (!draft) {
    throw new Error("A setting is shown outside the settings tab.")
  }
  return draft
}

type Changes = { clauses: Partial<Clauses>; policy: Policy | null }
const noChanges: Changes = { clauses: {}, policy: null }

/** The settings, each in its own card, after the review of them as a whole. */
export function SettingsTab() {
  const { records, issues, approval, actions } = useRulebookWorkspace()
  const { settings } = records
  const blockers = approval ? approvalBlockers(approval, { type: "settings" }) : []
  const [changes, setChanges] = useState<Changes>(noChanges)
  // Bumped when the draft is saved or discarded, so each card's own fields start again from the settings.
  const [round, setRound] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const isChanged = Object.keys(changes.clauses).length > 0 || changes.policy !== null
  const draft: SettingsDraft = {
    clauses: { ...settings.clauses, ...changes.clauses },
    policy: changes.policy ?? settings.policy,
    change: (clauses) => setChanges((current) => ({ ...current, clauses: { ...current.clauses, ...clauses } })),
    restore: (name) =>
      setChanges((current) => ({
        ...current,
        clauses: Object.fromEntries(Object.entries(current.clauses).filter(([key]) => key !== name))
      })),
    changePolicy: (change) =>
      setChanges((current) => ({ ...current, policy: change(current.policy ?? settings.policy) })),
    isEditable: actions !== null
  }
  const reset = () => {
    setChanges(noChanges)
    setRound((current) => current + 1)
  }
  // Editing the settings is reviewing them, so saving approves them too, unless something still blocks it.
  const saveAndApprove = async () => {
    if (!actions) {
      return
    }
    setIsSaving(true)
    const found = await attempt(
      () => actions.saveSettings({ clauses: changes.clauses, policy: changes.policy }),
      "The settings weren't saved."
    )
    const approved = found
      ? await attempt(() => actions.review([{ type: "settings" }], "approved", null), "The settings weren't approved.")
      : undefined
    setIsSaving(false)
    if (!found) {
      return
    }
    reset()
    const reason = approved?.skipped[0]?.reasons[0]
    if (reason) {
      toast.warning(`Saved, but not approved yet. ${reason}`)
    } else if (approved) {
      toast.success("Saved and approved.")
    }
  }
  useWindowEvent("beforeunload", (event) => {
    if (isChanged) {
      event.preventDefault()
    }
  })
  return (
    <SettingsDraftContext value={draft}>
      <div key={round} className="flex flex-col gap-4">
        {actions ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Review the settings</CardTitle>
              <CardDescription>
                They&rsquo;re published with the rules, so they&rsquo;re approved like a rule.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {settings.issues.length > 0 || (issues.get("settings") ?? []).length > 0 ? (
                <IssueList
                  issues={settings.issues}
                  found={issues.get("settings") ?? []}
                  onResolve={(index, note) => actions.resolveIssue({ type: "settings" }, index, note)}
                />
              ) : null}
              {isChanged ? (
                <p className="text-sm text-muted-foreground">
                  You have unsaved changes. Save and approve them, or discard them, at the end of the settings.
                </p>
              ) : (
                <ReviewControls record={{ type: "settings" }} status={settings.review.status} blockers={blockers} />
              )}
            </CardContent>
          </Card>
        ) : null}
        <SettingCard
          name="precedence"
          description="When two documents disagree, the higher-ranked one wins. Drag a document onto another rank to make them equal, or between ranks to rank it on its own."
        >
          <PrecedenceSetting />
        </SettingCard>
        <SettingCard
          name="time"
          description="How every deadline in your rules is counted: which days count, and in what time zone."
        >
          <Deadlines />
        </SettingCard>
        <SettingCard name="cure" description="How long an owner has to fix a violation when a rule doesn't say.">
          <Cure />
        </SettingCard>
        <SettingCard name="deciders" description="The person or group whose decision a request waits for.">
          <Deciders />
        </SettingCard>
        <SettingCard
          name="liability"
          description="When someone breaks a rule, who else is responsible for the fine, such as an owner for a tenant."
        >
          <Liability />
        </SettingCard>
        <SettingCard
          name="sanctionPreconditions"
          description="What must happen first, such as notice and a chance to be heard."
        >
          <Preconditions />
        </SettingCard>
        <PolicyCard />
        {actions && isChanged ? (
          <section
            aria-label="Unsaved settings"
            className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-md"
          >
            <p className="min-w-0 flex-1 text-sm">You have unsaved changes to the settings.</p>
            <Button variant="ghost" disabled={isSaving} onClick={reset}>
              Discard changes
            </Button>
            <Button disabled={isSaving} onClick={() => void saveAndApprove()}>
              {isSaving ? "Saving" : "Save and approve"}
            </Button>
          </section>
        ) : null}
      </div>
    </SettingsDraftContext>
  )
}

type SettingCardProps = { name: ClauseName; description: string; children: ReactNode }

/** One setting: what it means, the form, and the passages it comes from, when its documents state it. */
function SettingCard({ name, description, children }: SettingCardProps) {
  const { citations, source } = useRulebookWorkspace()
  const { clauses } = useSettingsDraft()
  const cited = [...new Map(clauseCitations(name, clauses).map((item) => [item.provisionKey, item])).values()]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{clauseTitles[name]}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {children}
        {cited.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            From
            {cited.map((citation) => (
              <ProvisionReference
                key={citation.provisionKey}
                citation={citedProvision(citations, citation)}
                source={source}
              />
            ))}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** The order of authority: each move changes the draft. */
function PrecedenceSetting() {
  const { clauses, change, isEditable } = useSettingsDraft()
  const { precedence } = clauses
  return (
    <Precedence
      order={precedence.order}
      onChange={isEditable ? (order) => change({ precedence: { ...precedence, order } }) : null}
    />
  )
}

/** How days are counted, and whether a deadline on a day off moves to the next business day. */
function Deadlines() {
  const { vocabulary } = useRulebookWorkspace()
  const { clauses, change, isEditable: actions } = useSettingsDraft()
  const { time } = clauses
  const id = useId()
  const days = dayChoices.find((choice) => choice.value === time.days)
  const holidays = holidayChoices.find((choice) => choice.value === time.holidays)
  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor={`${id}-days`} className="font-normal">
          A number of days means
        </FieldLabel>
        {actions && days ? (
          <ChoiceSelect
            id={`${id}-days`}
            className="w-44"
            value={days.value}
            choices={dayChoices}
            onChange={(value) => change({ time: { ...time, days: value } })}
          />
        ) : (
          <span id={`${id}-days`}>{days?.label ?? sentenceCase(vocabulary.label(time.days, true))}</span>
        )}
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id={`${id}-roll`}
          checked={time.rollForward}
          disabled={!actions}
          onCheckedChange={(checked) => change({ time: { ...time, rollForward: checked } })}
        />
        <FieldContent>
          <FieldLabel htmlFor={`${id}-roll`} className="font-normal">
            A deadline that falls on a weekend or holiday moves to the next business day
          </FieldLabel>
        </FieldContent>
      </Field>
      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor={`${id}-holidays`} className="font-normal">
          Holidays that aren&rsquo;t business days
        </FieldLabel>
        {actions && holidays ? (
          <ChoiceSelect
            id={`${id}-holidays`}
            className="w-56"
            value={holidays.value}
            choices={holidayChoices}
            onChange={(value) => change({ time: { ...time, holidays: value } })}
          />
        ) : (
          <span id={`${id}-holidays`}>{holidays?.label ?? time.holidays}</span>
        )}
      </Field>
      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor={`${id}-zone`} className="font-normal">
          Dates and times are in
        </FieldLabel>
        {actions ? (
          <TimeZonePicker
            id={`${id}-zone`}
            value={time.zone}
            onChange={(zone) => change({ time: { ...time, zone } })}
          />
        ) : (
          <span id={`${id}-zone`}>{zoneLabel(time.zone)}</span>
        )}
      </Field>
    </div>
  )
}

/** The default cure period: how long, counted from what; set one where the documents give none, or remove it. */
function Cure() {
  const { records, vocabulary } = useRulebookWorkspace()
  const { clauses, change, restore, isEditable } = useSettingsDraft()
  const saved = records.settings.clauses.cure
  const { cure } = clauses
  const dates = dateChoices(records.terms, vocabulary, null)
  const [isAdding, setIsAdding] = useState(false)
  const [value, setValue] = useState(cure ? String(cure.value) : "")
  const [unit, setUnit] = useState<T.TermKey>(cure?.unit ?? "calendar-day")
  const [after, setAfter] = useState<T.TermKey | null>(cure?.after.path.at(-1) ?? dates[0]?.value ?? null)
  const id = useId()
  if (!cure && !isAdding) {
    return (
      <div className="flex flex-col gap-3">
        <p>There&rsquo;s no default time to fix a violation.</p>
        {isEditable && dates.length > 0 ? (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setIsAdding(true)}>
            <PlusIcon />
            Set a time to fix a violation
          </Button>
        ) : null}
      </div>
    )
  }
  if (cure && !isEditable) {
    const from = cure.after.path.map((key) => `{{${key}}}`).join("\u2019s ")
    return (
      <p>
        <Statement
          text={`Within ${amountText(cure.value, cure.unit, vocabulary)} of the ${from}.`}
          vocabulary={vocabulary}
        />
      </p>
    )
  }
  const units = withCurrent(cureUnits, unit, vocabulary)
  // A period counted from a date further down a path than the request's own is read here, not edited.
  const isSimple = !cure || cure.after.path.length === 1
  /** Puts the period in the draft once it has a whole number of days and a date to count from. */
  const update = (next: { value?: string; unit?: T.TermKey; after?: T.TermKey }) => {
    const amount = Number(next.value ?? value)
    const from = next.after ?? after
    if ((next.value ?? value).trim() === "" || !Number.isInteger(amount) || amount < 0 || !from) {
      return
    }
    change({
      cure: {
        value: amount,
        unit: next.unit ?? unit,
        after: next.after || !cure ? { path: [from] } : cure.after,
        curedBy: cure?.curedBy ?? null,
        citations: cure?.citations ?? []
      }
    })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span>Within</span>
        <Input
          id={`${id}-value`}
          aria-label="How many"
          type="number"
          min={0}
          className="w-20"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            update({ value: event.target.value })
          }}
        />
        <ChoiceSelect
          label="Counted in"
          className="w-40"
          value={unit}
          choices={units}
          onChange={(next) => {
            setUnit(next)
            update({ unit: next })
          }}
        />
        <span>counted from the</span>
        {isSimple && after ? (
          <ChoiceSelect
            label="Counted from"
            className="w-72"
            value={after}
            choices={withCurrent(dates, after, vocabulary)}
            onChange={(next) => {
              setAfter(next)
              update({ after: next })
            }}
          />
        ) : (
          <Statement
            text={cure?.after.path.map((key) => `{{${key}}}`).join("\u2019s ") ?? ""}
            vocabulary={vocabulary}
          />
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => {
          setIsAdding(false)
          if (saved) {
            change({ cure: null })
          } else {
            restore("cure")
          }
        }}
      >
        {saved ? "Remove the default time" : "Cancel"}
      </Button>
    </div>
  )
}

type RowsProps = { label: string; children: ReactNode; onAdd: (() => void) | null; addLabel: string; empty: string }

/** A setting's rows, with a way to add one. */
function Rows({ label, children, onAdd, addLabel, empty }: RowsProps) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="flex flex-col gap-3">
      {hasRows ? (
        <ul className="divide-y rounded-lg border" aria-label={label}>
          {children}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
      {onAdd ? (
        <Button variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <PlusIcon />
          {addLabel}
        </Button>
      ) : null}
    </div>
  )
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} title="Remove" onClick={onRemove}>
      <Trash2Icon />
    </Button>
  )
}

/** Each kind of request with who decides it. */
function Deciders() {
  const { records, vocabulary } = useRulebookWorkspace()
  const { clauses, change: changeClauses, isEditable: actions } = useSettingsDraft()
  const { deciders } = clauses
  const requests = requestChoices(records.terms, vocabulary)
  const parties = partyChoices(records.terms, vocabulary)
  const update = (next: Clauses["deciders"]) => changeClauses({ deciders: next })
  const free = requests.find((request) => !deciders.some((item) => item.requestType === request.value))
  return (
    <Rows
      label="Who decides each request"
      empty="No one is named; the board decides."
      addLabel="Add a request"
      onAdd={
        actions && free && parties[0]
          ? () => update([...deciders, { requestType: free.value, party: parties[0]!.value, citations: [] }])
          : null
      }
    >
      {deciders.map((decider, index) => {
        const name = sentenceCase(vocabulary.label(decider.requestType, true))
        const change = (next: Partial<Clauses["deciders"][number]>) =>
          update(deciders.map((item, at) => (at === index ? { ...item, ...next } : item)))
        return (
          <li key={`${decider.requestType}-${index}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {actions ? (
              <>
                <ChoiceSelect
                  label="Request"
                  className="w-48"
                  value={decider.requestType}
                  choices={withCurrent(requests, decider.requestType, vocabulary)}
                  onChange={(requestType) => change({ requestType })}
                />
                <span className="text-muted-foreground">decided by</span>
                <ChoiceSelect
                  label={`Who decides ${name.toLowerCase()}`}
                  className="w-72 max-w-full"
                  value={decider.party}
                  choices={withCurrent(parties, decider.party, vocabulary)}
                  onChange={(party) => change({ party })}
                />
                <span className="ml-auto">
                  <RemoveButton name={name} onRemove={() => update(deciders.filter((_, at) => at !== index))} />
                </span>
              </>
            ) : (
              <span>
                {name}: decided by the {vocabulary.label(decider.party)}
              </span>
            )}
          </li>
        )
      })}
    </Rows>
  )
}

/** Who answers for whose violations, with what the documents limit it to. */
function Liability() {
  const { records, vocabulary } = useRulebookWorkspace()
  const { clauses, change: changeClauses, isEditable: actions } = useSettingsDraft()
  const { liability } = clauses
  const parties = partyChoices(records.terms, vocabulary)
  const update = (next: Clauses["liability"]) => changeClauses({ liability: next })
  const [first, second] = parties
  return (
    <Rows
      label="Who answers for whom"
      empty="Everyone answers only for themselves."
      addLabel="Add someone responsible for another"
      onAdd={
        actions && first && second
          ? () =>
              update([
                ...liability,
                {
                  liable: first.value,
                  actor: second.value,
                  appliesWhen: null,
                  until: null,
                  except: [],
                  citations: []
                }
              ])
          : null
      }
    >
      {liability.map((item, index) => {
        const name = `${vocabulary.label(item.liable)} for ${vocabulary.label(item.actor)}`
        const change = (next: Partial<Clauses["liability"][number]>) =>
          update(liability.map((found, at) => (at === index ? { ...found, ...next } : found)))
        return (
          <li key={`${item.liable}-${item.actor}-${index}`} className="flex flex-col gap-1.5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {actions ? (
                <>
                  <ChoiceSelect
                    label="Who is responsible"
                    className="w-52"
                    value={item.liable}
                    choices={withCurrent(parties, item.liable, vocabulary)}
                    onChange={(liable) => change({ liable })}
                  />
                  <span className="text-muted-foreground">answers for the violations of</span>
                  <ChoiceSelect
                    label="Whose violations"
                    className="w-52"
                    value={item.actor}
                    choices={withCurrent(parties, item.actor, vocabulary)}
                    onChange={(actor) => change({ actor })}
                  />
                  <span className="ml-auto">
                    <RemoveButton name={name} onRemove={() => update(liability.filter((_, at) => at !== index))} />
                  </span>
                </>
              ) : (
                <span>
                  {sentenceCase(vocabulary.label(item.liable))} answers for the violations of the{" "}
                  {vocabulary.label(item.actor)}.
                </span>
              )}
            </div>
            {liabilityLimits(item, vocabulary).map((line) => (
              <p key={line} className="text-muted-foreground">
                <Statement text={line} vocabulary={vocabulary} />
              </p>
            ))}
          </li>
        )
      })}
    </Rows>
  )
}

/** What a sanction needs first, as the documents state it; an administrator can remove one that's wrong. */
function Preconditions() {
  const { records, vocabulary } = useRulebookWorkspace()
  const { clauses, change, isEditable: actions } = useSettingsDraft()
  const { sanctionPreconditions } = clauses
  const [isAdding, setIsAdding] = useState(false)
  const requests = enforcementChoices(records.terms, vocabulary)
  return (
    <div className="flex flex-col gap-3">
      <Rows
        label="Before a fine or other sanction"
        empty="Nothing is required first."
        addLabel="Add a step before a sanction"
        onAdd={actions && requests.length > 0 && !isAdding ? () => setIsAdding(true) : null}
      >
        {sanctionPreconditions.map((precondition, index) => (
          <li key={index} className="flex items-start gap-2 px-3 py-2">
            <p className="min-w-0 flex-1">
              <Statement text={preconditionText(precondition, vocabulary)} vocabulary={vocabulary} />
            </p>
            {actions ? (
              <RemoveButton
                name={`step ${index + 1} before a sanction`}
                onRemove={() =>
                  change({ sanctionPreconditions: sanctionPreconditions.filter((_, at) => at !== index) })
                }
              />
            ) : null}
          </li>
        ))}
      </Rows>
      {isAdding ? (
        <NewPrecondition
          requests={requests}
          onAdd={(precondition) => {
            setIsAdding(false)
            change({ sanctionPreconditions: [...sanctionPreconditions, precondition] })
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : null}
    </div>
  )
}

/** The "every time" choice of when a step is needed. */
const always = "always"

type NewPreconditionProps = {
  requests: { value: T.TermKey; label: string }[]
  onAdd: (precondition: Clauses["sanctionPreconditions"][number]) => void
  onCancel: () => void
}

/** A new step before a sanction: for which requests, the date it needs recorded, and when it's needed. */
function NewPrecondition({ requests, onAdd, onCancel }: NewPreconditionProps) {
  const { records, vocabulary } = useRulebookWorkspace()
  const [requestType, setRequestType] = useState(requests[0]?.value ?? "")
  const dates = dateChoices(records.terms, vocabulary, requestType)
  const [needs, setNeeds] = useState<T.TermKey | null>(null)
  const [onlyWhen, setOnlyWhen] = useState<T.TermKey>(always)
  const needed = dates.find((date) => date.value === needs) ?? dates[0]
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span>For</span>
        <ChoiceSelect
          label="For which requests"
          className="w-48"
          value={requestType}
          choices={requests}
          onChange={(next) => {
            setRequestType(next)
            setNeeds(null)
            setOnlyWhen(always)
          }}
        />
        <span>record the</span>
        {needed ? (
          <ChoiceSelect
            label="The date needed first"
            className="w-56"
            value={needed.value}
            choices={dates}
            onChange={setNeeds}
          />
        ) : (
          <span className="text-muted-foreground">(no dates to choose)</span>
        )}
        <span>date first,</span>
        <ChoiceSelect
          label="When it's needed"
          className="w-72"
          value={onlyWhen}
          choices={[
            { value: always, label: "every time" },
            ...dates
              .filter((date) => date.value !== needed?.value)
              .map((date) => ({ value: date.value, label: `only if it has a ${date.label.toLowerCase()} date` }))
          ]}
          onChange={setOnlyWhen}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!needed}
          onClick={() => {
            if (needed) {
              onAdd(preconditionOf(requestType, needed.value, onlyWhen === always ? null : onlyWhen))
            }
          }}
        >
          Add the step
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

type Threshold = keyof T.Settings["policy"]["thresholds"]

const thresholdText: Record<Threshold, { label: string; description: string }> = {
  factConfidence: {
    label: "Use a detail read from an application when the review is at least",
    description: "Below this, the review treats the detail as unclear instead of relying on it."
  },
  judgmentConfidence: {
    label: "Decide a judgment call when the review is at least",
    description: "Below this, the committee decides."
  }
}

/** The organization's own choices: what a review recommends when a rule isn't met, and how sure it must be. */
function PolicyCard() {
  const { policy: draft, changePolicy: setDraft, isEditable: actions } = useSettingsDraft()
  const id = useId()
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Project application reviews</CardTitle>
        <CardDescription>
          How the review of an owner&rsquo;s project application decides: what it recommends when a rule isn&rsquo;t
          met, and how sure it must be. These are your organization&rsquo;s own choices, not your documents&rsquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 text-sm">
        <section className="flex flex-col gap-3" aria-labelledby={`${id}-recommend`}>
          <h4 id={`${id}-recommend`} className="font-medium">
            When an application doesn&rsquo;t meet a rule, recommend
          </h4>
          <div className="divide-y rounded-lg border">
            {remedyQuestions.map(({ remedy, label }) => (
              <Field key={remedy} orientation="horizontal" className="justify-between px-3 py-2">
                <FieldLabel htmlFor={`${id}-${remedy}`} className="font-normal">
                  {label}
                </FieldLabel>
                {actions ? (
                  <ChoiceSelect
                    id={`${id}-${remedy}`}
                    className="w-56"
                    value={draft.decisionPolicy[remedy]}
                    choices={actionChoices}
                    onChange={(action) =>
                      setDraft((current) => ({
                        ...current,
                        decisionPolicy: { ...current.decisionPolicy, [remedy]: action }
                      }))
                    }
                  />
                ) : (
                  <span id={`${id}-${remedy}`}>{actionLabels[draft.decisionPolicy[remedy]]}</span>
                )}
              </Field>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3" aria-labelledby={`${id}-sure`}>
          <h4 id={`${id}-sure`} className="font-medium">
            How sure the review must be
          </h4>
          <div className="divide-y rounded-lg border">
            {(Object.keys(thresholdText) as Threshold[]).map((threshold) => (
              <Field key={threshold} orientation="horizontal" className="justify-between px-3 py-2">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-${threshold}`} className="font-normal">
                    {thresholdText[threshold].label}
                  </FieldLabel>
                  <FieldDescription>{thresholdText[threshold].description}</FieldDescription>
                </FieldContent>
                <InputGroup className="w-28 shrink-0">
                  <InputGroupInput
                    id={`${id}-${threshold}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={5}
                    readOnly={!actions}
                    value={percentOf(draft.thresholds[threshold])}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        thresholds: { ...current.thresholds, [threshold]: shareOf(Number(event.target.value) || 0) }
                      }))
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>% sure</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
