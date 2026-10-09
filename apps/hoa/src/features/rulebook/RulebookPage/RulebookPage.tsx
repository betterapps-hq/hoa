import { ScrollTextIcon } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import { attempt } from "../attempt"
import { PublishedRulebook } from "../PublishedRulebook/PublishedRulebook"
import type { RulebookSources, RulebookView } from "../rulebook.functions"
import { recordsOf } from "../rulebookRecords"
import { rulebookCounts } from "../rulebookView"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import type { RulebookActions } from "../useRulebookWorkspace"

export type RulebookPageProps = {
  draft: RulebookView
  published: RulebookView
  sources: RulebookSources
  documents: GoverningDocument[]
  /** Loads document pages for citations. */
  source: CitationSource
  /** What the administrator can do to the draft. */
  actions: RulebookActions
  loadJob: (jobId: string) => Promise<Job | null>
  loadRulesFile: () => Promise<string>
  onBuild: (documentIds: string[]) => Promise<void>
  onPublish: (rulebookId: string) => Promise<void>
  onChanged: () => void
}

/** The administrator's rulebook: build a draft from documents, review it, publish it, and see what's published. */
export function RulebookPage({
  draft,
  published,
  sources,
  documents,
  source,
  actions,
  loadJob,
  loadRulesFile,
  onBuild,
  onPublish,
  onChanged
}: RulebookPageProps) {
  const ready = documents.filter((document) => document.status === "ready")
  const [selected, setSelected] = useState<string[]>(() => ready.map((document) => document.id))
  const [isBusy, setIsBusy] = useState(false)
  const [tab, setTab] = useState(draft.rulebook || !published.rulebook ? "draft" : "published")
  const records = draft.content ? recordsOf(sources, draft.content, "draft") : null
  const counts = records ? rulebookCounts(records) : null

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setIsBusy(true)
    const result = await attempt(action, fallback)
    setIsBusy(false)
    onChanged()
    return result
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Build the rulebook</CardTitle>
          <CardDescription>
            The documents you choose are read provision by provision, encoded as rules, checked and saved as a draft for
            you to review. Approvals of rules that didn’t change carry over.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">Upload and read at least one document first.</p>
          ) : (
            ready.map((document) => (
              <Field key={document.id} orientation="horizontal">
                <Checkbox
                  id={`build-${document.id}`}
                  checked={selected.includes(document.id)}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked === true ? [...current, document.id] : current.filter((id) => id !== document.id)
                    )
                  }
                />
                <FieldLabel htmlFor={`build-${document.id}`}>{document.title}</FieldLabel>
              </Field>
            ))
          )}
          {draft.isBuilding && draft.buildJobId ? (
            <JobProgress jobId={draft.buildJobId} loadJob={loadJob} onFinished={onChanged} />
          ) : null}
          {!draft.isBuilding && draft.lastBuildError ? (
            <Alert variant="destructive">
              <AlertTitle>The last build had problems</AlertTitle>
              <AlertDescription className="line-clamp-3 break-all">{draft.lastBuildError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            disabled={draft.isBuilding || isBusy || selected.length === 0}
            onClick={() =>
              void run(async () => {
                await onBuild(selected)
                setTab("draft")
              }, "The build didn't start.")
            }
          >
            {draft.isBuilding ? "Building" : "Build rulebook"}
          </Button>
        </CardFooter>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value === "published" ? "published" : "draft")}>
        <TabsList>
          <TabsTrigger value="draft">Draft{counts ? ` (${counts.rules})` : ""}</TabsTrigger>
          <TabsTrigger value="published">
            Published{published.rulebook?.version ? ` (version ${published.rulebook.version})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draft" className="flex flex-col gap-4">
          {draft.rulebook && records && counts ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The draft</CardTitle>
                  <CardDescription className="flex flex-wrap gap-2">
                    <Badge variant="outline">{counts.rules} rules</Badge>
                    <Badge variant="outline">{counts.terms} terms</Badge>
                    <Badge variant="outline">{counts.approved} approved</Badge>
                    <Badge variant="outline">{counts.questions} questions</Badge>
                    <Badge variant="outline">{counts.uncovered} uncovered provisions</Badge>
                    <Badge variant="outline">{counts.withIssues} with open issues</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {draft.blockers.length > 0 ? (
                    <div className="flex flex-col gap-1 text-sm">
                      <p>Before it can be published:</p>
                      <ul className="list-disc pl-5 text-muted-foreground">
                        {draft.blockers.map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Everything is reviewed and the rules file checks out. Publishing replaces the published version.
                    </p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    disabled={isBusy || draft.blockers.length > 0}
                    onClick={() => {
                      const rulebookId = draft.rulebook?.id
                      if (rulebookId) {
                        void run(async () => {
                          await onPublish(rulebookId)
                          setTab("published")
                        }, "Publishing failed.")
                      }
                    }}
                  >
                    Publish
                  </Button>
                </CardFooter>
              </Card>
              <RulebookWorkspace records={records} source={source} actions={actions} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollTextIcon />
                </EmptyMedia>
                <EmptyTitle>No draft</EmptyTitle>
                <EmptyDescription>Build the rulebook from the HOA’s documents to review its rules.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="published" className="flex flex-col gap-4">
          <PublishedRulebook published={published} sources={sources} source={source} loadRulesFile={loadRulesFile} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
