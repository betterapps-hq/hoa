import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useId, useState, type ReactElement } from "react"
import { badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover"
import { sentenceCase } from "@/lib/text"
import { cn } from "@/lib/utils"
import { approvalBlockers } from "@/rulebook/review"
import { describeCondition } from "@/schema/describe"
import type * as T from "@/schema/types"
import { BulkApprove } from "../BulkApprove/BulkApprove"
import { ReviewControls } from "../ReviewControls/ReviewControls"
import { ReviewMenu } from "../ReviewMenu/ReviewMenu"
import { RuleLink } from "../RuleLink/RuleLink"
import { describeTermKind, describeValueType } from "../TermChip/TermChip.utils"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import { labelWithin, subjectSummary, type TermNode, type TermSubject } from "../VocabularyTab/VocabularyTab.utils"

export type TermGroupProps = {
  subject: TermSubject
  /** The subject with only what the filters keep. */
  shown: TermNode
  /** Its terms still to review that the filters keep, approved together. */
  toApprove: T.TermKey[]
  /** The terms the search found, marked among a list's choices. */
  found: ReadonlySet<string>
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

/** "1 rule", "3 rules". */
const rulesText = (count: number) => `${count} ${count === 1 ? "rule" : "rules"}`

// A detail (a property) is what the rules ask about a thing, so the page calls it a question; the wording only.
/** How a kind or detail's rules are counted: a question is asked by rules, a kind is used in them. */
const usageText = (node: TermNode) =>
  `${node.content?.kind === "property" ? "Asked by" : "Used in"} ${rulesText(node.usedBy.length)}`

/**
 * One subject of the terms tab (encoding.md, UX, Terms): a thing, request, party, event, document, list or unit, with
 * what it holds folded under it. Open, it shows its definition, its kinds and its details, each detail with its
 * choices, and the rules that read any of them.
 */
export function TermGroup({ subject, shown, toApprove, found, isOpen, onOpenChange }: TermGroupProps) {
  const { vocabulary, actions } = useRulebookWorkspace()
  const name = sentenceCase(subject.label)
  const summary = subjectSummary(shown, subject) || sentenceCase(subject.content?.definition ?? "")
  const listedAt = firstListings(shown)
  const summaryId = useId()
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} render={<li />}>
      <div
        className={cn(
          "flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
          isRejected(subject) ? "text-muted-foreground" : null
        )}
      >
        <CollapsibleTrigger
          aria-label={name}
          aria-describedby={summary ? summaryId : undefined}
          className="group/subject -my-1 flex min-w-0 flex-1 items-start gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRightIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/subject:rotate-90"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("font-medium", isRejected(subject) ? "line-through" : null)}>{name}</span>
            {summary ? (
              <span id={summaryId} className="line-clamp-1 text-sm text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
        </CollapsibleTrigger>
        <div className="-my-1 flex shrink-0 items-center gap-2">
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            {subject.rules.length > 0 ? `Used in ${rulesText(subject.rules.length)}` : "No rule"}
          </span>
          {/* A core term isn't reviewed here; the space keeps the counts in a column. */}
          {actions && subject.term ? <TermReview term={subject.term} name={name} /> : null}
          {actions && !subject.term ? <span className="size-8" /> : null}
        </div>
      </div>
      <CollapsibleContent className="border-t bg-muted/30 px-3 py-4 sm:pl-9">
        <div className="flex flex-col gap-5">
          <TermAbout node={subject} />
          {subject.content?.kind === "unit" ? (
            <p className="text-sm text-muted-foreground">{describeTermKind(subject.content, vocabulary)}</p>
          ) : null}
          {shown.values.length > 0 ? <ChoiceList list={subject} found={found} /> : null}
          {shown.kinds.length > 0 ? (
            <TermRows title="Kinds" holder={subject.label} rows={shown.kinds} found={found} listedAt={listedAt} />
          ) : null}
          {shown.details.length > 0 ? (
            <TermRows
              title="What the rules ask about it"
              holder={subject.label}
              rows={shown.details}
              found={found}
              listedAt={listedAt}
            />
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <RuleDisclosure label={subject.label} rules={subject.rules} />
            {toApprove.length > 1 ? (
              <BulkApprove
                refs={toApprove.map((key) => ({ type: "term" as const, key }))}
                noun="terms"
                label={`Approve all ${toApprove.length} terms`}
                title={`Approve the ${toApprove.length} terms for ${name}, its questions and their choices?`}
              />
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const isRejected = (node: TermNode) => node.term?.review.status === "rejected"

/** The detail each list is first shown under, by the list's key: later details choosing from it refer back to it. */
function firstListings(subject: TermNode) {
  const listedAt = new Map<T.TermKey, TermNode>()
  const visit = (node: TermNode) => {
    if (node.choices && !listedAt.has(node.choices.key)) {
      listedAt.set(node.choices.key, node)
    }
    for (const child of [...node.kinds, ...node.details]) {
      visit(child)
    }
  }
  visit(subject)
  return listedAt
}

/** A term's definition, scope and other labels, as far as it has them. */
function TermAbout({ node }: { node: TermNode }) {
  const content = node.content
  const others = content?.labels.filter((item) => item.role === "alternative").map((item) => item.text) ?? []
  if (!content || (!content.definition && !content.scopeNote && others.length === 0)) {
    return null
  }
  return (
    <div className="flex max-w-prose flex-col gap-1 text-sm">
      {content.definition ? <p>{sentenceCase(content.definition)}</p> : null}
      {content.scopeNote ? <p className="text-muted-foreground">{sentenceCase(content.scopeNote)}</p> : null}
      {others.length > 0 ? <p className="text-muted-foreground">Also called: {others.join(", ")}</p> : null}
    </div>
  )
}

/** A term's review in a row: its status in words and its menu. */
function TermReview({ term, name }: { term: T.Term; name: string }) {
  const { approval } = useRulebookWorkspace()
  return (
    <ReviewMenu
      record={{ type: "term", key: term.key }}
      status={term.review.status}
      name={name}
      blockers={
        approval && term.review.status === "proposed" ? approvalBlockers(approval, { type: "term", key: term.key }) : []
      }
    />
  )
}

type Listings = {
  found: ReadonlySet<string>
  /** The detail each list is first shown under. */
  listedAt: ReadonlyMap<T.TermKey, TermNode>
}

type TermRowsProps = Listings & { title: string; holder: string; rows: TermNode[] }

/** A subject's kinds or details, under a small heading. */
function TermRows({ title, holder, rows, found, listedAt }: TermRowsProps) {
  return (
    <section
      className="flex flex-col gap-2"
      aria-label={`${title === "Kinds" ? "Kinds of" : "Questions about"} ${holder}`}
    >
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <ul className="divide-y rounded-lg border bg-background">
        {rows.map((row) => (
          <TermRow key={row.key} node={row} holder={holder} found={found} listedAt={listedAt} />
        ))}
      </ul>
    </section>
  )
}

type TermRowProps = Listings & { node: TermNode; holder: string }

/** A kind or detail: its name and what it holds, its definition, its choices, the rules that read it and its review. */
function TermRow({ node, holder, found, listedAt }: TermRowProps) {
  const { vocabulary, actions } = useRulebookWorkspace()
  const [isUsageOpen, setIsUsageOpen] = useState(false)
  const name = sentenceCase(node.label)
  const content = node.content
  const holds = content?.kind === "property" && content.valueType.type !== "choice"
  const many = content?.kind === "property" && content.many ? ", any number of them" : ""
  // A kind without a definition says what makes something one.
  const note =
    content?.kind === "category" && !content.definition
      ? describeCondition(content.criteria, vocabulary)
      : content?.definition
  return (
    <li className={cn("flex flex-col gap-2 px-3 py-2.5", isRejected(node) ? "text-muted-foreground" : null)}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn("font-medium", isRejected(node) ? "line-through" : null)}>
              {sentenceCase(labelWithin(node.label, holder))}
            </span>
            {holds ? (
              <span className="text-xs text-muted-foreground">
                {sentenceCase(describeValueType(content.valueType, vocabulary))}
                {many}
              </span>
            ) : null}
          </p>
          {note ? <p className="max-w-prose text-sm text-muted-foreground">{sentenceCase(note)}</p> : null}
          {node.choices ? (
            <ChoiceList
              list={node.choices}
              found={found}
              many={many !== ""}
              sameAs={listedAt.get(node.choices.key)?.key === node.key ? null : listedAt.get(node.choices.key)}
              holder={holder}
            />
          ) : null}
        </div>
        <div className="-my-1 flex shrink-0 items-center gap-2">
          {node.usedBy.length === 0 ? (
            <span className="text-sm whitespace-nowrap text-muted-foreground">No rule</span>
          ) : (
            <Button
              variant="link"
              className="h-auto p-0 text-link"
              aria-expanded={isUsageOpen}
              aria-label={`${name}: ${usageText(node).toLowerCase()}`}
              onClick={() => setIsUsageOpen(!isUsageOpen)}
            >
              {usageText(node)}
              <ChevronDownIcon aria-hidden className={cn("transition-transform", isUsageOpen ? "rotate-180" : null)} />
            </Button>
          )}
          {node.term && actions ? <TermReview term={node.term} name={name} /> : null}
        </div>
      </div>
      {isUsageOpen ? <RuleList name={name} rules={node.usedBy} /> : null}
      {node.details.length > 0 ? (
        <ul className="ml-1 flex flex-col divide-y border-l pl-3" aria-label={`Questions about ${name}`}>
          {node.details.map((detail) => (
            <TermRow key={detail.key} node={detail} holder={node.label} found={found} listedAt={listedAt} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

type ChoiceListProps = {
  list: TermNode
  found: ReadonlySet<string>
  many?: boolean
  /** The detail above that already shows the list's choices, which this one refers to instead. */
  sameAs?: TermNode | null
  /** What the detail is under, left out of the name of the detail it refers to. */
  holder?: string
}

/** Choices shown before "more": a long list starts folded, unless the search found one past the fold. */
const choiceLimit = 8

/**
 * A list's choices as chips, each opening what it means and its review; an open list says others are allowed. A list
 * already shown above in the same subject is named and referred to instead of repeated.
 */
function ChoiceList({ list, found, many = false, sameAs = null, holder = "" }: ChoiceListProps) {
  const { vocabulary } = useRulebookWorkspace()
  const [isAll, setIsAll] = useState(() => list.values.slice(choiceLimit).some((value) => found.has(value.key)))
  const isComplete = list.content?.kind === "value-set" && list.content.complete
  const values = isAll ? list.values : list.values.slice(0, choiceLimit)
  const hidden = list.values.length - values.length
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TermPopover
        node={list}
        trigger={
          <button
            type="button"
            className="rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {many ? "Any of the" : "One of the"} {vocabulary.label(list.key, true)}
          </button>
        }
      />
      {sameAs ? (
        <span className="-ml-1 text-xs text-muted-foreground">, as for {labelWithin(sameAs.label, holder)}</span>
      ) : null}
      {(sameAs ? [] : values).map((value) => (
        <TermPopover
          key={value.key}
          node={value}
          trigger={
            <button
              type="button"
              className={cn(
                badgeVariants({ variant: "outline" }),
                "h-6 cursor-pointer bg-background font-normal hover:bg-muted",
                found.has(value.key) ? "border-primary bg-primary/10 font-medium" : null,
                isRejected(value) ? "text-muted-foreground line-through" : null
              )}
            >
              {sentenceCase(value.label)}
            </button>
          }
        />
      ))}
      {sameAs || hidden === 0 ? null : (
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setIsAll(true)}>
          {hidden} more
        </Button>
      )}
      {list.values.length === 0 ? <span className="text-xs text-muted-foreground">no choices yet</span> : null}
      {sameAs || isComplete || list.values.length === 0 || hidden > 0 ? null : (
        <span className="text-xs text-muted-foreground">or another</span>
      )}
    </div>
  )
}

type TermPopoverProps = { node: TermNode; trigger: ReactElement }

/** A choice or list in a popover: what it is and means, the rules that read it, and its review. */
function TermPopover({ node, trigger }: TermPopoverProps) {
  const { vocabulary, approval } = useRulebookWorkspace()
  const name = sentenceCase(node.label)
  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
          {node.content ? <PopoverDescription>{describeTermKind(node.content, vocabulary)}</PopoverDescription> : null}
        </PopoverHeader>
        <TermAbout node={node} />
        {node.usedBy.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Used in {rulesText(node.usedBy.length)}</p>
            <RuleList name={name} rules={node.usedBy} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No rule uses it on its own.</p>
        )}
        {node.term ? (
          <ReviewControls
            record={{ type: "term", key: node.term.key }}
            status={node.term.review.status}
            name={name}
            isCompact
            blockers={
              approval && node.term.review.status === "proposed"
                ? approvalBlockers(approval, { type: "term", key: node.term.key })
                : []
            }
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** The rules that read a term, each opening its card. */
function RuleList({ name, rules }: { name: string; rules: T.RuleKey[] }) {
  return (
    <ul className="flex flex-col gap-1.5 border-l pl-3" aria-label={`Rules using ${name}`}>
      {rules.map((key) => (
        <li key={key}>
          <RuleLink ruleKey={key} />
        </li>
      ))}
    </ul>
  )
}

/** The rules that read a subject or anything under it, behind a link. */
function RuleDisclosure({ label, rules }: { label: string; rules: T.RuleKey[] }) {
  const [isOpen, setIsOpen] = useState(false)
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">No rule uses {label} or asks about it yet.</p>
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button
        variant="link"
        className="h-auto self-start p-0 text-link"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? "Hide" : "Show"} the {rulesText(rules.length)}
        <ChevronDownIcon aria-hidden className={cn("transition-transform", isOpen ? "rotate-180" : null)} />
      </Button>
      {isOpen ? <RuleList name={sentenceCase(label)} rules={rules} /> : null}
    </div>
  )
}
