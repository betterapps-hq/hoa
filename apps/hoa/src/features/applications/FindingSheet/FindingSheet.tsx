import { useRef, type ReactNode, type RefObject } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { renderRuleMarkers } from "@/review/ruleMarkers"
import type { Finding } from "@/schema/types"
import { CitationText } from "../../rulebook/CitationText/CitationText"
import { ProvisionReference } from "../../rulebook/ProvisionReference/ProvisionReference"
import { Statement } from "../../rulebook/Statement/Statement"
import { factStateLabels, factText, percent, sentenceCase } from "../applicationDisplay"
import { EvidenceList } from "../EvidenceList/EvidenceList"
import { OutcomeChip } from "../OutcomeChip/OutcomeChip"
import { actionItemFor, actionItemId, entityLabel, type ReviewContext } from "../reviewContext"
import { ReviewRuleReference } from "../ReviewRuleReference/ReviewRuleReference"
import {
  effectLabels,
  inputSource,
  inputSourceLabel,
  judgmentLabels,
  matchText,
  statementResult
} from "./FindingSheet.utils"

export type FindingSheetProps = {
  context: ReviewContext
  /** The finding shown; kept while the sheet closes. */
  finding: Finding | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SectionProps = { title: string; children: ReactNode }

function Section({ title, children }: SectionProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  )
}

type InputsProps = { context: ReviewContext; finding: Finding }

function Inputs({ context, finding }: InputsProps) {
  const { review, vocabulary, audience } = context
  const label = (id: string) => entityLabel(context, id)
  return (
    <ul className="flex flex-col gap-3">
      {finding.inputs.map((input) => {
        const source = inputSource(review, input)
        const fact = "fact" in source ? source.fact : null
        const state = fact ? factStateLabels[fact.state] : null
        return (
          <li key={`${input.entity} ${input.property}`} className="flex flex-col gap-1.5 rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium">
                {sentenceCase(vocabulary.label(input.property))}
                {input.entity === finding.entity ? null : (
                  <span className="font-normal text-muted-foreground"> of {label(input.entity)}</span>
                )}
              </span>
              <Badge variant={source.kind === "not-provided" ? "outline" : "secondary"}>
                {inputSourceLabel(source.kind, audience)}
              </Badge>
            </div>
            {fact ? (
              <p>
                {factText(fact, vocabulary, label)}
                {state ? <span className="text-muted-foreground"> ({state.toLowerCase()})</span> : null}
                {fact.confidence !== null && source.kind !== "portal" ? (
                  <span className="text-muted-foreground">, confidence {percent(fact.confidence)}</span>
                ) : null}
              </p>
            ) : null}
            {source.kind === "matched" ? (
              <p className="text-muted-foreground">{matchText(source.normalization)}</p>
            ) : null}
            {source.kind === "computed" ? <p className="text-muted-foreground">Worked out from other facts.</p> : null}
            {source.kind === "not-provided" ? <p className="text-muted-foreground">The packet doesn’t say.</p> : null}
            {fact ? <EvidenceList evidence={fact.evidence} context={context} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

type FindingDetailProps = {
  context: ReviewContext
  finding: Finding
  onClose: () => void
  /** The title, which takes focus when the sheet opens. */
  titleRef: RefObject<HTMLHeadingElement | null>
}

function FindingDetail({ context, finding, onClose, titleRef }: FindingDetailProps) {
  const { review, vocabulary, audience } = context
  const rule = context.rules.get(finding.ruleKey)
  const [citation] = rule?.citations ?? []
  const action = audience === "homeowner" ? actionItemFor(review, finding) : null
  const documents = review.documents.filter(
    (document) => document.ruleKey === finding.ruleKey && document.entity === finding.entity
  )
  const showActionItem = (id: string) => {
    onClose()
    // After the sheet gives focus back, move it to the action item.
    requestAnimationFrame(() => {
      const element = document.getElementById(id)
      element?.scrollIntoView({ block: "center" })
      element?.focus()
    })
  }
  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
          {rule?.title ?? finding.ruleKey}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <span>{entityLabel(context, finding.entity)}</span>
          <OutcomeChip outcome={finding.outcome} />
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <Section title="The rule">
          <ReviewRuleReference ruleKey={finding.ruleKey} context={context} title={null} />
          {rule ? <Statement text={rule.statement} vocabulary={vocabulary} /> : null}
          {citation ? (
            <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
              <CitationText citation={citation} />
              <p>
                <ProvisionReference citation={citation} source={context.source}>
                  View in document
                  <span className="sr-only">: {citation.label}</span>
                </ProvisionReference>
              </p>
            </div>
          ) : null}
        </Section>
        <Section title="Why">
          <p>{finding.reason}</p>
          {action ? (
            <Button
              variant="link"
              className="h-auto justify-start p-0 text-left whitespace-normal"
              onClick={() => showActionItem(actionItemId(action.item))}
            >
              {action.title}: {renderRuleMarkers(action.item.text, (key) => context.rules.get(key)?.title ?? key)}
            </Button>
          ) : null}
        </Section>
        {audience === "committee" && finding.modifiedBy.length > 0 ? (
          <Section title="Rules that changed this finding">
            <ul className="flex flex-col gap-2">
              {finding.modifiedBy.map((modifier) => (
                <li key={`${modifier.ruleKey} ${modifier.effect}`} className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">{effectLabels[modifier.effect]}</span>
                  <ReviewRuleReference ruleKey={modifier.ruleKey} context={context} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {finding.inputs.length > 0 ? (
          <Section title="What it read">
            <Inputs context={context} finding={finding} />
          </Section>
        ) : null}
        {finding.judgment ? (
          <Section title="Judgment">
            <p>
              {judgmentLabels[finding.judgment.answer]}
              <span className="text-muted-foreground">, confidence {percent(finding.judgment.confidence)}</span>
            </p>
            <p>{finding.judgment.rationale}</p>
            <EvidenceList evidence={finding.judgment.evidence} context={context} />
          </Section>
        ) : null}
        {documents.length > 0 || finding.statements.length > 0 ? (
          <Section title="Documents">
            {documents.map((document) => (
              <div key={document.documentType} className="flex flex-col gap-1">
                <p>
                  {sentenceCase(vocabulary.label(document.documentType))}:{" "}
                  {document.present ? "in the packet" : "not in the packet"}
                  {document.signedBy.length > 0
                    ? `, signed by ${document.signedBy.map((id) => entityLabel(context, id)).join(" and ")}`
                    : ""}
                </p>
                <EvidenceList evidence={document.evidence} context={context} />
              </div>
            ))}
            {finding.statements.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {finding.statements.map((statement) => (
                  <li key={statement.statement} className="flex flex-col gap-1">
                    <span>
                      <Badge variant={statement.confirmed === false ? "destructive" : "outline"}>
                        {statementResult(statement.confirmed)}
                      </Badge>{" "}
                      {statement.statement}
                    </span>
                    {statement.quote ? (
                      <blockquote className="border-l-2 pl-3 break-words italic">“{statement.quote}”</blockquote>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        ) : null}
      </div>
    </>
  )
}

/** One finding in full: the rule and its provision, why, every fact it read and where each came from. */
export function FindingSheet({ context, finding, open, onOpenChange }: FindingSheetProps) {
  // The title takes focus, so a reader hears which finding opened and no rule's preview pops up over the sheet.
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl" initialFocus={titleRef}>
        {finding ? (
          <FindingDetail context={context} finding={finding} onClose={() => onOpenChange(false)} titleRef={titleRef} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
