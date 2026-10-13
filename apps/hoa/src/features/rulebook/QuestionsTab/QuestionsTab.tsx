import { CircleCheckIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle
} from "@/components/ui/questionnaire"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citedProvision, countOf } from "../rulebookRecords"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

/**
 * Interpretation and conflict questions (encoding.md, UX, Questions): the open ones are answered one at a time, each
 * reading saying which candidate rules it keeps, and each answer saved on the way to the next. Answering approves the
 * kept rules and rejects the others. Answered questions follow, each with the reading chosen, to change it.
 */
export function QuestionsTab() {
  const { records, actions } = useRulebookWorkspace()
  const open = records.questions.filter((question) => question.answer === null)
  // The questions one pass steps through, fixed when it starts, so answering one doesn't renumber the rest.
  const [pass, setPass] = useState<readonly string[]>(() => (actions ? open.map((question) => question.id) : []))
  if (records.questions.length === 0) {
    return <p className="text-sm text-muted-foreground">Processing left no questions.</p>
  }
  const stepping = pass.flatMap((id) => records.questions.filter((question) => question.id === id))
  const waiting = open.filter((question) => !pass.includes(question.id))
  const answered = records.questions.filter((question) => question.answer !== null && !pass.includes(question.id))
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Each question decides which reading of a provision the rules follow.
        {actions && open.length > 0 ? ` ${open.length} of ${records.questions.length} to answer.` : ""}
      </p>
      {actions && stepping.length > 0 ? (
        <QuestionSteps key={pass.join(" ")} questions={stepping} onFinish={() => setPass([])} />
      ) : null}
      {actions && stepping.length === 0 && waiting.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">{countOf(waiting.length, "question", "questions")} still to answer.</p>
          <Button size="sm" onClick={() => setPass(waiting.map((question) => question.id))}>
            Answer {waiting.length === 1 ? "it" : "them"}
          </Button>
        </div>
      ) : null}
      {actions && answered.length > 0 && stepping.length + waiting.length > 0 ? (
        <h3 className="pt-2 text-sm font-medium">Answered</h3>
      ) : null}
      {(actions ? answered : [...open, ...answered]).map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
    </div>
  )
}

/** A reading chosen for a question, and why, before it's saved. */
type Draft = { option: string; text: string }

const draftOf = (question: T.Question): Draft => ({
  option: question.answer ? String(question.answer.option) : "",
  text: question.answer?.text ?? ""
})

/** Whether a draft chooses a reading, or gives a reason, that isn't saved yet. */
function isUnsaved(question: T.Question, draft: Draft) {
  if (draft.option === "") {
    return false
  }
  const text = draft.text.trim() || null
  return question.answer?.option !== Number(draft.option) || question.answer.text !== text
}

/**
 * The open questions, one at a time: choosing a reading and moving on saves it, skipping leaves the question open,
 * and finishing saves the last one.
 */
