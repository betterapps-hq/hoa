import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { GoverningDocument } from "@/documents/governingDocument"
import { GoverningDocuments } from "@/features/documents/GoverningDocuments/GoverningDocuments"
import type { Job } from "@/jobs/job"
import type { RulebookSources, RulebookView } from "../rulebook.functions"
import { recordsOf } from "../rulebookRecords"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import type { RulebookSource } from "../useRulebookWorkspace"

export type PublishedRulebookProps = {
  published: RulebookView
  sources: RulebookSources
  /** The association's governing documents, to read or download. */
  uploads: GoverningDocument[]
  source: RulebookSource
  loadJob: (jobId: string) => Promise<Job | null>
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/**
 * The rulebook as a member sees it (encoding.md, UX, Members): the rules in force, each with the passage of the
 * governing documents it comes from, and the documents themselves to read or download. Never a draft.
 */
export function PublishedRulebook({ published, sources, uploads, source, loadJob }: PublishedRulebookProps) {
  const { rulebook, content } = published
  const ready = uploads.filter((upload) => upload.status === "ready")
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{sources.organization.name} rules</h2>
        <p className="max-w-prose text-muted-foreground">
          Your project is reviewed against these rules. Open a citation to read the original wording.
        </p>
      </header>
      {rulebook && content ? (
        <section aria-labelledby="member-rules" className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="member-rules" className="text-base font-semibold">
              Rules
            </h2>
            {rulebook.publishedAt ? (
              <p className="text-sm text-muted-foreground">
                In force since {dateFormat.format(new Date(rulebook.publishedAt))}.
              </p>
            ) : null}
          </div>
          <RulebookWorkspace
            records={recordsOf(sources, rulebook, content, "published", published.filedSources)}
            source={source}
            actions={null}
            audience="member"
          />
        </section>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No rules are published yet</EmptyTitle>
            <EmptyDescription>
              The association hasn&rsquo;t published its rulebook yet. Its governing documents are below.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <GoverningDocuments uploads={ready} jobs={{}} loadJob={loadJob} onChanged={() => undefined} />
    </div>
  )
}
