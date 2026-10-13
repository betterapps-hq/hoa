import { Link } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { match } from "ts-pattern"
import { Badge } from "@/components/ui/badge"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { sentenceCase } from "@/lib/text"
import { areaOf, type ActivityEvent } from "../activity"
import { areas, type Area } from "../areas"
import { agoText, eventLine } from "../dashboardDisplay"

// The rows both dashboards list (docs/dashboard.md): each names its area by the area's icon on a tile, and its name
// under it. A row of sample data, for a part of an HOA portal the app doesn't have yet, says so.

/** The area's icon on a tile, the same in every list; its name is written beside it. */
function AreaTile({ area }: { area: Area }) {
  const { icon: Icon } = area
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-4" aria-hidden />
    </span>
  )
}

/** Marks sample data, for a part of an HOA portal the app doesn't have yet. */
function SampleBadge() {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      Sample
    </Badge>
  )
}

// The tile sits at the top of every row, as it does beside a description, so rows with and without one line up.
const mediaClass = "translate-y-0.5 self-start"

type AttentionRowProps = {
  area: Area
  /** What it's about. */
  subject: string
  /** How long it has waited, or when it's due. */
  aside: string | null
  /** What tells it apart from others like it. */
  detail: string | null
  /** What's needed. */
  note: string
  /** Where it's dealt with; none for sample data. */
  link: ReactElement | null
  isSample?: boolean
}

/** Something waiting on the reader, opening where it's dealt with. */
export function AttentionRow({ area, subject, aside, detail, note, link, isSample = false }: AttentionRowProps) {
  return (
    <li>
      <Item variant="outline" size="sm" render={link ?? undefined}>
        <ItemMedia className={mediaClass}>
          <AreaTile area={area} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <ItemTitle>
              {subject}
              {isSample ? <SampleBadge /> : null}
            </ItemTitle>
            {aside ? <span className="text-sm text-muted-foreground tabular-nums">{aside}</span> : null}
          </div>
          {detail ? <ItemDescription>{detail}</ItemDescription> : null}
          <p className="text-sm">{note}</p>
          <p className="text-xs text-muted-foreground">{area.label}</p>
        </ItemContent>
      </Item>
    </li>
  )
}

type AreaRowProps = {
  area: Area
  /** The area's main page; none for sample data, or an area with nothing to open yet. */
  link: ReactElement | null
  /** Where the area stands, in a sentence. */
  children: ReactNode
  isSample?: boolean
}

/** An area of the HOA: where it stands, opening its main page. */
export function AreaRow({ area, link, children, isSample = false }: AreaRowProps) {
  return (
    <li>
      <Item variant="outline" size="sm" render={link ?? undefined}>
        <ItemMedia className={mediaClass}>
          <AreaTile area={area} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>
            {area.label}
            {isSample ? <SampleBadge /> : null}
          </ItemTitle>
          <p className="text-sm text-muted-foreground">{children}</p>
        </ItemContent>
      </Item>
    </li>
  )
}

type ActivityRowProps = {
  area: Area
  /** What it's about: a link to it, or its name. */
  subject: ReactNode
  detail: string | null
  /** What happened, and who did it. */
  note: string
  at: string
  /** The moment the data was read, which "2 hours ago" counts from. */
  asOf: string
  isSample?: boolean
}

/** Something that happened in one of the HOA's areas. */
export function ActivityRow({ area, subject, detail, note, at, asOf, isSample = false }: ActivityRowProps) {
  return (
    <li className="flex gap-3">
      <AreaTile area={area} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="font-medium">{subject}</div>
        {detail ? <span className="truncate text-muted-foreground">{detail}</span> : null}
        <span>{note}</span>
        <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            {area.label}
            {isSample ? <SampleBadge /> : null}
          </span>
          <span>{sentenceCase(agoText(at, asOf))}</span>
        </div>
      </div>
    </li>
  )
}

const subjectClass = "underline-offset-4 hover:underline"

/** What an event is about, opening it: the application, project type, rulebook or document, or the documents. */
function EventSubject({ event, children }: { event: ActivityEvent; children: ReactNode }) {
  return match(event)
    .with({ type: "application-submitted" }, { type: "application-decided" }, ({ application }) => (
      <Link to="/applications/$applicationId" params={{ applicationId: application.id }} className={subjectClass}>
        {children}
      </Link>
    ))
    .with({ type: "project-type-added" }, ({ projectType }) => (
      <Link to="/project-types/$projectTypeId" params={{ projectTypeId: projectType.id }} className={subjectClass}>
        {children}
      </Link>
    ))
    .with({ type: "documents-added" }, { type: "documents-removed" }, ({ documents: [only, ...others] }) =>
      only && others.length === 0 ? (
        <Link to="/documents/$documentId" params={{ documentId: only.id }} className={subjectClass}>
          {children}
        </Link>
      ) : (
        <Link to="/rules" className={subjectClass}>
          {children}
        </Link>
      )
    )
    .with({ type: "rulebook-published" }, () => (
      <Link to="/rules" className={subjectClass}>
        {children}
      </Link>
    ))
    .exhaustive()
}

/** Something that happened, read from the app's records: in its area, opening what it's about. */
export function EventRow({ event, asOf }: { event: ActivityEvent; asOf: string }) {
  const { subject, detail, note } = eventLine(event)
  return (
    <ActivityRow
      area={areas[areaOf(event)]}
      subject={<EventSubject event={event}>{subject}</EventSubject>}
      detail={detail}
      note={note}
      at={event.at}
      asOf={asOf}
    />
  )
}
