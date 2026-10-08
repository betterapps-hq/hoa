import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getJobStatus, listDocuments } from "@/features/documents/documents.functions"
import {
  approveReadyRules,
  deleteDraftRule,
  discardRulebookDraft,
  editPublishedRulebook,
  getRulebookView,
  publishRulebook,
  resolveIssue,
  reviewRule,
  saveRule,
  startRulebookBuild,
  type RulebookView
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"
import { RuleTable } from "@/features/rulebook/RuleTable/RuleTable"
import { getSession } from "@/session/session.functions"

type RulesData =
  | { isAdministrator: false; published: RulebookView }
  | {
      isAdministrator: true
      draft: RulebookView
      published: RulebookView
      documents: Awaited<ReturnType<typeof listDocuments>>
    }

export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  loader: async (): Promise<RulesData> => {
    const session = await getSession()
    const published = await getRulebookView({ data: { which: "published" } })
    if (session.roleId !== "administrator") {
      return { isAdministrator: false, published }
    }
    const [draft, documents] = await Promise.all([getRulebookView({ data: { which: "draft" } }), listDocuments()])
    return { isAdministrator: true, draft, published, documents }
  },
  component: RulesRoute
})

function RulesRoute() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => void router.invalidate()
  if (!data.isAdministrator) {
    const rules = data.published.rules.filter((rule) => rule.review.status === "approved")
    return (
      <div className="px-4 lg:px-6">
        {data.published.rulebook ? (
          <RuleTable rules={rules} />
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
        }
      }}
    />
  )
}
