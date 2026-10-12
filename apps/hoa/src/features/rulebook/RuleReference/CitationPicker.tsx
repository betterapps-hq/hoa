import { useMediaQuery } from "@mantine/hooks"
import { cn } from "cn"
import { BookOpenIcon, SearchIcon } from "lucide-react"
import { useRef, useState, type ReactElement, type RefObject } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { citedProvisionHref } from "@/features/documents/citationLink"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import { useSearch } from "@/hooks/useSearch"
import type { SearchSetup } from "@/lib/search"
import type { CitedProvision } from "../citedProvision"

// Several citations at a glance (docs/ux.md, Citations): grouped by document, each with its label, heading and the
// start of its text, searchable when there are many. Each links to the document reader at the passage. With
// `onChoose` it picks a passage instead, each still readable first (in a new tab, so the choice isn't lost). A popover
// on wide screens, a sheet from the bottom on phones.

export type CitationPickerProps = {
  citations: readonly CitedProvision[]
  /** What opens the picker, such as "and 3 more". */
  trigger: ReactElement
  title: string
  /** Picks a passage instead of opening it; the list then offers to open each one first. */
  onChoose?: (citation: CitedProvision) => void
  /** Whether the citations are still loading. */
  isLoading?: boolean
}

/** Lists this long or longer get a search box. */
const searchFrom = 7
/** Without a search, a long list shows this many; searching finds the rest. */
const shownAtFirst = 60

const searchSetup: SearchSetup<CitedProvision> = {
  id: (citation) => citation.provisionKey,
  fields: {
    label: { text: (citation) => citation.label, boost: 3 },
    heading: { text: (citation) => citation.heading ?? "", boost: 2 },
    text: { text: (citation) => citation.text },
    document: { text: (citation) => citation.documentTitle }
  }
}

const entryClass =
  "flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"

function CitationEntry({ citation }: { citation: CitedProvision }) {
  return (
    <>
      <span className="text-sm font-medium">
        {citation.label}
        {citation.heading ? <span className="font-normal text-muted-foreground"> {citation.heading}</span> : null}
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{citation.text}</span>
    </>
  )
}

type ListProps = Omit<CitationPickerProps, "trigger" | "title"> & {
  onDone: () => void
  /** The search box, which takes focus when the picker opens. */
  searchRef: RefObject<HTMLInputElement | null>
}

function CitationList({ citations, onChoose, isLoading = false, onDone, searchRef }: ListProps) {
  const [query, setQuery] = useState("")
  // Opening a citation steps through all of them in the reader; a passage being chosen opens alone.
  const cites = onChoose ? undefined : citations.map((citation) => citation.provisionKey)
  const search = useSearch(citations, searchSetup)
  const ranked = search.rank(citations, query)
  const shown = query.trim() === "" ? ranked.slice(0, shownAtFirst) : ranked
  const groups = [...Map.groupBy(shown, (citation) => citation.documentTitle)]
  return (
    <div className="flex min-h-0 flex-col gap-3">
      {isLoading || citations.length >= searchFrom ? (
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            aria-label="Search citations"
            placeholder="Search by number, heading or words"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      ) : null}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner />
            Loading the documents
          </p>
        ) : null}
        {!isLoading && shown.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyTitle>Nothing matches</EmptyTitle>
              <EmptyDescription>Try a section number or other words.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        <div className="flex flex-col gap-4">
          {groups.map(([document, members]) => (
            <section key={document} aria-label={document} className="flex flex-col gap-1">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">{document}</h3>
              <ul className="flex flex-col">
                {members.map((citation) => (
                  <li key={citation.provisionKey} className="flex items-start gap-1">
                    {onChoose ? (
                      <>
                        <button
                          type="button"
                          className={entryClass}
                          onClick={() => {
                            onChoose(citation)
                            onDone()
                          }}
                        >
                          <CitationEntry citation={citation} />
                        </button>
                        {/* Picking happens in an editor: the reader opens in a sheet there (CitationsOpenInSheet). */}
                        <ReaderLink
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon-sm" }),
                            "mt-1 text-muted-foreground"
                          )}
                          aria-label={`Read ${citation.label}`}
                          title={`Read ${citation.label}`}
                          href={citedProvisionHref(citation, cites)}
                        >
                          <BookOpenIcon />
                        </ReaderLink>
                      </>
                    ) : (
                      <ReaderLink className={entryClass} href={citedProvisionHref(citation, cites)}>
                        <CitationEntry citation={citation} />
                      </ReaderLink>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {query.trim() === "" && ranked.length > shown.length ? (
            <p className="px-2 text-sm text-muted-foreground">
              Search to find the other {ranked.length - shown.length}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** A designed list of citations behind a trigger; each opens in the document reader, or is chosen. */
export function CitationPicker({ citations, trigger, title, onChoose, isLoading }: CitationPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isPhone = useMediaQuery("(max-width: 639px)") ?? false
  const searchRef = useRef<HTMLInputElement>(null)
  const list = (
    <CitationList
      citations={citations}
      onChoose={onChoose}
      isLoading={isLoading}
      onDone={() => setIsOpen(false)}
      searchRef={searchRef}
    />
  )
  return isPhone ? (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent side="bottom" className="max-h-[85dvh] gap-3 p-4" initialFocus={searchRef}>
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Choose a passage to read it in its document.</SheetDescription>
        </SheetHeader>
        {list}
      </SheetContent>
    </Sheet>
  ) : (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        initialFocus={searchRef}
        align="start"
        className="flex max-h-[min(32rem,var(--available-height))] w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3"
      >
        <p className="px-1 text-sm font-medium">{title}</p>
        {list}
      </PopoverContent>
    </Popover>
  )
}
