import { createFileRoute, useRouter } from "@tanstack/react-router"
import { getJobStatus, listDocuments } from "@/features/documents/documents.functions"
import {
  approveReadyRules,
  getRulebookView,
  publishRulebook,
  resolveIssue,
  reviewRule,
  saveRule,
  startRulebookBuild
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"

export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  loader: async () => {
    const [draft, published, documents] = await Promise.all([
      getRulebookView({ data: { which: "draft" } }),
      getRulebookView({ data: { which: "published" } }),
      listDocuments()
    ])
    return { draft, published, documents }
  },
  component: RulesRoute
})

function RulesRoute() {
  const { draft, published, documents } = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => void router.invalidate()
  return (
    <RulebookPage
      draft={draft}
      published={published}
      documents={documents}
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
        }
      }}
    />
  )
}
