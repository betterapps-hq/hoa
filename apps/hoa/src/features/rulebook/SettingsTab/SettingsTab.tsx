import { PlusIcon, Trash2Icon } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
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
import { amountText, citedProvision, countOf } from "../rulebookRecords"
import { Statement } from "../Statement/Statement"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { Precedence } from "./Precedence"
import {
  clauseCitations,
  clauseTitles,
  dayUnits,
  holidayLabels,
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

// The rulebook's settings (encoding.md, UX, Settings): what the documents say about deadlines, authority and
// enforcement, each as a small form in plain words with the passages it comes from, then the organization's own policy
// for what a review recommends and how sure it must be. The settings are reviewed and published like a rule.

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
const cureUnits = ["calendar-day", "business-day", "month", "year"]

/** Saves a change to some clauses, saying when it leaves problems to fix. */
function useSaveClauses() {
  const { actions } = useRulebookWorkspace()
  return async (clauses: Partial<Clauses>) => {
    if (!actions) {
      return
    }
    const found = await attempt(() => actions.saveSettings({ clauses, policy: null }), "The change wasn't saved.")
    if (found && found.length > 0) {
      toast.warning(`Saved, with ${countOf(found.length, "problem", "problems")} to fix.`)
    }
  }
}

/** The settings, each in its own card, after the review of them as a whole. */
export function SettingsTab() {
  const { records, issues, approval, actions } = useRulebookWorkspace()
  const { settings } = records
  const blockers = approval ? approvalBlockers(approval, { type: "settings" }) : []
  return (
    <div className="flex flex-col gap-4">
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
            <ReviewControls record={{ type: "settings" }} status={settings.review.status} blockers={blockers} />
          </CardContent>
        </Card>
      ) : null}
      <SettingCard
        name="precedence"
        description="When two documents disagree, the higher-ranked one wins. Drag a document onto another rank to make them equal, or between ranks to rank it on its own."
      >
        <PrecedenceSetting />
      </SettingCard>
      <SettingCard name="time" description="How the review counts the days a deadline gives.">
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
    </div>
  )
}

type SettingCardProps = { name: ClauseName; description: string; children: ReactNode }

