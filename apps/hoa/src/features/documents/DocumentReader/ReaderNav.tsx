import { SearchIcon } from "lucide-react"
import type { Ref } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { OutlineEntry, ReadingBlock } from "@/documents/reading"
import { cn } from "@/lib/utils"
import { blockTitle, snippetOf, type BlockContext } from "./DocumentReader.utils"

// The reader's navigation: search within the document, and its outline when there's no search. A column beside the
// text on wide containers and a sheet on narrow ones.

export type SearchResult = { block: ReadingBlock; context: BlockContext | undefined }

export type ReaderNavProps = {
  query: string
  onQueryChange: (query: string) => void
  /** The matching blocks, best first; null while there's no query. */
  results: SearchResult[] | null
  words: readonly string[]
  outline: readonly OutlineEntry[]
  /** The outline entries the reader is in: its article and section. */
  currentKeys: ReadonlySet<string>
  onGo: (blockKey: string) => void
  searchRef?: Ref<HTMLInputElement>
}

/** Results beyond this many are left to a narrower search. */
const shownResults = 50

function resultTitle({ block, context }: SearchResult) {
  const own = blockTitle(block)
  const section = context?.section ? blockTitle(context.section) : null
  const article = context?.article ? blockTitle(context.article) : null
  if (block.type === "page") {
    return `Page ${block.at.page}`
  }
  return own ?? section ?? article ?? "Text"
}

export function ReaderNav({
  query,
  onQueryChange,
  results,
  words,
  outline,
  currentKeys,
  onGo,
  searchRef
}: ReaderNavProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          aria-label="Search this document"
          placeholder="Search this document"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            const [first] = results ?? []
            if (event.key === "Enter" && first) {
              event.preventDefault()
              onGo(first.block.key)
            }
          }}
        />
      </InputGroup>
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {results === null ? (
          <Outline outline={outline} currentKeys={currentKeys} onGo={onGo} />
        ) : (
          <Results results={results} words={words} onGo={onGo} />
        )}
      </div>
    </div>
  )
}

function Outline({ outline, currentKeys, onGo }: Pick<ReaderNavProps, "outline" | "currentKeys" | "onGo">) {
  if (outline.length === 0) {
    return <p className="px-2 py-2 text-sm text-muted-foreground">This document has no headings to list.</p>
  }
  return (
    <nav aria-label="Contents">
      <ul className="flex flex-col gap-px">
        {outline.map((entry) => {
          const isCurrent = currentKeys.has(entry.key)
          return (
            <li key={`${entry.key}:${entry.title}`}>
              <button
                type="button"
                aria-current={isCurrent ? "location" : undefined}
                onClick={() => onGo(entry.key)}
                className={cn(
                  "flex w-full gap-2 rounded-md px-2 py-1.5 text-left text-sm leading-snug text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  entry.level === 1 ? "mt-2 font-medium text-foreground/90 first:mt-0" : "pl-5",
                  isCurrent && "bg-muted text-foreground"
                )}
              >
                {entry.number ? <span className="shrink-0 tabular-nums">{entry.number}</span> : null}
                <span className="min-w-0">{entry.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function matchCount(count: number, shown: number) {
  if (count === 0) {
    return "Nothing in this document matches. Try other words."
  }
  if (count === 1) {
    return "1 passage matches."
  }
  return `${count} passages match${count > shown ? `, the best ${shown} shown` : ""}.`
}

function Results({
  results,
  words,
  onGo
}: {
  results: SearchResult[]
  words: readonly string[]
  onGo: (key: string) => void
}) {
  const shown = results.slice(0, shownResults)
  return (
    <div className="flex flex-col gap-2">
      <p className="px-2 text-sm text-muted-foreground" aria-live="polite">
        {matchCount(results.length, shown.length)}
      </p>
      <ul className="flex flex-col gap-px">
        {shown.map((result) => (
          <li key={result.block.key}>
            <button
              type="button"
              onClick={() => onGo(result.block.key)}
              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm font-medium">{resultTitle(result)}</span>
              <span className="line-clamp-3 text-sm text-muted-foreground">
                {snippetOf(
                  result.block.type === "provision" && !result.block.text
                    ? (result.block.heading ?? "")
                    : result.block.text,
                  words
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
