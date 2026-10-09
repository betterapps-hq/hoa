import { CircleAlertIcon } from "lucide-react"
import { isCited } from "@/rulebook/coverage"
import type * as T from "@/schema/types"
import { NoRuleReason } from "../NoRuleReason/NoRuleReason"
import { ProvisionReference } from "../ProvisionReference/ProvisionReference"
import { citedProvision } from "../rulebookRecords"
import { RuleLink } from "../RuleLink/RuleLink"
import { clauseTitles } from "../SettingsTab/SettingsTab.utils"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type ProvisionCoverageCardProps = { provision: T.Provision }

/** One provision in the coverage list: what covers it, or its reason for having no rule, and in a draft a way to set one. */
export function ProvisionCoverageCard({ provision }: ProvisionCoverageCardProps) {
  const { coverage, citations, vocabulary, source } = useRulebookWorkspace()
  const cited = coverage.byProvision.get(provision.key)
  const reference = citedProvision(citations, { provisionKey: provision.key, highlight: null, region: null })
  const isUncovered = provision.noRule === null && !isCited(cited)

  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ProvisionReference citation={reference} source={source} />
        {provision.heading ? <span className="font-medium">{provision.heading}</span> : null}
        {isUncovered ? (
          <span className="flex items-center gap-1 text-coverage-uncovered">
            <CircleAlertIcon className="size-4" aria-hidden />
            No rule and no reason
          </span>
        ) : null}
      </div>
      <p className="line-clamp-3 text-muted-foreground">{provision.text}</p>
      {cited && isCited(cited) ? (
        <div className="flex flex-col gap-1.5">
          {cited.rules.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label={`Rules citing ${reference.label}`}>
              {cited.rules.map((key) => (
                <li key={key}>
                  <RuleLink ruleKey={key} />
                </li>
              ))}
            </ul>
          ) : null}
          {cited.terms.length > 0 ? (
            <p className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">Defines</span>
              {cited.terms.map((key) => (
                <TermChip key={key} termKey={key} vocabulary={vocabulary} />
              ))}
            </p>
          ) : null}
          {cited.clauses.length > 0 ? (
            <p>
              <span className="text-muted-foreground">Settings: </span>
              {cited.clauses.map((name) => clauseTitles[name]).join(", ")}
            </p>
          ) : null}
          {cited.questions.length > 0 ? <p className="text-muted-foreground">A question cites it.</p> : null}
        </div>
      ) : null}
      <NoRuleReason provision={provision} />
    </div>
  )
}
