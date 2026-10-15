import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type UniqueIdentifier
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { GripVerticalIcon } from "lucide-react"
import { useId, type ReactNode } from "react"
import { movedText } from "@/projectTypes/definition"

// A list the administrator reorders by dragging an item's handle, with the mouse, touch, or the keyboard (focus the
// handle, Space to lift, arrows to move, Space to drop, Escape to cancel). Screen readers hear each step in plain
// words. Items can also move another way (a menu's Move up and Move down); the order lives with the caller.

export type SortableListProps<Item> = {
  items: readonly Item[]
  getId: (item: Item) => string
  /** The item as a screen reader names it in announcements. */
  getName: (item: Item) => string
  onMove: (from: number, to: number) => void
  /** Renders an item; `handle` is its drag handle, for its left edge. */
  renderItem: (item: Item, context: { index: number; handle: ReactNode }) => ReactNode
  /** The list's accessible name. */
  label: string
  className?: string
}

const instructions =
  "To move it, press Space or Enter, choose a place with the arrow keys, and press Space or Enter again to drop it. Press Escape to cancel."

/** Lists mid-drag. Escape then cancels the drag, not a dialog around the list (`isSorting`). */
const drags = { active: 0 }

/**
 * Whether a list is mid-drag, for a dialog to keep itself open on the Escape that cancels the drag. It stays true until
 * the event that ended the drag has run its course, whichever listener sees it first.
 */
export const isSorting = () => drags.active > 0

const dragEnded = () => {
  setTimeout(() => {
    drags.active = Math.max(0, drags.active - 1)
  }, 0)
}

type SortableItemProps = { id: string; name: string; children: (handle: ReactNode) => ReactNode }

function SortableItem({ id, name, children }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id
  })
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Move “${name}”`}
      className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-4" aria-hidden />
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-90 shadow-lg")}
    >
      {children(handle)}
    </li>
  )
}

export function SortableList<Item>({
  items,
  getId,
  getName,
  onMove,
  renderItem,
  label,
  className
}: SortableListProps<Item>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  // dnd-kit numbers its described-by ids per page load; React's id is the same on the server and in the browser.
  const id = useId()
  const ids = items.map(getId)
  const indexOf = (id: UniqueIdentifier) => ids.indexOf(String(id))
  const nameOf = (id: UniqueIdentifier) => {
    const item = items[indexOf(id)]
    return item === undefined ? "" : getName(item)
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up “${nameOf(active.id)}”, at position ${indexOf(active.id) + 1} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `“${nameOf(active.id)}” is at position ${indexOf(over.id) + 1} of ${ids.length}.`
        : `“${nameOf(active.id)}” is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? movedText(nameOf(active.id), indexOf(over.id), ids.length)
        : `“${nameOf(active.id)}” stays at position ${indexOf(active.id) + 1} of ${ids.length}.`,
    onDragCancel: ({ active }) =>
      `Stopped moving “${nameOf(active.id)}”. It stays at position ${indexOf(active.id) + 1} of ${ids.length}.`
  }
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}
      onDragStart={() => {
        drags.active += 1
      }}
      onDragCancel={dragEnded}
      onDragEnd={({ active, over }) => {
        dragEnded()
        if (over && active.id !== over.id) {
          onMove(indexOf(active.id), indexOf(over.id))
        }
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className={cn("flex flex-col gap-2", className)}>
          {items.map((item, index) => (
            <SortableItem key={getId(item)} id={getId(item)} name={getName(item)}>
              {(handle) => renderItem(item, { index, handle })}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
