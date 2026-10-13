import { useRouter } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { isPlainClick } from "@/lib/links"
import { useReaderSheet } from "../ReaderSheet/readerSheetContext"

export type ReaderLinkProps = Omit<ComponentProps<"a">, "href"> & {
  /** A reader URL from `citationHref`. */
  href: string
}

/**
 * A real link to the document reader: middle-click, a modifier or the context menu opens it in a new tab. A plain
 * click opens the reader in a sheet inside a form or an editor (`CitationsOpenInSheet`), so nothing typed is lost, and
 * elsewhere moves to the reader's page without reloading the app. Outside a router (a component test) it is a plain
 * link.
 */
export function ReaderLink({ href, onClick, target, children, ...props }: ReaderLinkProps) {
  const router = useRouter({ warn: false })
  const sheet = useReaderSheet()
  return (
    <a
      {...props}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || !isPlainClick(event)) {
          return
        }
        if (sheet?.open(href)) {
          event.preventDefault()
          return
        }
        if (router && (target === undefined || target === "_self")) {
          event.preventDefault()
          void router.navigate({ href })
        }
      }}
    >
      {children}
    </a>
  )
}
