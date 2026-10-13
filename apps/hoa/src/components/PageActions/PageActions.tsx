import { useMediaQuery } from "@mantine/hooks"
import { useRouter } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { createContext, use, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button, buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { isPlainClick } from "@/lib/links"
import { ActionsMenu, type RowAction } from "../RowActions/RowActions"

// Page actions (ux.md, Page actions): what acts on a page's subject as a whole sits at the right of the site header on
// every page, so it's in reach however far down the page is read. One filled button for the page's main action, at
// most one quieter one beside it, and the rest in a More actions menu, destructive ones last. On a phone the quieter
// one moves into the menu, so the header keeps room for the page's title. Sections and rows keep their own actions.

/**
 * An action on the whole page: done on select, or a link it opens (`download` saves the file instead). A link is
 * always there to follow, so only a done-on-select action is disabled or busy.
 */
export type PageAction = { label: string; icon?: LucideIcon } & (
  | {
      onSelect: () => void
      disabled?: boolean
      /** It's under way: a spinner takes the icon's place, and it can't be pressed again meanwhile. */
      isBusy?: boolean
      href?: never
      download?: never
    }
  | { href: string; download?: boolean; onSelect?: never; disabled?: never; isBusy?: never }
)

export type PageActionsProps = {
  /** The page's main action, the one filled button. */
  primary?: PageAction | null
  /** An action used about as often as the main one, as a quieter button beside it; in the menu on a phone. */
  secondary?: (PageAction & { icon: LucideIcon }) | null
  /** Every other action on the page as a whole, in the More actions menu. */
  more?: RowAction[]
  /** How the actions stand, beside them: "Saved", "Saving". */
  status?: ReactNode
}

type Slot = { element: HTMLElement | null; setElement: (element: HTMLElement | null) => void }

const SlotContext = createContext<Slot | null>(null)

/** Holds the place in the site header that a page puts its actions in. */
export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  return <SlotContext value={{ element, setElement }}>{children}</SlotContext>
}

/** The place in the site header for the page's actions. */
export function PageActionsSlot() {
  const slot = use(SlotContext)
  return <div ref={slot?.setElement} className="ml-auto flex min-w-0 shrink-0 items-center gap-2" />
}

function ActionIcon({ icon: Icon, isBusy }: { icon?: LucideIcon; isBusy: boolean }) {
  if (isBusy) {
    return <Spinner />
  }
  return Icon ? <Icon aria-hidden /> : null
}

function ActionButton({ action, variant }: { action: PageAction; variant: "default" | "outline" }) {
  const router = useRouter({ warn: false })
  const { label, icon, disabled = false, isBusy = false, onSelect, href, download } = action
  const content = (
    <>
      <ActionIcon icon={icon} isBusy={isBusy} />
      {label}
    </>
  )
  if (href !== undefined) {
    // A real link, styled as a button: it opens in a new tab like any other.
    return (
      <a
        className={buttonVariants({ variant, size: "sm" })}
        href={href}
        download={download}
        onClick={(event) => {
          // A page of the app opens without reloading it; a middle-click or a modifier still opens a new tab.
          if (download || !router || !href.startsWith("/") || !isPlainClick(event)) {
            return
          }
          event.preventDefault()
          void router.navigate({ href })
        }}
      >
        {content}
      </a>
    )
  }
  return (
    <Button size="sm" variant={variant} disabled={disabled || isBusy} onClick={onSelect}>
      {content}
    </Button>
  )
}

/** The quieter action as the menu's first item, on a phone. */
const menuItem = ({ isBusy = false, disabled = false, ...action }: PageAction & { icon: LucideIcon }): RowAction => ({
  ...action,
  disabled: disabled || isBusy
})

/** The page's own actions, in the site header; in place where there's no header, as in a test. */
export function PageActions({ primary, secondary, more = [], status }: PageActionsProps) {
  const slot = use(SlotContext)
  const isPhone = useMediaQuery("(max-width: 639px)") ?? false
  const menu = secondary && isPhone ? [menuItem(secondary), ...more] : more
  const actions = (
    <fieldset aria-label="Page actions" className="flex min-w-0 items-center gap-2">
      {status ? <div className="text-sm text-muted-foreground">{status}</div> : null}
      {menu.length > 0 ? (
        <ActionsMenu trigger={<Button variant="ghost" size="icon-sm" aria-label="More actions" />} actions={menu} />
      ) : null}
      {secondary && !isPhone ? <ActionButton action={secondary} variant="outline" /> : null}
      {primary ? <ActionButton action={primary} variant="default" /> : null}
    </fieldset>
  )
  if (!slot) {
    return actions
  }
  return slot.element ? createPortal(actions, slot.element) : null
}
