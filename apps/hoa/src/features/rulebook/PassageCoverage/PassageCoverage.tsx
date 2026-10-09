import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"
import type { CoveragePassage, OutsidePassage } from "@/rulebook/coverage"
import type * as T from "@/schema/types"
import { coverageKindLabels, coverageKindStyles } from "../coverageKinds"
import { valueText } from "../CoverageReader/CoverageReader.utils"
import { NoRuleReason } from "../NoRuleReason/NoRuleReason"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citationLabel, citedProvision } from "../rulebookRecords"
import { RuleLink } from "../RuleLink/RuleLink"
import { clauseTitles, describeClause } from "../SettingsTab/SettingsTab.utils"
import { Statement } from "../Statement/Statement"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type PassageCoverageProps = {
  passage: CoveragePassage
  /** The provisions whose text cites the passage's provision. */
  referencedBy: T.ProvisionKey[]
  /** The panel's heading, which takes focus when a passage is chosen from the keyboard. */
  headingRef?: Ref<HTMLHeadingElement>
}

/**
 * Everything that covers or cites a passage (encoding.md, UX, Coverage): the rules with their statements, the terms it
 * defines, the settings clauses, the questions, its reason for having no rule, and the provisions that refer to it.
 * Each opens what it names: a rule's card, a term's definition, a provision on its page.
 */
export function PassageCoverage({ passage, referencedBy, headingRef }: PassageCoverageProps) {
  const style = coverageKindStyles[passage.kind]
  const Icon = style.icon
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus-visible:outline-none">
          {passage.type === "outside" ? `Page ${passage.passage.page}` : citationLabel(passage.provision.key)}
          {passage.type === "provision" && passage.part === "wrap-up" ? ", its closing words" : ""}
        </h3>
        <p className="flex items-center gap-1.5">
          <Icon className={cn("size-4 shrink-0", style.iconColor)} aria-hidden />
          {coverageKindLabels[passage.kind]}
        </p>
      </div>
      {passage.type === "provision" ? (
        <ProvisionCoverage passage={passage} referencedBy={referencedBy} />
      ) : (
        <OutsideCoverage passage={passage.passage} />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  )
}

function ProvisionCoverage({
  passage,
  referencedBy
}: {
  passage: Extract<CoveragePassage, { type: "provision" }>
  referencedBy: T.ProvisionKey[]
}) {
  const { records, coverage, citations, vocabulary, source } = useRulebookWorkspace()
  const { provision } = passage
  const cited = coverage.byProvision.get(provision.key)
  const rules = (cited?.rules ?? []).flatMap((key) => records.rules.filter((rule) => rule.key === key))
  const questions = (cited?.questions ?? []).flatMap((id) => records.questions.filter((item) => item.id === id))
  const values = [...new Map(passage.marks.map((mark) => [JSON.stringify(mark.value), mark.value])).values()]
  const reference = (key: T.ProvisionKey) =>
    citedProvision(citations, { provisionKey: key, highlight: null, region: null })
  const isUncited =
    rules.length === 0 &&
    (cited?.terms.length ?? 0) === 0 &&
    (cited?.clauses.length ?? 0) === 0 &&
    questions.length === 0

  return (
    <>
      {rules.length > 0 ? (
        <Section title={`Rules (${rules.length})`}>
          <ul className="flex flex-col gap-3">
            {rules.map((rule) => (
              <li key={rule.key} className="flex flex-col gap-1">
                <RuleLink ruleKey={rule.key} />
                <Statement text={rule.statement} vocabulary={vocabulary} className="text-muted-foreground" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {cited && cited.terms.length > 0 ? (
        <Section title={`Terms it defines (${cited.terms.length})`}>
          <ul className="flex flex-col gap-2">
            {cited.terms.map((key) => (
              <li key={key} className="flex flex-col gap-0.5">
                <TermChip termKey={key} vocabulary={vocabulary} />
                <span className="text-muted-foreground">{vocabulary.get(key)?.definition ?? "No definition."}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {cited && cited.clauses.length > 0 ? (
        <Section title="Settings">
          <ul className="flex flex-col gap-2">
            {cited.clauses.map((name) => (
              <li key={name} className="flex flex-col gap-0.5">
                <span className="font-medium">{clauseTitles[name]}</span>
                {describeClause(name, records.settings.clauses, vocabulary).map((line) => (
                  <Statement key={line} text={line} vocabulary={vocabulary} className="text-muted-foreground" />
                ))}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {questions.length > 0 ? (
        <Section title="Questions">
          <ul className="flex flex-col gap-2">
            {questions.map((question) => {
              const chosen = question.answer?.option ?? null
              return (
                <li key={question.id} className="flex flex-col gap-1">
                  <span>{question.question}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">
                      {chosen === null ? "Unanswered" : `Answered: ${question.options[chosen]?.label ?? ""}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}
      {provision.noRule || isUncited ? (
        <Section title="Reason for having no rule">
          {isUncited && !provision.noRule ? (
            <p>Nothing cites this provision, and it has no reason for having no rule.</p>
          ) : null}
          <NoRuleReason provision={provision} />
        </Section>
      ) : null}
      {values.length > 0 ? (
        <Section title="Values its rules encode">
          <p>{values.map((value) => valueText(value, vocabulary)).join(", ")}</p>
        </Section>
      ) : null}
      <Section title="Provisions that refer to it">
        {referencedBy.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {referencedBy.map((key) => (
              <li key={key}>
                <ProvisionReference citation={reference(key)} source={source} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None.</p>
        )}
      </Section>
    </>
  )
}

/** Page text no provision holds, and why it matters. */
function OutsideCoverage({ passage }: { passage: OutsidePassage }) {
  return (
    <p>
      This text is on page {passage.page}, but the build placed it in no provision, so no rule, term or reason can cite
      it. If it says something the rules need, the document&rsquo;s structure needs fixing before the next build.
    </p>
  )
}
