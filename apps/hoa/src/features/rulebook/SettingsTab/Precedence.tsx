import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
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
// to rank alone there; its menu does the same from the keyboard. A rank left empty goes away.

export type PrecedenceProps = {
  order: readonly T.DocumentKind[][]
  /** Saves a new order; without it the ranks are read-only. */
  onChange: ((order: T.DocumentKind[][]) => void) | null
}

const targetId = (target: RankTarget) => `${target.type}-${target.index}`

function targetOf(id: string): RankTarget | null {
  const [type, index] = id.split("-")
  return (type === "rank" || type === "gap") && index !== undefined ? { type, index: Number(index) } : null
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
}

/** A document in its rank: a handle to drag it, and a menu to move it from the keyboard. */
function Chip({ kind, rankIndex, order, onPlace }: ChipProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: kind })
  const label = documentKindLabel(kind)
  const isAlone = order[rankIndex]?.length === 1
  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-md border bg-background pr-1 text-sm",
        onPlace ? null : "pl-2.5 pr-2.5",
        isDragging ? "opacity-40" : null
      )}
    >
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

function Rank({ index, order, place }: { index: number; order: readonly T.DocumentKind[][]; place: Place | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId({ type: "rank", index }) })
  const rank = order[index] ?? []
  return (
    <li
      ref={setNodeRef}
      aria-label={`${ordinal(index + 1)}: ${rank.map(documentKindLabel).join(", ")}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
        isOver ? "border-primary bg-primary/5" : null
      )}
    >
      <span className="w-8 shrink-0 pt-1.5 font-medium tabular-nums">{ordinal(index + 1)}</span>
      <span className="flex flex-wrap gap-1.5">
        {rank.map((kind) => (
          <Chip key={kind} kind={kind} rankIndex={index} order={order} onPlace={place ? place(kind) : null} />
        ))}
      </span>
    </li>
  )
}

/** The documents in order of authority, ranked; equals share a rank. */
export function Precedence({ order, onChange }: PrecedenceProps) {
  const [dragged, setDragged] = useState<T.DocumentKind | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const place: Place = (kind) => (target) => onChange?.(placeDocument(order, kind, target))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null)
    const target = over ? targetOf(String(over.id)) : null
    const kind = order.flat().find((item) => item === active.id)
    if (target && kind) {
      place(kind)(target)
    }
  }
  const list = (
    <ol className={cn("flex flex-col", onChange ? null : "gap-1.5")} aria-label="Documents in order of authority">
      {order.map((rank, index) => [
        onChange ? <Gap key={`gap-${index}`} index={index} isDragging={dragged !== null} /> : null,
        <Rank key={rank.join("+")} index={index} order={order} place={onChange ? place : null} />
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
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) => setDragged(order.flat().find((item) => item === active.id) ?? null)}
      onDragCancel={() => setDragged(null)}
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
