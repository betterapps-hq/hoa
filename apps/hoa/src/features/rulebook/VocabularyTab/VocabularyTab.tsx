import { SearchIcon, SlidersHorizontalIcon } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSearch } from "@/hooks/useSearch"
import { ChoiceSelect } from "../ChoiceSelect/ChoiceSelect"
import { TermGroup } from "../TermGroup/TermGroup"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import {
  filterSubjects,
  termSearchSetup,
  termSections,
  type ShownSubject,
  type TermFilters
} from "./VocabularyTab.utils"

const statusChoices: { value: TermFilters["status"]; label: string }[] = [
  { value: "proposed", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
]

const statusWords: Record<TermFilters["status"], string> = {
  proposed: " to review",
  approved: " approved",
  rejected: " rejected",
  all: ""
}

/** Subjects a section shows before "Show all"; a search shows more, best match first. */
const sectionLimit = 8
const searchLimit = 20

const noKeys: ReadonlySet<string> = new Set()

/**
 * The organization's terms (encoding.md, UX, Terms), grouped under what they describe: things, requests, people and
 * organizations, events and documents, each with its kinds and details folded under it and each choice property with
 * its choices, then the lists and units nothing holds. In a draft, each term has its review, and a subject approves
 * what it holds together. A term is approved here, or with the first rule approved that reads it.
 */
export function VocabularyTab() {
  const { records, termSubjects: subjects, actions } = useRulebookWorkspace()
  const defaultStatus: TermFilters["status"] =
    actions && records.terms.some((term) => term.review.status === "proposed") ? "proposed" : "all"
  const [filters, setFilters] = useState<TermFilters>({ query: "", status: defaultStatus })
  const search = useSearch(records.terms, termSearchSetup)
  const foundKeys = search.ids(filters.query)
  const isSearching = foundKeys !== null
  const shown = filterSubjects(subjects, filters, foundKeys)
  const matched = new Map(shown.flatMap((item) => item.matched).map((term) => [term.key, term]))
  const isFiltered = filters.query.trim() !== "" || filters.status !== "all"
  const isDefault = filters.query.trim() === "" && filters.status === defaultStatus
  const update = (change: Partial<TermFilters>) => setFilters((existing) => ({ ...existing, ...change }))

  // A subject opened or closed by hand stays so until the filters change; a search opens what it finds.
  const resetKey = JSON.stringify([filters.query, filters.status])
  const [toggled, setToggled] = useState({ resetKey, keys: noKeys })
  const toggledKeys = toggled.resetKey === resetKey ? toggled.keys : noKeys
  const groups = {
    found: new Set(foundKeys ?? []),
    isOpen: (key: string) => isSearching !== toggledKeys.has(key),
    onOpenChange: (key: string, isOpen: boolean) => {
      const keys = new Set(toggledKeys)
      if (isOpen === isSearching) {
        keys.delete(key)
      } else {
        keys.add(key)
      }
      setToggled({ resetKey, keys })
    }
  }

  // A search lists its matches best first; otherwise each section lists its subjects, most used first.
  const lists = isSearching
    ? [
        {
          id: "found",
          title: "Best matches",
          noun: "matches",
          items: shown.toSorted((a, b) => a.rank - b.rank),
          limit: searchLimit
        }
      ]
    : termSections
        .map((section) => ({
          id: section.id,
          title: section.title,
          noun: section.noun,
          items: shown.filter((item) => item.subject.section === section.id),
          limit: sectionLimit
        }))
        .filter((list) => list.items.length > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search terms"
            placeholder="Search the terms"
            className="pl-8"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
        {actions ? (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <SlidersHorizontalIcon />
              Filters
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="term-filter-status">Review</FieldLabel>
                  <ChoiceSelect
                    id="term-filter-status"
                    className="w-full"
                    value={filters.status}
                    choices={statusChoices}
                    onChange={(status) => update({ status })}
                  />
                </Field>
              </FieldGroup>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isFiltered
            ? `${matched.size === records.terms.length ? "All" : `${matched.size} of`} ${records.terms.length} terms${statusWords[filters.status]}`
            : `${records.terms.length} terms, grouped by what they describe`}
          {isDefault ? null : (
            <Button
              variant="link"
              size="sm"
              className="ml-2 h-auto p-0 text-link"
              onClick={() => setFilters({ query: "", status: defaultStatus })}
            >
              Clear filters
            </Button>
          )}
        </p>
      </div>
      {lists.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {filters.status === "proposed" && !isSearching ? "Every term is reviewed." : "No terms match."}
        </p>
      ) : (
        lists.map((list) => (
          <SubjectList
            key={`${list.id}-${resetKey}`}
            title={list.title}
            noun={list.noun}
            items={list.items}
            limit={list.limit}
            groups={groups}
          />
        ))
      )}
    </div>
  )
}

type SubjectListProps = {
  title: string
  /** What the subjects are, in the plural: "things". */
  noun: string
  items: ShownSubject[]
  limit: number
  groups: {
    found: ReadonlySet<string>
    isOpen: (key: string) => boolean
    onOpenChange: (key: string, isOpen: boolean) => void
  }
}

/** A section's subjects, the first few until "Show all". */
function SubjectList({ title, noun, items, limit, groups }: SubjectListProps) {
  const id = useId()
  const [isAll, setIsAll] = useState(false)
  const visible = isAll ? items : items.slice(0, limit)
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-medium">
        {title}
      </h3>
      <ul className="divide-y overflow-hidden rounded-lg border" aria-labelledby={id}>
        {visible.map(({ subject, shown, matched }) => (
          <TermGroup
            key={subject.key}
            subject={subject}
            shown={shown}
            toApprove={matched.filter((term) => term.review.status === "proposed").map((term) => term.key)}
            found={groups.found}
            isOpen={groups.isOpen(subject.key)}
            onOpenChange={(isOpen) => groups.onOpenChange(subject.key, isOpen)}
          />
        ))}
      </ul>
      {items.length > limit ? (
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setIsAll(!isAll)}>
          {isAll ? `Show the first ${limit}` : `Show all ${items.length} ${noun}`}
        </Button>
      ) : null}
    </section>
  )
}
