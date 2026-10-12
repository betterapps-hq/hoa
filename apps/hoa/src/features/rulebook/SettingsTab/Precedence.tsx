import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type Over
} from "@dnd-kit/core"
import { ChevronDownIcon, GripVerticalIcon } from "lucide-react"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type * as T from "@/schema/types"
import { documentKindLabel, ordinal, placeDocument, type RankTarget } from "./SettingsTab.utils"

// The order of authority as ranks (encoding.md, UX, Settings): each rank a row of the documents equal in it. A
// document is dragged by its handle onto another rank, to rank equal with what's there, or into a gap between ranks,
// to rank alone there; held over another document, it goes before or after it, by which half of it the dragged
// document's center is over. Its menu does the same from the keyboard. A rank left empty goes away.

export type PrecedenceProps = {
  order: readonly T.DocumentKind[][]
  /** Saves a new order; without it the ranks are read-only. */
  onChange: ((order: T.DocumentKind[][]) => void) | null
}

type Slot = Extract<RankTarget, { type: "rank" | "gap" }>
type Beside = Extract<RankTarget, { type: "beside" }>

const targetId = (target: Slot) => `${target.type}-${target.index}`
const chipId = (kind: T.DocumentKind) => `chip:${kind}`

/** Where a drop lands: beside a document, by the half of it the dragged one is over, or a rank or a gap. */
function targetOf(active: Active, over: Over, kinds: readonly T.DocumentKind[]): RankTarget | null {
  const id = String(over.id)
  if (id.startsWith("chip:")) {
    const kind = kinds.find((item) => chipId(item) === id)
    const dragged = active.rect.current.translated
    if (!kind || !dragged) {
      return null
    }
    const isBefore = dragged.left + dragged.width / 2 < over.rect.left + over.rect.width / 2
    return { type: "beside", kind, side: isBefore ? "before" : "after" }
  }
  const [type, index] = id.split("-")
  return (type === "rank" || type === "gap") && index !== undefined ? { type, index: Number(index) } : null
}

/** The document under the pointer first, then the rank or gap; the nearest when the pointer is over none. */
const collisions: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  const chip = within.find((item) => String(item.id).startsWith("chip:"))
  if (chip) {
    return [chip]
  }
  return within.length > 0 ? within : rectIntersection(args)
}

/**
 * The gap before a rank, or after the last: a fixed strip, so nothing moves when a drag starts, that shows an insert
 * line when a document is held over it, to rank it on its own there.
 */
function Gap({ index, isDragging }: { index: number; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId({ type: "gap", index }) })
  return (
    <li ref={setNodeRef} aria-hidden className="flex h-3 items-center">
      <span
        className={cn(
          "h-0.5 w-full rounded-full transition-colors",
          isDragging && isOver ? "bg-primary" : "bg-transparent"
        )}
      />
    </li>
  )
}

type ChipProps = {
  kind: T.DocumentKind
  rankIndex: number
  order: readonly T.DocumentKind[][]
  onPlace: ((target: RankTarget) => void) | null
  /** The side a dragged document would land on, shown as an insert line. */
  insert: Beside["side"] | null
}

