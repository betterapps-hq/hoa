import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type * as T from "@/schema/types"
import { attempt } from "../attempt"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citedProvision } from "../rulebookRecords"
import { RuleLink } from "../RuleLink/RuleLink"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

/**
 * Interpretation and conflict questions (encoding.md, UX, Questions): each with its citations and its options, each
 * option listing the candidate rules it keeps. Answering approves the kept rules and rejects the others.
 */
export function QuestionsTab() {
  const { records, actions } = useRulebookWorkspace()
  if (records.questions.length === 0) {
    return <p className="text-sm text-muted-foreground">Processing left no questions.</p>
  }
  const open = records.questions.filter((question) => question.answer === null)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Each question decides which reading of a provision the rules follow.
        {actions && open.length > 0 ? ` ${open.length} of ${records.questions.length} to answer.` : ""}
      </p>
      {[...open, ...records.questions.filter((question) => question.answer !== null)].map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
    </div>
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
          <ul className="flex flex-col gap-3">
            {question.options.map((item, index) => (
              <li key={item.label}>
                <OptionBlock option={item}>
                  <p className="font-medium">
                    {item.label}
                    {chosen === index ? <span className="ml-2 font-normal text-muted-foreground">(chosen)</span> : null}
                  </p>
                </OptionBlock>
              </li>
            ))}
          </ul>
        )}
        {question.answer?.text && !isAnswering ? <p className="text-sm">Note: {question.answer.text}</p> : null}
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

function OptionBlock({ option, children }: { option: T.Question["options"][number]; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      {children}
      {option.keeps.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-6 text-sm" aria-label={`Rules kept by: ${option.label}`}>
          {option.keeps.map((key) => (
            <li key={key}>
              <RuleLink ruleKey={key} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-6 text-sm text-muted-foreground">Keeps no rule.</p>
      )}
    </div>
  )
}
