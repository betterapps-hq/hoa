import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getDocumentPage, getJobStatus, listDocuments } from "@/features/documents/documents.functions"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import {
  addRuleCitation,
  approveReadyRules,
  deleteDraftRule,
  discardRulebookDraft,
  editPublishedRulebook,
  getRulebookView,
  publishRulebook,
  removeRuleCitation,
  resolveIssue,
  reviewRule,
  saveRule,
  startRulebookBuild,
  type RulebookView
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"
import { RuleTable } from "@/features/rulebook/RuleTable/RuleTable"
import { getSession } from "@/session/session.functions"

type Documents = Awaited<ReturnType<typeof listDocuments>>

type RulesData =
  | { isAdministrator: false; published: RulebookView; documents: Documents }
  | { isAdministrator: true; draft: RulebookView; published: RulebookView; documents: Documents }

export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  loader: async (): Promise<RulesData> => {
    const session = await getSession()
    const [published, documents] = await Promise.all([
      getRulebookView({ data: { which: "published" } }),
      listDocuments()
    ])
    if (session.roleId !== "administrator") {
      return { isAdministrator: false, published, documents }
    }
    return { isAdministrator: true, draft: await getRulebookView({ data: { which: "draft" } }), published, documents }
  },
  component: RulesRoute
})

/** The documents citations come from: every document that has been read. */
function citationSource(documents: Documents): CitationSource {
  return {
    documents: documents.flatMap((document) =>
      document.status === "ready" && document.pageCount
        ? [{ id: document.id, title: document.title, pageCount: document.pageCount }]
        : []
    ),
    loadPage: (documentId, pageIndex) => getDocumentPage({ data: { documentId, pageIndex } })
  }
}

function RulesRoute() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => void router.invalidate()
  const source = citationSource(data.documents)
  if (!data.isAdministrator) {
    const rules = data.published.rules.filter((rule) => rule.review.status === "approved")
    return (
      <div className="px-4 lg:px-6">
        {data.published.rulebook ? (
          <RuleTable rules={rules} source={source} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No rules published yet</EmptyTitle>
              <EmptyDescription>The HOA hasn’t published its rulebook.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    )
  }
  return (
    <RulebookPage
      draft={data.draft}
      published={data.published}
      documents={data.documents}
      source={source}
      loadJob={(jobId) => getJobStatus({ data: { jobId } })}
      onBuild={async (documentIds) => {
        await startRulebookBuild({ data: { documentIds } })
      }}
      onApproveReady={async () => {
        const { count } = await approveReadyRules()
        return count
      }}
      onPublish={async (rulebookId) => {
        await publishRulebook({ data: { rulebookId } })
      }}
      onEditPublished={async () => {
        await editPublishedRulebook()
      }}
      onDiscardDraft={() => discardRulebookDraft()}
      onChanged={refresh}
      actions={{
        review: async (ruleId, status) => {
          await reviewRule({ data: { ruleId, status, note: null } })
          refresh()
        },
        save: async (ruleId, changes) => {
          await saveRule({ data: { ruleId, changes } })
          refresh()
        },
        resolveIssue: async (ruleId, issueIndex, note) => {
          await resolveIssue({ data: { ruleId, issueIndex, note } })
          refresh()
        },
        remove: async (ruleId) => {
          await deleteDraftRule({ data: { ruleId } })
          refresh()
        },
        addCitation: async (ruleId, selection) => {
          await addRuleCitation({ data: { ruleId, ...selection } })
          refresh()
        },
        removeCitation: async (ruleId, index) => {
          await removeRuleCitation({ data: { ruleId, index } })
          refresh()
        }
      }}
    />
  )
}
