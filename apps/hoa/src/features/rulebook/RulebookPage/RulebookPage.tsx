import { ScrollTextIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GoverningDocument } from "@/documents/governingDocument"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import type { RulebookView } from "../rulebook.functions"
import { approvedRuleLines, rulebookCounts, ruleLines } from "../rulebookView"
import { RuleList } from "../RuleList/RuleList"

export type RulebookPageProps = {
  draft: RulebookView
  published: RulebookView
  documents: GoverningDocument[]
  loadJob: (jobId: string) => Promise<Job | null>
  onBuild: (documentIds: string[]) => Promise<void>
  onPublish: (rulebookId: string) => Promise<void>
  onChanged: () => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

async function attempt(action: () => Promise<unknown>, fallback: string) {
  try {
    await action()
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : fallback)
    return false
  }
}

/** The administrator's rulebook: build a draft from documents, see what it holds, publish it. */
export function RulebookPage({
  draft,
  published,
  documents,
  loadJob,
  onBuild,
  onPublish,
  onChanged
}: RulebookPageProps) {
  const ready = documents.filter((document) => document.status === "ready")
  const [selected, setSelected] = useState<string[]>(() => ready.map((document) => document.id))
  const [isBusy, setIsBusy] = useState(false)
  const [tab, setTab] = useState(draft.rulebook || !published.rulebook ? "draft" : "published")
  const counts = draft.content ? rulebookCounts(draft.content) : null
  const publishedRules = published.content ? approvedRuleLines(published.content) : []

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setIsBusy(true)
    const succeeded = await attempt(action, fallback)
    setIsBusy(false)
    onChanged()
    return succeeded
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
          {draft.rulebook && draft.content && counts ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The draft</CardTitle>
                  <CardDescription className="flex flex-wrap gap-2">
                    <Badge variant="outline">{counts.rules} rules</Badge>
                    <Badge variant="outline">{counts.terms} terms</Badge>
                    <Badge variant="outline">{counts.questions} questions</Badge>
                    <Badge variant="outline">{counts.uncovered} uncovered provisions</Badge>
                    <Badge variant="outline">{counts.withIssues} with problems</Badge>
                  </CardDescription>
                </CardHeader>
                {draft.blockers.length > 0 ? (
                  <CardContent>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {draft.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </CardContent>
                ) : null}
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
              <RuleList rules={ruleLines(draft.content)} showStatus />
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
          {published.rulebook ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Version {published.rulebook.version}</CardTitle>
                  <CardDescription>
                    {publishedRules.length} rules
                    {published.rulebook.publishedAt
                      ? `, published ${dateFormat.format(new Date(published.rulebook.publishedAt))}`
                      : ""}
                    . Applications are reviewed against this version.
                  </CardDescription>
                </CardHeader>
                {published.fileSha256 ? (
                  <CardContent>
                    <p className="text-sm break-all text-muted-foreground">
                      Rules file SHA-256: <span className="font-mono">{published.fileSha256}</span>
                    </p>
                  </CardContent>
                ) : null}
              </Card>
              <RuleList rules={publishedRules} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing published yet</EmptyTitle>
                <EmptyDescription>
                  Homeowners’ applications are checked against the published rulebook.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
