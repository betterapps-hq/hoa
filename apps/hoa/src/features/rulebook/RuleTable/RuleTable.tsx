import { AlertTriangleIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ruleTopics, type Rule } from "@/rules/rule"
import { describeCheck, issueSeverity, needsAttention } from "../rulebookEditing"
import { RuleCard, type RuleCardActions } from "../RuleCard/RuleCard"

export const topicLabels: Record<Rule["topic"], string> = {
  material: "Materials",
  color: "Colors",
  dimension: "Dimensions",
  placement: "Placement",
  style: "Style",
  documentation: "Documents",
  neighbor: "Neighbors",
  process: "Process",
  maintenance: "Maintenance"
}

const statusFilters = ["attention", "all", "pending", "approved", "rejected"] as const
type StatusFilter = (typeof statusFilters)[number]

const statusFilterLabels: Record<StatusFilter, string> = {
  attention: "Needs attention",
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
}

const reviewLabels: Record<Rule["review"]["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
}

function openIssues(rule: Rule) {
  return rule.issues.filter((issue) => !issue.resolution && issueSeverity(issue) !== "note")
}

function matchesStatus(rule: Rule, filter: StatusFilter) {
  if (filter === "all") {
    return true
  }
  return filter === "attention" ? needsAttention(rule) : rule.review.status === filter
}

export type RuleTableProps = {
  rules: Rule[]
  /** With actions the table edits a draft: status filters, issues and the rule's actions in its panel. */
  actions?: RuleCardActions
}

/** The rulebook as a searchable list; a rule opens in a side panel with its citations, issues and actions. */
export function RuleTable({ rules, actions }: RuleTableProps) {
  const isEditable = actions !== undefined
  const attentionCount = rules.filter(needsAttention).length
  const [query, setQuery] = useState("")
  const [topic, setTopic] = useState<Rule["topic"] | "all">("all")
  const [status, setStatus] = useState<StatusFilter>(isEditable && attentionCount > 0 ? "attention" : "all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = rules.find((rule) => rule.id === selectedId) ?? null

  const search = query.trim().toLowerCase()
  const shown = rules.filter(
    (rule) =>
      (topic === "all" || rule.topic === topic) &&
      (!isEditable || matchesStatus(rule, status)) &&
      (!search ||
        [rule.title, rule.statement, ...rule.citations.map((citation) => citation.section)]
          .join(" ")
          .toLowerCase()
          .includes(search))
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search rules"
            placeholder="Search rules or sections"
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Topic"
          value={topic}
          onChange={(event) => setTopic(ruleTopics.find((item) => item === event.target.value) ?? "all")}
        >
          <NativeSelectOption value="all">All topics</NativeSelectOption>
          {ruleTopics.map((item) => (
            <NativeSelectOption key={item} value={item}>
              {topicLabels[item]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {isEditable ? (
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Status"
            value={[status]}
            onValueChange={(value) => {
              const next = statusFilters.find((item) => item === value[0])
              if (next) {
                setStatus(next)
              }
            }}
          >
            {statusFilters.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {statusFilterLabels[item]}
                {item === "attention" ? ` (${attentionCount})` : ""}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Showing {shown.length} of {rules.length} rules
      </p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead className="hidden md:table-cell">Topic</TableHead>
              {isEditable ? <TableHead>Status</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No rules match.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((rule) => {
                const issues = isEditable ? openIssues(rule) : []
                return (
                  <TableRow key={rule.id} className="cursor-pointer" onClick={() => setSelectedId(rule.id)}>
                    <TableCell className="max-w-0 whitespace-normal">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-left font-medium whitespace-normal text-foreground"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(rule.id)
                        }}
                      >
                        {rule.title}
                      </Button>
                      <div className="truncate text-muted-foreground">{describeCheck(rule.check)}</div>
                    </TableCell>
                    <TableCell className="hidden w-32 md:table-cell">{topicLabels[rule.topic]}</TableCell>
                    {isEditable ? (
                      <TableCell className="w-40">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={rule.review.status === "rejected" ? "destructive" : "outline"}>
                            {reviewLabels[rule.review.status]}
                          </Badge>
                          {issues.length > 0 ? (
                            <span
                              className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
                              title={issues.map((issue) => issue.message).join("\n")}
                            >
                              <AlertTriangleIcon className="size-4" aria-hidden />
                              <span className="sr-only">Open issues:</span>
                              {issues.length}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => (open ? undefined : setSelectedId(null))}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{topicLabels[selected.topic]}</SheetTitle>
                <SheetDescription>{selected.citations[0]?.section}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <RuleCard
                  rule={selected}
                  actions={
                    actions
                      ? {
                          ...actions,
                          remove: async (ruleId) => {
                            await actions.remove(ruleId)
                            setSelectedId(null)
                          }
                        }
                      : undefined
                  }
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