/** One setting: what it means, the form, and the passages it comes from, when its documents state it. */
function SettingCard({ name, description, children }: SettingCardProps) {
  const { records, citations, source } = useRulebookWorkspace()
  const cited = [
    ...new Map(clauseCitations(name, records.settings.clauses).map((item) => [item.provisionKey, item])).values()
  ]
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

/** The order of authority as a draft: moves show at once, and save or reset together. */
function PrecedenceSetting() {
  const { records, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { precedence } = records.settings.clauses
  const [order, setOrder] = useState(precedence.order)
  const [isSaving, setIsSaving] = useState(false)
  const isChanged = JSON.stringify(order) !== JSON.stringify(precedence.order)
  return (
    <div className="flex flex-col gap-3">
      <Precedence order={order} onChange={actions ? setOrder : null} />
      {actions ? (
        <div className="flex gap-2">
          <Button
            disabled={!isChanged || isSaving}
            onClick={async () => {
              setIsSaving(true)
              await save({ precedence: { ...precedence, order } })
              setIsSaving(false)
            }}
          >
            {isSaving ? "Saving" : "Save the order"}
          </Button>
          <Button variant="ghost" disabled={!isChanged || isSaving} onClick={() => setOrder(precedence.order)}>
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** How days are counted, and whether a deadline on a day off moves to the next business day. */
function Deadlines() {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { time } = records.settings.clauses
  const id = useId()
  const days = dayChoices.find((choice) => choice.value === time.days)
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
            onChange={(value) => void save({ time: { ...time, days: value } })}
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
          onCheckedChange={(checked) => void save({ time: { ...time, rollForward: checked } })}
        />
        <FieldContent>
          <FieldLabel htmlFor={`${id}-roll`} className="font-normal">
            A deadline that falls on a weekend or holiday moves to the next business day
          </FieldLabel>
        </FieldContent>
      </Field>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Holidays</dt>
        <dd>{holidayLabels[time.holidays] ?? time.holidays}</dd>
        <dt>Time zone</dt>
        <dd>{zoneLabel(time.zone)}</dd>
      </dl>
    </div>
  )
}

/** The default cure period: how long, counted from what. */
function Cure() {
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { cure } = records.settings.clauses
  const [value, setValue] = useState(cure ? String(cure.value) : "")
  const id = useId()
  if (!cure) {
    return <p>There&rsquo;s no default time to fix a violation.</p>
  }
  const after = cure.after.path.map((key) => `{{${key}}}`).join("’s ")
  if (!actions) {
    return (
      <p>
        <Statement
          text={`Within ${amountText(cure.value, cure.unit, vocabulary)} of the ${after}.`}
          vocabulary={vocabulary}
        />
      </p>
    )
  }
  const units = withCurrent(
    cureUnits.map((key) => ({ value: key, label: sentenceCase(vocabulary.label(key, true)) })),
    cure.unit,
    vocabulary
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>Within</span>
      <Input
        id={`${id}-value`}
        aria-label="How many"
        type="number"
        min={0}
        className="w-20"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          const amount = Number(value)
          if (Number.isFinite(amount) && amount >= 0 && amount !== cure.value) {
            void save({ cure: { ...cure, value: amount } })
          }
        }}
      />
      <ChoiceSelect
        label="Counted in"
        className="w-40"
        value={cure.unit}
        choices={units}
        onChange={(unit) => void save({ cure: { ...cure, unit } })}
      />
      <span>
        of the <Statement text={after} vocabulary={vocabulary} />
      </span>
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
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { deciders } = records.settings.clauses
  const requests = requestChoices(records.terms, vocabulary)
  const parties = partyChoices(records.terms, vocabulary)
  const update = (next: Clauses["deciders"]) => void save({ deciders: next })
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
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { liability } = records.settings.clauses
  const parties = partyChoices(records.terms, vocabulary)
  const update = (next: Clauses["liability"]) => void save({ liability: next })
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
  const { records, vocabulary, actions } = useRulebookWorkspace()
  const save = useSaveClauses()
  const { sanctionPreconditions } = records.settings.clauses
  return (
    <Rows label="Before a fine or other sanction" empty="Nothing is required first." addLabel="" onAdd={null}>
      {sanctionPreconditions.map((precondition, index) => (
        <li key={index} className="flex items-start gap-2 px-3 py-2">
          <p className="min-w-0 flex-1">
            <Statement text={preconditionText(precondition, vocabulary)} vocabulary={vocabulary} />
          </p>
          {actions ? (
            <RemoveButton
              name={`step ${index + 1} before a sanction`}
              onRemove={() =>
                void save({ sanctionPreconditions: sanctionPreconditions.filter((_, at) => at !== index) })
              }
            />
          ) : null}
        </li>
      ))}
    </Rows>
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
  const { records, actions } = useRulebookWorkspace()
  const { policy } = records.settings
  const [draft, setDraft] = useState(policy)
  const [isSaving, setIsSaving] = useState(false)
  const id = useId()
  const isChanged = JSON.stringify(draft) !== JSON.stringify(policy)
  const save = async () => {
    if (!actions) {
      return
    }
    setIsSaving(true)
    await attempt(() => actions.saveSettings({ clauses: {}, policy: draft }), "The policy wasn't saved.")
    setIsSaving(false)
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Your recommendations</CardTitle>
        <CardDescription>
          Your organization&rsquo;s own choices, not your documents&rsquo;: what a review recommends, and how sure it
          must be.
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
                  <span id={`${id}-${remedy}`}>{actionLabels[policy.decisionPolicy[remedy]]}</span>
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
        {actions ? (
          <div className="flex gap-2">
            <Button disabled={!isChanged || isSaving} onClick={() => void save()}>
              {isSaving ? "Saving" : "Save"}
            </Button>
            {isChanged ? (
              <Button variant="ghost" onClick={() => setDraft(policy)}>
                Undo the changes
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
