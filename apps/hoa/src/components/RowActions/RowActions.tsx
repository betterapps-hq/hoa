import { EllipsisIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"

/**
 * One thing a row offers, done on select or a link it opens (`download` saves the file instead). Destructive ones come
 * last, after a separator, and should confirm or offer undo.
 */
export type RowAction = {
  label: string
  icon: LucideIcon
  disabled?: boolean
  isDestructive?: boolean
} & ({ onSelect: () => void; href?: never; download?: never } | { href: string; download?: boolean; onSelect?: never })

export type RowActionsProps = {
  /** The row's name, for the menu button's accessible name: "Actions for Fence height". */
  name: string
  actions: RowAction[]
  /** A line at the top of the menu, such as why an action isn't available yet. */
  note?: ReactNode
  disabled?: boolean
}

/** A row's actions behind an ellipsis (ux.md, Menus and lists), each with its icon. */
export function RowActions({ name, actions, note, disabled = false }: RowActionsProps) {
  const safe = actions.filter((action) => !action.isDestructive)
  const destructive = actions.filter((action) => action.isDestructive)
  const item = ({ label, icon: Icon, onSelect, href, download, disabled: isDisabled, isDestructive }: RowAction) => (
    <DropdownMenuItem
      key={label}
      variant={isDestructive ? "destructive" : "default"}
      disabled={isDisabled}
      onClick={onSelect}
      render={
        href === undefined
          ? undefined
          : ({ children, ...props }) => (
              <a {...props} href={href} download={download}>
                {children}
              </a>
            )
      }
    >
      <Icon aria-hidden />
      {label}
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {note ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{note}</p> : null}
        {safe.length > 0 ? <DropdownMenuGroup>{safe.map(item)}</DropdownMenuGroup> : null}
        {safe.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.length > 0 ? <DropdownMenuGroup>{destructive.map(item)}</DropdownMenuGroup> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
