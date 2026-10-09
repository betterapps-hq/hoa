import { useState, type ReactNode } from "react"
import type { RulebookRecords } from "@/rulebook/assemble"
import { approvalBlockers } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { clampPage, ListPager, pageOf } from "../ListPager/ListPager"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import type { RulebookView } from "../rulebook.functions"
import { referencedRule } from "../rulebookRecords"
import { RuleLink } from "../RuleLink/RuleLink"
import { RuleReference } from "../RuleReference/RuleReference"
import { Statement } from "../Statement/Statement"
import { TermChip } from "../TermChip/TermChip"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

/** What a draft changes from the published rulebook, and the published records, to show what a changed one said. */
export type DraftChanges = {
  summary: NonNullable<RulebookView["changes"]>
  published: Pick<RulebookRecords, "rules" | "terms">
}

export type ChangesTabProps = { changes: DraftChanges }

const pageSize = 20

/**
 * What the draft changes (encoding.md, UX, Draft review): its new, changed and removed rules and terms, each with its
 * review, a changed one beside what it said before. Unchanged records keep their approval and aren't listed.
 */
export function ChangesTab({ changes }: ChangesTabProps) {
  const { records } = useRulebookWorkspace()
  const { summary, published } = changes
  const ruleOf = (key: string) => records.rules.find((rule) => rule.key === key)
  const termOf = (key: string) => records.terms.find((term) => term.key === key)
  const added = summary.rules.added.flatMap((key) => ruleOf(key) ?? [])
  const changed = summary.rules.changed.flatMap((key) => ruleOf(key) ?? [])
  const addedTerms = summary.terms.added.flatMap((key) => termOf(key) ?? [])
  const changedTerms = summary.terms.changed.flatMap((key) => termOf(key) ?? [])
  const isEmpty =
    added.length + changed.length + summary.rules.removed.length === 0 &&
    addedTerms.length + changedTerms.length + summary.terms.removed.length === 0 &&
    !summary.settingsChanged

  if (isEmpty) {
    return (
      <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        The draft has the same rules and terms as the published rulebook.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-8">
      {summary.settingsChanged ? (
        <p className="text-sm text-muted-foreground">The settings changed too; review them in Settings.</p>
      ) : null}
      <ChangeSection title="New rules" items={added} noun="new rules">
        {(rule) => <RuleChange rule={rule} />}
      </ChangeSection>
      <ChangeSection title="Changed rules" items={changed} noun="changed rules">
        {(rule) => <RuleChange rule={rule} before={published.rules.find((item) => item.key === rule.key)} />}
      </ChangeSection>
      <ChangeSection title="Removed rules" items={summary.rules.removed} noun="removed rules">
        {(rule) => <RemovedRule rule={rule} />}
      </ChangeSection>
      <ChangeSection title="New terms" items={addedTerms} noun="new terms">
        {(term) => <TermChange term={term} />}
      </ChangeSection>
      <ChangeSection title="Changed terms" items={changedTerms} noun="changed terms">
        {(term) => <TermChange term={term} before={published.terms.find((item) => item.key === term.key)} />}
      </ChangeSection>
      <ChangeSection title="Removed terms" items={summary.terms.removed} noun="removed terms">
        {(term) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{term.labels[0]?.text ?? term.key}</span>
            {term.definition ? <p className="text-muted-foreground">{term.definition}</p> : null}
            <p className="text-sm text-muted-foreground">It leaves the rulebook when you publish.</p>
          </div>
        )}
      </ChangeSection>
    </div>
  )
}

function ChangeSection<I extends { key: string }>({
  title,
  items,
  noun,
  children
}: {
  title: string
  items: I[]
  noun: string
  children: (item: I) => ReactNode
}) {
  const [page, setPage] = useState(0)
  if (items.length === 0) {
    return null
  }
  const current = clampPage(items.length, page, pageSize)
  const id = `changes-${title.toLowerCase().replaceAll(" ", "-")}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="@container flex flex-col divide-y rounded-lg border">
        {pageOf(items, current, pageSize).map((item) => (
          <li key={item.key} className="px-4 py-3">
            {children(item)}
          </li>
        ))}
      </ul>
      <ListPager total={items.length} page={current} pageSize={pageSize} onPageChange={setPage} noun={noun} />
    </section>
  )
}

function RuleChange({ rule, before }: { rule: T.Rule; before?: T.Rule }) {
  const { vocabulary, approval } = useRulebookWorkspace()
  return (
    <div className="flex flex-col gap-2 @xl:flex-row @xl:items-start @xl:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RuleLink ruleKey={rule.key} />
        <Statement text={rule.statement} vocabulary={vocabulary} className="line-clamp-3" />
        {before ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Before: </span>
            {before.statement === rule.statement ? (
              "the same words; what it checks or who it applies to changed."
            ) : (
              <Statement text={before.statement} vocabulary={vocabulary} />
            )}
          </p>
        ) : null}
      </div>
      <ReviewControls
        isCompact
        className="shrink-0"
        record={{ type: "rule", key: rule.key }}
        status={rule.review.status}
        name={rule.title}
        blockers={
          approval && rule.review.status === "proposed"
            ? approvalBlockers(approval, { type: "rule", key: rule.key })
            : []
        }
      />
    </div>
  )
}

function RemovedRule({ rule }: { rule: T.Rule }) {
  const { citations, source, vocabulary } = useRulebookWorkspace()
  return (
    <div className="flex flex-col gap-1">
      <RuleReference rule={referencedRule(citations, rule)} source={source} />
      <Statement text={rule.statement} vocabulary={vocabulary} className="line-clamp-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        The documents the draft was built from no longer state it. It leaves the rulebook when you publish.
      </p>
    </div>
  )
}

function TermChange({ term, before }: { term: T.Term; before?: T.Term }) {
  const { vocabulary, approval } = useRulebookWorkspace()
  const label = vocabulary.label(term.key)
  return (
    <div className="flex flex-col gap-2 @xl:flex-row @xl:items-start @xl:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <TermChip termKey={term.key} vocabulary={vocabulary} />
        {term.definition ? <p>{term.definition}</p> : null}
        {before && before.definition !== term.definition ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Before: </span>
            {before.definition ?? "no definition"}
          </p>
        ) : null}
      </div>
      <ReviewControls
        isCompact
        className="shrink-0"
        record={{ type: "term", key: term.key }}
        status={term.review.status}
        name={label}
        blockers={
          approval && term.review.status === "proposed"
            ? approvalBlockers(approval, { type: "term", key: term.key })
            : []
        }
      />
    </div>
  )
}
