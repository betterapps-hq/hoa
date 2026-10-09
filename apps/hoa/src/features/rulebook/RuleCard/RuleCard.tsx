import { useDidUpdate } from "@mantine/hooks"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { approvalBlockers } from "@/rulebook/review"
import { describeRule } from "@/schema/describe"
import type * as T from "@/schema/types"
import type { RuleDraft } from "@/schema/zod"
import { attempt } from "../attempt"
import { CitationText } from "../CitationText/CitationText"
import { IssueList } from "../IssueList/IssueList"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import { citedProvision, countOf, relatedRules } from "../rulebookRecords"
import { RuleForm } from "../RuleForm/RuleForm"
import { domainLabels, remedyLabels } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { RulePreview } from "../RulePreview/RulePreview"
import { Statement } from "../Statement/Statement"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { cureLabel, kindLabel } from "./RuleCard.utils"

export type RuleCardProps = { rule: T.Rule }

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `rule-card-${title.toLowerCase().replaceAll(/\W+/g, "-")}`
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function RuleList({ title, keys }: { title: string; keys: T.RuleKey[] }) {
  return keys.length > 0 ? (
    <Section title={title}>
      <ul className="flex flex-col gap-1.5">
        {keys.map((key) => (
          <li key={key}>
            <RuleLink ruleKey={key} />
          </li>
        ))}
      </ul>
    </Section>
  ) : null
}

/**
 * A rule in full (encoding.md, UX): in a draft its review first (Approve, then Reject and Edit), then its statement,
 * the provisions it cites, any problems, and behind disclosures what it says in the schema's words, who it binds, the
 * rules it relates to, and a preview against typed facts.
 */
export function RuleCard({ rule }: RuleCardProps) {
  const { records, vocabulary, citations, issues, approval, source, actions, audience } = useRulebookWorkspace()
  const [isEditing, setIsEditing] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  // Switching between reading and editing starts at the top of the card; opening it leaves the sheet's header in view.
  useDidUpdate(() => {
    topRef.current?.scrollIntoView({ block: "start" })
  }, [isEditing])
  const chip = (key: T.TermKey | null) => (key ? <TermChip termKey={key} vocabulary={vocabulary} /> : "None")
  const related = relatedRules(rule, records.rules)
  const blockers = approval ? approvalBlockers(approval, { type: "rule", key: rule.key }) : []
  const found = issues.get(rule.key) ?? []
  const hasProblems = rule.issues.some((issue) => issue.resolution === null) || found.length > 0

  const save = async (draft: RuleDraft) => {
    if (!actions) {
      return
    }
    const problems = await attempt(() => actions.saveRule(draft), "The rule wasn't saved.")
    if (problems) {
      setIsEditing(false)
      toast.success(
        problems.length > 0 ? `Saved, with ${countOf(problems.length, "problem", "problems")} to fix.` : "Saved."
      )
    }
  }

  if (isEditing) {
    return (
      <div ref={topRef}>
        <RuleForm rule={rule} onSave={save} onCancel={() => setIsEditing(false)} />
      </div>
    )
  }

  const [main, ...more] = rule.citations.map((citation) => citedProvision(citations, citation))
  return (
    <div ref={topRef} className="flex flex-col gap-6">
      <ReviewControls
        record={{ type: "rule", key: rule.key }}
        status={rule.review.status}
        blockers={blockers}
        onEdit={() => setIsEditing(true)}
      />

      <Section title="Statement">
        <p className="text-base leading-relaxed">
          <Statement text={rule.statement} vocabulary={vocabulary} />
        </p>
      </Section>

      <Section title={rule.citations.length === 1 ? "Source" : "Sources"}>
        {main ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <ProvisionReference citation={main} source={source}>
                {main.heading ? `${main.label}: ${main.heading}` : main.label}
              </ProvisionReference>
              <div className="line-clamp-4 text-muted-foreground">
                <CitationText citation={main} />
              </div>
            </div>
            {more.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label="Also cited">
                {more.map((citation) => (
                  <li key={citation.provisionKey}>
                    <ProvisionReference citation={citation} source={source}>
                      {citation.heading ? `${citation.label}: ${citation.heading}` : citation.label}
                    </ProvisionReference>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground">It cites no provision.</p>
        )}
      </Section>

      {hasProblems && audience === "administrator" ? (
        <Section title="Problems">
          <IssueList
            issues={rule.issues}
            found={found}
            onResolve={
              actions ? (index, note) => actions.resolveIssue({ type: "rule", key: rule.key }, index, note) : undefined
            }
          />
        </Section>
      ) : null}

      <Accordion multiple className="border-t">
        <AccordionItem value="details">
          <AccordionTrigger>What it says, in detail</AccordionTrigger>
          <AccordionContent className="flex flex-col gap-5">
            <p className="leading-relaxed">
              <Statement text={describeRule(rule, vocabulary, { linkTerms: true })} vocabulary={vocabulary} />
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Kind">{kindLabel(rule)}</Detail>
              <Detail label="Applies to">
                {rule.appliesTo ? chip(rule.appliesTo) : "The subjects of the rules it overrides"}
              </Detail>
              <Detail label="Request types">
                <span className="flex flex-wrap gap-x-2">
                  {rule.requestTypes.map((key) => (
                    <TermChip key={key} termKey={key} vocabulary={vocabulary} />
                  ))}
                </span>
              </Detail>
              {rule.kind === "norm" ? (
                <>
                  <Detail label="Bearer">{rule.bearer ? chip(rule.bearer) : "None: a requirement binds no one"}</Detail>
                  {rule.beneficiary ? <Detail label="Owed to">{chip(rule.beneficiary)}</Detail> : null}
                  {rule.decidedBy ? <Detail label="Decided by">{chip(rule.decidedBy)}</Detail> : null}
                  <Detail label="Remedy">{rule.remedy ? remedyLabels[rule.remedy] : "None"}</Detail>
                  <Detail label="Cure period">{cureLabel(rule.cure, vocabulary)}</Detail>
                </>
              ) : null}
              {rule.kind === "discretion" ? <Detail label="Decided by">{chip(rule.decidedBy)}</Detail> : null}
              {rule.kind === "sanction" ? (
                <>
                  <Detail label="Imposed by">{chip(rule.imposedBy)}</Detail>
                  <Detail label="Against">
                    <span className="flex flex-wrap gap-x-2">
                      {rule.against.map((key) => (
                        <TermChip key={key} termKey={key} vocabulary={vocabulary} />
                      ))}
                    </span>
                  </Detail>
                </>
              ) : null}
              <Detail label="In effect from">{rule.effectiveFrom}</Detail>
              <Detail label="Domain">{domainLabels[rule.domain]}</Detail>
              {audience === "administrator" ? (
                <Detail label="Key">
                  <code className="text-xs break-all">{rule.key}</code>
                </Detail>
              ) : null}
            </dl>
            <RuleList title="Overrides" keys={related.overrides} />
            <RuleList title="Overridden by" keys={related.overriddenBy} />
            <RuleList title="Enforces" keys={related.enforces} />
            <RuleList title="Enforced by" keys={related.enforcedBy} />
            <RuleList title="Limits" keys={related.limits} />
            {hasProblems ? null : (
              <p className="text-muted-foreground">
                {rule.issues.length > 0 ? "Its problems are resolved." : "No problems found."}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
        {audience === "administrator" ? (
          <AccordionItem value="try">
            <AccordionTrigger>Try it against facts</AccordionTrigger>
            <AccordionContent>
              <RulePreview rule={rule} />
            </AccordionContent>
          </AccordionItem>
        ) : null}
      </Accordion>
    </div>
  )
}