/** A document in its rank: a handle to drag it, and a menu to move it from the keyboard. */
function Chip({ kind, rankIndex, order, onPlace, insert }: ChipProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: kind })
  const { setNodeRef: setDropRef } = useDroppable({ id: chipId(kind), disabled: !onPlace })
  const label = documentKindLabel(kind)
  const isAlone = order[rankIndex]?.length === 1
  return (
    <span
      ref={(node) => {
        setNodeRef(node)
        setDropRef(node)
      }}
      className={cn(
        "relative inline-flex h-8 items-center gap-0.5 rounded-md border bg-background pr-1 text-sm",
        onPlace ? null : "pl-2.5 pr-2.5",
        isDragging ? "opacity-40" : null
      )}
    >
      {insert ? (
        <span
          aria-hidden
          className={cn(
            "absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-primary",
            insert === "before" ? "-left-1" : "-right-1"
          )}
        />
      ) : null}
      {onPlace ? (
        <>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${label}`}
            className="flex h-full cursor-grab touch-none items-center rounded-l-md px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-3.5" aria-hidden />
          </button>
          <span>{label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Move ${label}`}
              className="flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDownIcon className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Rank {label} equal to</DropdownMenuLabel>
                {order.map((rank, index) =>
                  index === rankIndex ? null : (
                    <DropdownMenuItem key={rank.join("+")} onClick={() => onPlace({ type: "rank", index })}>
                      <span className="w-8 shrink-0 text-muted-foreground tabular-nums">{ordinal(index + 1)}</span>
                      <span className="truncate">{rank.map(documentKindLabel).join(", ")}</span>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Rank it on its own</DropdownMenuLabel>
                {rankIndex > 0 || !isAlone ? (
                  <DropdownMenuItem onClick={() => onPlace({ type: "gap", index: 0 })}>First</DropdownMenuItem>
                ) : null}
                {isAlone ? null : (
                  <DropdownMenuItem onClick={() => onPlace({ type: "gap", index: rankIndex + 1 })}>
                    Just below its rank now
                  </DropdownMenuItem>
                )}
                {rankIndex < order.length - 1 || !isAlone ? (
                  <DropdownMenuItem onClick={() => onPlace({ type: "gap", index: order.length })}>
                    Last
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        label
      )}
    </span>
  )
}

/** A rank: its place, and the documents equal in it. */
type Place = (kind: T.DocumentKind) => (target: RankTarget) => void

type RankProps = { index: number; order: readonly T.DocumentKind[][]; place: Place | null; beside: Beside | null }

function Rank({ index, order, place, beside }: RankProps) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId({ type: "rank", index }) })
  const rank = order[index] ?? []
  return (
    <li
      ref={setNodeRef}
      aria-label={`${ordinal(index + 1)}: ${rank.map(documentKindLabel).join(", ")}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
        isOver || (beside && rank.includes(beside.kind)) ? "border-primary bg-primary/5" : null
      )}
    >
      <span className="w-8 shrink-0 pt-1.5 font-medium tabular-nums">{ordinal(index + 1)}</span>
      <span className="flex flex-wrap gap-1.5">
        {rank.map((kind) => (
          <Chip
            key={kind}
            kind={kind}
            rankIndex={index}
            order={order}
            onPlace={place ? place(kind) : null}
            insert={beside?.kind === kind ? beside.side : null}
          />
        ))}
      </span>
    </li>
  )
}

/** The documents in order of authority, ranked; equals share a rank. */
export function Precedence({ order, onChange }: PrecedenceProps) {
  const [dragged, setDragged] = useState<T.DocumentKind | null>(null)
  const [beside, setBeside] = useState<Beside | null>(null)
  const kinds = order.flat()
  const track = ({ active, over }: { active: Active; over: Over | null }) => {
    const target = over ? targetOf(active, over, kinds) : null
    setBeside(target?.type === "beside" && target.kind !== active.id ? target : null)
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const place: Place = (kind) => (target) => onChange?.(placeDocument(order, kind, target))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null)
    setBeside(null)
    const target = over ? targetOf(active, over, kinds) : null
    const kind = kinds.find((item) => item === active.id)
    if (target && kind) {
      place(kind)(target)
    }
  }
  const list = (
    <ol className={cn("flex flex-col", onChange ? null : "gap-1.5")} aria-label="Documents in order of authority">
      {order.map((rank, index) => [
        onChange ? <Gap key={`gap-${index}`} index={index} isDragging={dragged !== null} /> : null,
        <Rank key={rank.join("+")} index={index} order={order} place={onChange ? place : null} beside={beside} />
      ])}
      {onChange ? <Gap index={order.length} isDragging={dragged !== null} /> : null}
    </ol>
  )
  if (!onChange) {
    return list
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      onDragMove={track}
      onDragOver={track}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => setDragged(order.flat().find((item) => item === active.id) ?? null)}
      onDragCancel={() => {
        setDragged(null)
        setBeside(null)
      }}
      onDragEnd={onDragEnd}
    >
      {list}
      <DragOverlay>
        {dragged ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-sm shadow-md">
            <GripVerticalIcon className="size-3.5 text-muted-foreground" aria-hidden />
            {documentKindLabel(dragged)}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
