import { createFileRoute } from "@tanstack/react-router"
import { citesOf, readerSearch } from "@/features/documents/citationLink"
import { DocumentReader } from "@/features/documents/DocumentReader/DocumentReader"

/**
 * A governing document to read whole, where every citation opens (docs/ux.md, Citations): `?provision=` opens it at a
 * provision, highlighted, and `cites=` lists a rule's citations to step through. The server checks the document is the
 * organization's.
 */
export const Route = createFileRoute("/documents/$documentId")({
  staticData: { title: "Document" },
  validateSearch: readerSearch,
  component: DocumentRoute
})

function DocumentRoute() {
  const { documentId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    // The reader scrolls inside itself: it fills the window below the site header.
    <div className="-my-4 h-[calc(100svh-var(--header-height))] md:-my-6 md:h-[calc(100svh-var(--header-height)-1rem)]">
      <DocumentReader
        documentId={documentId}
        provision={search.provision ?? null}
        cites={citesOf(search.cites)}
        onNavigate={(target) =>
          void navigate({
            to: "/documents/$documentId",
            params: { documentId: target.documentId },
            search: {
              ...(target.provision ? { provision: target.provision } : {}),
              ...(search.cites ? { cites: search.cites } : {})
            },
            replace: true
          })
        }
      />
    </div>
  )
}
