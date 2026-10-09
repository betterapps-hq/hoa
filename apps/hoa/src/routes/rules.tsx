import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { getJobStatus, listDocuments } from "@/features/documents/documents.functions"
import {
  getRulebookView,
  publishRulebook,
  startRulebookBuild,
  type RulebookView
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"
import { approvedRuleLines } from "@/features/rulebook/rulebookView"
import { RuleList } from "@/features/rulebook/RuleList/RuleList"
import { getSession } from "@/session/session.functions"

type Documents = Awaited<ReturnType<typeof listDocuments>>

type RulesData =
  | { isAdministrator: false; published: RulebookView }
  | { isAdministrator: true; draft: RulebookView; published: RulebookView; documents: Documents }

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
  if (!data.isAdministrator) {
    const { content } = data.published
    return (
      <div className="px-4 lg:px-6">
        {content ? (
          <RuleList rules={approvedRuleLines(content)} />
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
      onPublish={async (rulebookId) => {
        await publishRulebook({ data: { rulebookId } })
      }}
      onChanged={() => void router.invalidate()}
    />
  )
}
