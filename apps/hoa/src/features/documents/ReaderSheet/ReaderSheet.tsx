import { ExternalLinkIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { citationHref, readerTargetOf } from "../citationLink"
import { DocumentReader, type ReaderTarget } from "../DocumentReader/DocumentReader"
import { ReaderSheetContext } from "./readerSheetContext"

// Citations inside a form or an editor open the reader in a sheet over the page, so unsaved work stays where it is
// (docs/ux.md, Citations). A form wraps itself in `CitationsOpenInSheet`; every `ReaderLink` inside it then opens the
// sheet on a plain click, and still opens the route in a new tab on a middle-click or with a modifier.

type Opened = ReaderTarget & { cites: string[] }

/** Opens every citation inside it in a large reader sheet instead of leaving the page. */
export function CitationsOpenInSheet({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const open = (href: string) => {
    const target = readerTargetOf(href)
    if (target) {
      setOpened(target)
    }
    return target !== null
  }
  return (
    <ReaderSheetContext.Provider value={{ open }}>
      {children}
      <Sheet open={opened !== null} onOpenChange={(isOpen) => (isOpen ? undefined : setOpened(null))}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[min(64rem,94vw)]"
        >
          <SheetTitle className="sr-only">Governing document</SheetTitle>
          <SheetDescription className="sr-only">
            The cited passage in its document. Closing this returns you to where you were.
          </SheetDescription>
          {opened ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* One quiet icon beside the close button: the reader's own page, in a new tab. */}
              <div className="flex h-16 shrink-0 items-center justify-end border-b pr-14 pl-4">
                <a
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  href={citationHref(opened.documentId, opened.provision, opened.cites)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in a new tab"
                  title="Open in a new tab"
                >
                  <ExternalLinkIcon aria-hidden />
                </a>
              </div>
              <DocumentReader
                className="min-h-0 flex-1"
                documentId={opened.documentId}
                provision={opened.provision}
                cites={opened.cites}
                onNavigate={(target) => setOpened({ ...opened, ...target })}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </ReaderSheetContext.Provider>
  )
}
