import { PencilLineIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { useSearch } from "@/hooks/useSearch"
import type { SearchSetup } from "@/lib/search"
import { sentenceCase } from "@/lib/text"

// Choosing something to add to a project type's form (application-review.md, Project types): what the rules check or
// require that the form doesn't have yet, each with its meaning and citation, in groups, searchable when the list is
// long, and an action that's always there (such as writing your own question). Choosing one closes the dialog.

export type PickerOption = {
  id: string
  title: string
  /** What it means, in plain words. */
  description: string | null
  /** Where it comes from, such as its citations. */
  detail: string | null
  group: string
}

export type PickerDialogProps = {
  title: string
  description: string
  options: readonly PickerOption[]
  /** What the list says when there's nothing left to add. */
  emptyText: string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onPick: (id: string) => void
  /** Always offered first, whatever the list holds: "Write your own question". */
  action?: { label: string; description: string; onSelect: () => void }
}

/** Lists this long or longer get a search box. */
const searchFrom = 7

const searchSetup: SearchSetup<PickerOption> = {
  id: (option) => option.id,
  fields: {
    title: { text: (option) => option.title, boost: 3 },
    description: { text: (option) => option.description ?? "" },
    group: { text: (option) => option.group }
  }
}

export function PickerDialog({
  title,
  description,
  options,
  emptyText,
  isOpen,
  onOpenChange,
  onPick,
  action
}: PickerDialogProps) {
  const [query, setQuery] = useState("")
  const search = useSearch(options, searchSetup)
  const shown = search.rank(options, query)
  const groups = [...Map.groupBy(shown, (option) => option.group)]
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) {
          setQuery("")
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {options.length >= searchFrom ? (
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
        ) : null}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          {action ? (
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-md border border-dashed px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => {
                onOpenChange(false)
                setQuery("")
                action.onSelect()
              }}
            >
              <PencilLineIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{action.label}</span>
                <span className="text-sm text-muted-foreground">{action.description}</span>
              </span>
            </button>
          ) : null}
          {shown.length === 0 && (options.length > 0 || !action) ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>{options.length === 0 ? "Nothing to add" : "Nothing matches"}</EmptyTitle>
                <EmptyDescription>{options.length === 0 ? emptyText : "Try other words."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map(([group, members]) => (
                <section key={group} aria-label={group} className="flex flex-col gap-1.5">
                  <h3 className="px-1 text-xs font-medium text-muted-foreground">{group}</h3>
                  <ul className="flex flex-col gap-1">
                    {members.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 rounded-md border border-transparent px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          onClick={() => {
                            onPick(option.id)
                            onOpenChange(false)
                            setQuery("")
                          }}
                        >
                          <PlusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium">{sentenceCase(option.title)}</span>
                            {option.description ? (
                              <span className="line-clamp-2 text-sm text-muted-foreground">{option.description}</span>
                            ) : null}
                            {option.detail ? (
                              <span className="text-xs text-muted-foreground">{option.detail}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
