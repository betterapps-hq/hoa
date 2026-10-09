import { useDidUpdate } from "@mantine/hooks"
import { BracesIcon, CheckIcon, PencilIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { approvalBlockers } from "@/rulebook/review"
import { describeRule } from "@/schema/describe"
import type * as T from "@/schema/types"
import type { RuleDraft } from "@/schema/zod"
import { attempt, reviewRecord } from "../attempt"
import { citationTitle } from "../CitationPanel/CitationPanel.utils"
import { CitationText } from "../CitationText/CitationText"
import { IssueList } from "../IssueList/IssueList"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citedProvision, countOf, relatedRules } from "../rulebookRecords"
import { RuleForm } from "../RuleForm/RuleForm"
import { RuleJsonEditor } from "../RuleJsonEditor/RuleJsonEditor"
import { domainLabels, remedyLabels, reviewLabels } from "../ruleLabels"
import { RuleLink } from "../RuleLink/RuleLink"
import { RulePreview } from "../RulePreview/RulePreview"
import { Statement } from "../Statement/Statement"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { cureLabel, kindLabel } from "./RuleCard.utils"

export type RuleCardProps = {
  rule: T.Rule
  /** Called when the rule is deleted. */
  onDeleted: () => void
}

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
 * A rule in full (encoding.md, UX): its statement, what it says in the schema's words with every term a chip, who it
 * binds, the rules it overrides or enforces, its citations, its issues, a preview against typed facts, and in a draft
 * the review actions and editors.
 */
export function RuleCard({ rule, onDeleted }: RuleCardProps) {
  const { records, vocabulary, citations, issues, approval, source, actions } = useRulebookWorkspace()
  const [mode, setMode] = useState<"read" | "form" | "json">("read")
  const [isBusy, setIsBusy] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)
  // Switching between reading and editing starts at the top of the card; opening it leaves the sheet's header in view.
  useDidUpdate(() => {
    topRef.current?.scrollIntoView({ block: "start" })
  }, [mode])
  const chip = (key: T.TermKey | null) => (key ? <TermChip termKey={key} vocabulary={vocabulary} /> : "None")
  const related = relatedRules(rule, records.rules)
  const blockers = approval ? approvalBlockers(approval, { type: "rule", key: rule.key }) : []

  const run = async <R,>(action: () => Promise<R>, fallback: string) => {
    setIsBusy(true)
    const result = await attempt(action, fallback)
    setIsBusy(false)
    return result
  }
  const save = async (draft: RuleDraft) => {
    if (!actions) {
      return
    }
    const found = await run(() => actions.saveRule(draft), "The rule wasn't saved.")
    if (found) {
      setMode("read")
      toast.success(found.length > 0 ? `Saved, with ${countOf(found.length, "problem", "problems")} to fix.` : "Saved.")
    }
  }
  const review = async (status: T.Review["status"]) => {
    if (actions) {
      setIsBusy(true)
      await reviewRecord(actions, { type: "rule", key: rule.key }, status)
      setIsBusy(false)
    }
  }

  if (mode !== "read") {
    return (
      <div ref={topRef}>
        {mode === "form" ? (
          <RuleForm rule={rule} onSave={save} onCancel={() => setMode("read")} />
        ) : (
          <RuleJsonEditor rule={rule} onSave={save} onCancel={() => setMode("read")} />
        )}
      </div>
    )
  }

  return (
    <div ref={topRef} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rule.review.status === "rejected" ? "destructive" : "outline"}>
          {reviewLabels[rule.review.status]}
        </Badge>
        <Badge variant="secondary">{kindLabel(rule)}</Badge>
        <Badge variant="outline">{domainLabels[rule.domain]}</Badge>
        <code className="text-xs break-all text-muted-foreground">{rule.key}</code>
      </div>

      <Section title="Statement">
        <p className="leading-relaxed">
          <Statement text={rule.statement} vocabulary={vocabulary} />
        </p>
      </Section>

      <Section title="In the schema’s words">
        <p className="leading-relaxed">
          <Statement text={describeRule(rule, vocabulary, { linkTerms: true })} vocabulary={vocabulary} />
        </p>
      </Section>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
      </dl>

      <RuleList title="Overrides" keys={related.overrides} />
      <RuleList title="Overridden by" keys={related.overriddenBy} />
      <RuleList title="Enforces" keys={related.enforces} />
      <RuleList title="Enforced by" keys={related.enforcedBy} />
      <RuleList title="Limits" keys={related.limits} />

      <Section title="Citations">
        <ul className="flex flex-col gap-4">
          {rule.citations.map((citation) => {
            const cited = citedProvision(citations, citation)
            return (
              <li key={citation.provisionKey} className="flex flex-col gap-2 rounded-md border p-3">
                <span className="font-medium">{citationTitle(cited)}</span>
                <CitationText citation={cited} />
                <span>
                  <ProvisionReference citation={cited} source={source}>
                    View in document
                  </ProvisionReference>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Issues">
        <IssueList
          issues={rule.issues}
          found={issues.get(rule.key) ?? []}
          onResolve={
            actions ? (index, note) => actions.resolveIssue({ type: "rule", key: rule.key }, index, note) : undefined
          }
        />
      </Section>

      <Section title="Try it">
        <RulePreview rule={rule} />
      </Section>

      {actions ? (
        <Section title="Review">
          {blockers.length > 0 && rule.review.status !== "approved" ? (
            <div className="text-sm">
              <p>Before it can be approved:</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {rule.review.status === "approved" ? null : (
              <Button disabled={isBusy || blockers.length > 0} onClick={() => void review("approved")}>
                <CheckIcon />
                Approve
              </Button>
            )}
            {rule.review.status === "rejected" ? null : (
              <Button variant="outline" disabled={isBusy} onClick={() => void review("rejected")}>
                <XIcon />
                Reject
              </Button>
            )}
            {rule.review.status === "proposed" ? null : (
              <Button variant="outline" disabled={isBusy} onClick={() => void review("proposed")}>
                <RotateCcwIcon />
                Back to review
              </Button>
            )}
            <Button variant="outline" disabled={isBusy} onClick={() => setMode("form")}>
              <PencilIcon />
              Edit
            </Button>
            <Button variant="outline" disabled={isBusy} onClick={() => setMode("json")}>
              <BracesIcon />
              Edit as JSON
            </Button>
            <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
              <AlertDialogTrigger render={<Button variant="destructive" disabled={isBusy} />}>
                <Trash2Icon />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {rule.title} leaves the draft. A provision only it cites becomes uncovered.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setIsDeleting(false)
                      void run(async () => {
                        await actions.removeRule(rule.key)
                        onDeleted()
                      }, "The rule wasn't deleted.")
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Section>
      ) : null}
    </div>
  )
}
