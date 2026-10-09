import { createFileRoute, useRouter } from "@tanstack/react-router"
import { getDocumentPage, getJobStatus, listDocuments } from "@/features/documents/documents.functions"
import { PublishedRulebook } from "@/features/rulebook/PublishedRulebook/PublishedRulebook"
import {
  getPublishedRulesFileJson,
  getRulebookSources,
  getRulebookView,
  getSourceText,
  publishRulebook,
  startRulebookBuild,
  type RulebookSources,
  type RulebookView
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"
import {
  answerRulebookQuestion,
  removeRulebookRule,
  resolveRulebookIssue,
  reviewRulebookRecords,
  saveRulebookRule,
  saveRulebookSettings,
  setProvisionNoRule
} from "@/features/rulebook/rulebookReview.functions"
import type { RulebookActions, RulebookSource } from "@/features/rulebook/useRulebookWorkspace"
import { getSession } from "@/session/session.functions"

type Documents = Awaited<ReturnType<typeof listDocuments>>

type RulesData =
  | { isAdministrator: false; published: RulebookView; sources: RulebookSources }
  | {
      isAdministrator: true
      draft: RulebookView
      published: RulebookView
      sources: RulebookSources
      documents: Documents
    }

export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  loader: async (): Promise<RulesData> => {
    const session = await getSession()
    const [published, sources] = await Promise.all([
      getRulebookView({ data: { which: "published" } }),
      getRulebookSources()
    ])
    if (session.roleId !== "administrator") {
      return { isAdministrator: false, published, sources }
    }
    const [draft, documents] = await Promise.all([getRulebookView({ data: { which: "draft" } }), listDocuments()])
    return { isAdministrator: true, draft, published, sources, documents }
  },
  component: RulesRoute
})

function RulesRoute() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const source: RulebookSource = {
    documents: data.sources.files,
    loadPage: (documentId, pageIndex) => getDocumentPage({ data: { documentId, pageIndex } }),
    loadSourceText: () => getSourceText()
  }
  const loadRulesFile = () => getPublishedRulesFileJson()
  if (!data.isAdministrator) {
    return (
      <div className="px-4 lg:px-6">
        <PublishedRulebook
          published={data.published}
          sources={data.sources}
          source={source}
          loadRulesFile={loadRulesFile}
        />
      </div>
    )
  }
  const rulebookId = data.draft.rulebook?.id ?? ""
  // Every change reloads the rulebook, so what's shown is what's stored.
  const changing =
    <A extends unknown[], R>(action: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const result = await action(...args)
      await router.invalidate()
      return result
    }
  const actions: RulebookActions = {
    review: changing((refs, status, note) => reviewRulebookRecords({ data: { rulebookId, refs, status, note } })),
    resolveIssue: changing((ref, index, note) => resolveRulebookIssue({ data: { rulebookId, ref, index, note } })),
    saveRule: changing((rule) => saveRulebookRule({ data: { rulebookId, rule } })),
    removeRule: changing((key) => removeRulebookRule({ data: { rulebookId, key } })),
    answerQuestion: changing(async (questionId, option, text) => {
      const { notApproved } = await answerRulebookQuestion({ data: { rulebookId, questionId, option, text } })
      return { skipped: notApproved }
    }),
    setNoRule: changing((provisionKey, noRule) => setProvisionNoRule({ data: { rulebookId, provisionKey, noRule } })),
    saveSettings: changing(({ clauses, policy }) => saveRulebookSettings({ data: { rulebookId, clauses, policy } }))
  }
  return (
    <RulebookPage
      draft={data.draft}
      published={data.published}
      sources={data.sources}
      documents={data.documents}
      source={source}
      actions={actions}
      loadJob={(jobId) => getJobStatus({ data: { jobId } })}
      loadRulesFile={loadRulesFile}
      onBuild={async (documentIds) => {
        await startRulebookBuild({ data: { documentIds } })
      }}
      onPublish={async (id) => {
        await publishRulebook({ data: { rulebookId: id } })
      }}
      onChanged={() => void router.invalidate()}
    />
  )
}
