import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  completeDocumentUpload,
  createDocumentUpload,
  getActiveJob,
  getDocumentPage,
  getJobStatus,
  listDocuments,
  removeGoverningDocument,
  uploadDocumentFile
} from "@/features/documents/documents.functions"
import { uploadDocument } from "@/features/documents/uploadDocument"
import { PublishedRulebook } from "@/features/rulebook/PublishedRulebook/PublishedRulebook"
import {
  discardRulebookDraft,
  getBuildResults,
  getPublishedRulesFileJson,
  getRulebookSources,
  getRulebookView,
  getSourceText,
  publishRulebook,
  startRulebookBuild,
  stopRulebookBuild
} from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"
import {
  answerRulebookQuestion,
  resolveRulebookIssue,
  reviewRulebookRecords,
  saveRulebookRule,
  saveRulebookSettings,
  setProvisionNoRule
} from "@/features/rulebook/rulebookReview.functions"
import type { RulebookActions, RulebookSource } from "@/features/rulebook/useRulebookWorkspace"
import { getSession } from "@/session/session.functions"

/** The rulebook and the governing documents it's built from, for everyone; administrators build, review and publish. */
export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  validateSearch: (search: Record<string, unknown>): { review?: "draft" } =>
    search.review === "draft" ? { review: "draft" } : {},
  loader: async () => {
    const session = await getSession()
    const [published, sources, uploads] = await Promise.all([
      getRulebookView({ data: { which: "published" } }),
      getRulebookSources(),
      listDocuments()
    ])
    if (session.roleId !== "administrator") {
      return { isAdministrator: false as const, published, sources, uploads }
    }
    const [draft, jobs] = await Promise.all([
      getRulebookView({ data: { which: "draft" } }),
      Promise.all(
        uploads
          .filter((upload) => upload.status === "processing")
          .map(async (upload) => [upload.id, (await getActiveJob({ data: { subjectId: upload.id } }))?.id] as const)
      )
    ])
    return {
      isAdministrator: true as const,
      published,
      sources,
      uploads,
      draft,
      jobs: Object.fromEntries(jobs.flatMap(([documentId, jobId]) => (jobId ? [[documentId, jobId]] : [])))
    }
  },
  component: RulesRoute
})

function RulesRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const source: RulebookSource = {
    documents: data.sources.files,
    loadPage: (documentId, pageIndex) => getDocumentPage({ data: { documentId, pageIndex } }),
    loadSourceText: () => getSourceText()
  }
  const loadJob = (jobId: string) => getJobStatus({ data: { jobId } })
  if (!data.isAdministrator) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 lg:px-6">
        <PublishedRulebook
          published={data.published}
          sources={data.sources}
          uploads={data.uploads}
          source={source}
          loadJob={loadJob}
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
    answerQuestion: changing(async (questionId, option, text) => {
      const { notApproved } = await answerRulebookQuestion({ data: { rulebookId, questionId, option, text } })
      return { skipped: notApproved }
    }),
    setNoRule: changing((provisionKey, noRule) => setProvisionNoRule({ data: { rulebookId, provisionKey, noRule } })),
    saveSettings: changing(({ clauses, policy }) => saveRulebookSettings({ data: { rulebookId, clauses, policy } }))
  }
  // With nothing published, the draft is the whole rulebook, so it opens for review.
  const isReviewing = data.draft.content !== null && (search.review === "draft" || data.published.rulebook === null)
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 lg:px-6">
      <RulebookPage
        draft={data.draft}
        published={data.published}
        sources={data.sources}
        uploads={data.uploads}
        jobs={data.jobs}
        source={source}
        actions={actions}
        isReviewing={isReviewing}
        onReviewingChange={(reviewing) => {
          void navigate({ search: reviewing ? { review: "draft" } : {} })
          window.scrollTo({ top: 0 })
        }}
        loadJob={loadJob}
        loadRulesFile={() => getPublishedRulesFileJson()}
        onUpload={(file, details) =>
          uploadDocument(
            {
              createUpload: (input) => createDocumentUpload({ data: input }),
              uploadThroughServer: (form) => uploadDocumentFile({ data: form }),
              completeUpload: (documentId) => completeDocumentUpload({ data: { documentId } })
            },
            file,
            details
          )
        }
        onRemoveDocument={async (documentId) => {
          await removeGoverningDocument({ data: { documentId } })
        }}
        onBuild={async () => {
          await startRulebookBuild()
        }}
        onStop={() => stopRulebookBuild()}
        loadBuildResults={(jobId, since) => getBuildResults({ data: { jobId, since } })}
        onPublish={changing(async (id: string) => {
          await publishRulebook({ data: { rulebookId: id } })
        })}
        onDiscard={changing(async (id: string) => {
          await discardRulebookDraft({ data: { rulebookId: id } })
        })}
        onChanged={() => void router.invalidate()}
      />
    </div>
  )
}