function QuestionSteps({ questions, onFinish }: { questions: readonly T.Question[]; onFinish: () => void }) {
  const { actions } = useRulebookWorkspace()
  const [current, setCurrent] = useState(questions[0]?.id ?? "")
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(new Map())
  const [saving, setSaving] = useState(0)
  const [hasSaved, setHasSaved] = useState(false)
  // The question just skipped: leaving it saves nothing.
  const skipped = useRef<string | null>(null)
  const draftFor = (question: T.Question) => drafts.get(question.id) ?? draftOf(question)
  const edit = (question: T.Question, change: Partial<Draft>) =>
    setDrafts((all) => new Map(all).set(question.id, { ...(all.get(question.id) ?? draftOf(question)), ...change }))

  const leave = async (id: string) => {
    const question = questions.find((item) => item.id === id)
    if (skipped.current === id) {
      skipped.current = null
      return
    }
    if (!actions || !question || !isUnsaved(question, draftFor(question))) {
      return
    }
    const draft = draftFor(question)
    setSaving((count) => count + 1)
    const result = await attempt(
      () => actions.answerQuestion(question.id, Number(draft.option), draft.text.trim() || null),
      "The answer wasn't saved."
    )
    setSaving((count) => count - 1)
    if (result) {
      setHasSaved(true)
      const [kept] = result.skipped
      if (kept) {
        toast.message(`Answered. A kept rule still needs review: ${kept.reasons.join(" ")}`)
      }
    }
  }
  const savedText = hasSaved ? "Answers saved" : ""
  const items = questions.map((question) => ({
    name: question.id,
    choices: question.options.map((_, index) => ({ value: String(index) }))
  }))

  return (
    <Card>
      <CardContent>
        <Questionnaire
          items={items}
          item={current}
          shortcuts="letters"
          onItemChange={(next) => {
            void leave(current)
            setCurrent(next)
          }}
          onSubmit={(event) => {
            event.preventDefault()
            void leave(current).then(onFinish)
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <QuestionnaireProgress />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {saving > 0 ? "Saving" : savedText}
            </p>
          </div>
          {questions.map((question) => (
            <QuestionStep
              key={question.id}
              question={question}
              draft={draftFor(question)}
              onEdit={(change) => edit(question, change)}
            />
          ))}
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireSkip
              onClick={() => {
                skipped.current = current
                const question = questions.find((item) => item.id === current)
                if (question) {
                  edit(question, { option: "" })
                }
              }}
            />
            <QuestionnaireNext />
            <QuestionnaireSubmit>Finish</QuestionnaireSubmit>
          </QuestionnaireActions>
        </Questionnaire>
      </CardContent>
    </Card>
  )
}

function QuestionStep({
  question,
  draft,
  onEdit
}: {
  question: T.Question
  draft: Draft
  onEdit: (change: Partial<Draft>) => void
}) {
  const { records, citations, vocabulary, source } = useRulebookWorkspace()
  const titleOf = (key: T.RuleKey) => {
    const rule = records.rules.find((item) => item.key === key)
    return rule ? [sentenceCase(rule.title)] : []
  }
  return (
    <QuestionnaireItem name={question.id}>
      <QuestionnaireTitle className="leading-snug">{question.question}</QuestionnaireTitle>
      <QuestionnaireDescription>
        {question.kind === "conflict" ? "Provisions that conflict: " : "A provision to interpret: "}
        {question.citations.map((citation, index) => (
          <span key={citation.provisionKey}>
            {index > 0 ? ", " : ""}
            <ProvisionReference citation={citedProvision(citations, citation)} source={source} />
          </span>
        ))}
      </QuestionnaireDescription>
      {question.about.terms.length > 0 ? (
        <p className="flex flex-wrap gap-x-2 text-sm">
          <span className="text-muted-foreground">About</span>
          {question.about.terms.map((key) => (
            <TermChip key={key} termKey={key} vocabulary={vocabulary} />
          ))}
        </p>
      ) : null}
      <QuestionnaireChoices>
        {question.options.map((option, index) => {
          const kept = option.keeps.flatMap(titleOf)
          return (
            <QuestionnaireChoice
              key={option.label}
              value={String(index)}
              checked={draft.option === String(index)}
              onChange={(event) => {
                if (event.target.checked) {
                  onEdit({ option: String(index) })
                }
              }}
            >
              <span className="font-medium">{option.label}</span>
              <QuestionnaireChoiceDescription>
                {kept.length > 0 ? `Keeps: ${kept.join("; ")}` : "Keeps no rule"}
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
          )
        })}
      </QuestionnaireChoices>
      <QuestionnaireError />
      <Field>
        <FieldLabel htmlFor={`${question.id}-why`}>Why (optional)</FieldLabel>
        <Textarea
          id={`${question.id}-why`}
          value={draft.text}
          onChange={(event) => onEdit({ text: event.target.value })}
        />
      </Field>
    </QuestionnaireItem>
  )
}

function QuestionCard({ question }: { question: T.Question }) {
  const { citations, vocabulary, source, actions } = useRulebookWorkspace()
  const [isChanging, setIsChanging] = useState(false)
  const chosen = question.answer?.option ?? null
  const [option, setOption] = useState(chosen === null ? "" : String(chosen))
  const [text, setText] = useState(question.answer?.text ?? "")
  const [isBusy, setIsBusy] = useState(false)
  const isAnswering = actions !== null && (question.answer === null || isChanging)
  const idOf = (index: number) => `${question.id}-option-${index}`

  const answer = async () => {
    if (!actions || option === "") {
      return
    }
    setIsBusy(true)
    const result = await attempt(
      () => actions.answerQuestion(question.id, Number(option), text.trim() || null),
      "The answer wasn't saved."
    )
    setIsBusy(false)
    if (result) {
      setIsChanging(false)
      const [skipped] = result.skipped
      if (skipped) {
        toast.message(`Answered. A kept rule still needs review: ${skipped.reasons.join(" ")}`)
      } else {
        toast.success("Answered.")
      }
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="leading-snug">{question.question}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {question.kind === "conflict" ? "Provisions that conflict" : "A provision to interpret"}
            {question.answer ? ", answered" : ""}
          </span>
          {question.citations.map((citation) => (
            <ProvisionReference
              key={citation.provisionKey}
              citation={citedProvision(citations, citation)}
              source={source}
            />
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {question.about.terms.length > 0 ? (
          <p className="flex flex-wrap gap-x-2 text-sm">
            <span className="text-muted-foreground">About</span>
            {question.about.terms.map((key) => (
              <TermChip key={key} termKey={key} vocabulary={vocabulary} />
            ))}
          </p>
        ) : null}
        {isAnswering ? (
          <RadioGroup value={option} onValueChange={(value) => setOption(String(value))} aria-label="Readings">
            {question.options.map((item, index) => (
              <OptionBlock key={item.label} option={item}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value={String(index)} id={idOf(index)} aria-labelledby={`${idOf(index)}-label`} />
                  <FieldLabel id={`${idOf(index)}-label`} htmlFor={idOf(index)} className="font-medium">
                    {item.label}
                  </FieldLabel>
                </div>
              </OptionBlock>
            ))}
          </RadioGroup>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Readings">
            {question.options.map((item, index) =>
              chosen === index ? (
                <li key={item.label}>
                  <ChosenReading option={item} why={question.answer?.text ?? null} />
                </li>
              ) : (
                <li key={item.label}>
                  <SetAsideReading option={item} />
                </li>
              )
            )}
          </ul>
        )}
        {isAnswering ? (
          <Field>
            <FieldLabel htmlFor={`${question.id}-note`}>Why (optional)</FieldLabel>
            <Textarea id={`${question.id}-note`} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
        ) : null}
      </CardContent>
      {actions ? (
        <CardFooter className="flex flex-wrap gap-2">
          {isAnswering ? (
            <>
              <Button
                variant={option === "" ? "outline" : "default"}
                disabled={option === "" || isBusy}
                onClick={() => void answer()}
              >
                {isBusy ? "Saving" : "Answer"}
              </Button>
              {isChanging ? (
                <Button variant="ghost" onClick={() => setIsChanging(false)}>
                  Cancel
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="ghost" onClick={() => setIsChanging(true)}>
              Change the answer
            </Button>
          )}
        </CardFooter>
      ) : null}
    </Card>
  )
}

/** The reading an answer chose: marked as the answer, with the rules it keeps and the reason given. */
function ChosenReading({ option, why }: { option: T.Question["options"][number]; why: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CircleCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="font-medium">{option.label}</p>
        <Badge>Your answer</Badge>
      </div>
      <KeptRules option={option} />
      {why ? (
        <p className="pl-6 text-sm">
          <span className="text-muted-foreground">Why: </span>
          {why}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A reading the answer didn't choose. Its rules were rejected, so they're left out of the rulebook and have no card to
 * open; the reading says so instead of naming them.
 */
function SetAsideReading({ option }: { option: T.Question["options"][number] }) {
  const { records } = useRulebookWorkspace()
  const shown = option.keeps.filter((key) => records.rules.some((rule) => rule.key === key))
  const rulesNote = (() => {
    if (shown.length > 0) {
      return (
        <ul className="flex flex-col gap-1 text-sm" aria-label={`Rules set aside by: ${option.label}`}>
          {shown.map((key) => (
            <li key={key}>
              <RuleLink ruleKey={key} />
            </li>
          ))}
        </ul>
      )
    }
    if (option.keeps.length === 0) {
      return null
    }
    return (
      <p className="text-sm">{option.keeps.length === 1 ? "Its rule is" : "Its rules are"} left out of the rulebook.</p>
    )
  })()
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed p-3 text-muted-foreground">
      <p className="text-sm">
        <span className="font-medium">{option.label}</span>
        <span className="ml-2">Not chosen</span>
      </p>
      {rulesNote}
    </div>
  )
}

/** The rules a reading keeps, each opening its card. */
function KeptRules({ option }: { option: T.Question["options"][number] }) {
  return option.keeps.length > 0 ? (
    <ul className="flex flex-col gap-1 pl-6 text-sm" aria-label={`Rules kept by: ${option.label}`}>
      {option.keeps.map((key) => (
        <li key={key}>
          <RuleLink ruleKey={key} />
        </li>
      ))}
    </ul>
  ) : (
    <p className="pl-6 text-sm text-muted-foreground">Keeps no rule.</p>
  )
}

function OptionBlock({ option, children }: { option: T.Question["options"][number]; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      {children}
      <KeptRules option={option} />
    </div>
  )
}
