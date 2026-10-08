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
import type { Rule } from "@/rules/rule"
import type { RulebookView } from "../rulebook.functions"
import { readyToApprove } from "../rulebookEditing"
import { RuleCard, type RuleCardActions } from "../RuleCard/RuleCard"

const topicLabels: Record<Rule["topic"], string> = {
  material: "Materials",
  color: "Colors",
  dimension: "Dimensions",
  placement: "Placement",
  style: "Style",
  documentation: "Documents",
  neighbor: "Neighbors",
  process: "Process",
  maintenance: "Maintenance"
}

export type RulebookPageProps = {
  draft: RulebookView
  published: RulebookView
  documents: GoverningDocument[]
  loadJob: (jobId: string) => Promise<Job | null>
  onBuild: (documentIds: string[]) => Promise<void>
  /** Approves every pending rule with no open issues; resolves to how many. */
  onApproveReady: () => Promise<number>
  onPublish: (rulebookId: string) => Promise<void>
  actions: RuleCardActions
  onChanged: () => void
}

function RuleList({ rules, actions }: { rules: Rule[]; actions?: RuleCardActions }) {
  const byTopic = Map.groupBy(rules, (rule) => rule.topic)
  return (
    <div className="flex flex-col gap-6">
      {[...byTopic].map(([topic, group]) => (
        <section key={topic} aria-label={topicLabels[topic]} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            {topicLabels[topic]} <span className="font-normal text-muted-foreground">({group.length})</span>
          </h2>
          {group.map((rule) => (
            <RuleCard key={rule.id} rule={rule} actions={actions} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** The administrator's rulebook: build from documents, review the draft rule by rule, publish. */
export function RulebookPage({
  draft,
  published,
  documents,
  loadJob,
  onBuild,
  onApproveReady,
  onPublish,
  actions,
  onChanged
}: RulebookPageProps) {
  const ready = documents.filter((document) => document.status === "ready")
  const [selected, setSelected] = useState<string[]>(() => ready.map((document) => document.id))
  const [isStarting, setIsStarting] = useState(false)
  const counts = {
    pending: draft.rules.filter((rule) => rule.review.status === "pending").length,
    approved: draft.rules.filter((rule) => rule.review.status === "approved").length,
    rejected: draft.rules.filter((rule) => rule.review.status === "rejected").length
  }
  const readyCount = readyToApprove(draft.rules).length

  const build = async () => {
    setIsStarting(true)
    try {
      await onBuild(selected)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The build didn't start.")
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Build the rulebook</CardTitle>
          <CardDescription>
            Rules are extracted section by section from the documents you choose, checked against their pages, and saved
            as a draft for you to review. Earlier approvals and edits carry over.
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
          <Button disabled={draft.isBuilding || isStarting || selected.length === 0} onClick={() => void build()}>
            {draft.isBuilding ? "Building" : "Build rulebook"}
          </Button>
        </CardFooter>
      </Card>

      <Tabs defaultValue="draft">
        <TabsList>
          <TabsTrigger value="draft">Draft{draft.rulebook ? ` (${draft.rules.length})` : ""}</TabsTrigger>
          <TabsTrigger value="published">
            Published{published.rulebook?.version ? ` (version ${published.rulebook.version})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="draft" className="flex flex-col gap-4">
          {draft.rulebook ? (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Review the draft</CardTitle>
                  <CardDescription className="flex flex-wrap gap-2">
                    <Badge variant="outline">{counts.pending} pending</Badge>
                    <Badge variant="outline">{counts.approved} approved</Badge>
                    <Badge variant="outline">{counts.rejected} rejected</Badge>
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
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={readyCount === 0}
                    onClick={() => {
                      void onApproveReady()
                        .then((count) => {
                          toast.success(`Approved ${count} ${count === 1 ? "rule" : "rules"}.`)
                          onChanged()
                        })
                        .catch((error: unknown) =>
                          toast.error(error instanceof Error ? error.message : "Approving failed.")
                        )
                    }}
                  >
                    Approve all ready ({readyCount})
                  </Button>
                  <Button
                    disabled={draft.blockers.length > 0}
                    onClick={() => {
                      const rulebookId = draft.rulebook?.id
                      if (rulebookId) {
                        void onPublish(rulebookId)
                          .then(onChanged)
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Publishing failed.")
                          )
                      }
                    }}
                  >
                    Publish
                  </Button>
                </CardFooter>
              </Card>
              {draft.removed.length > 0 ? (
                <Alert>
                  <AlertTitle>No longer in the documents</AlertTitle>
                  <AlertDescription>
                    These rules were in the previous version but weren’t extracted this time:{" "}
                    {draft.removed.map((rule) => rule.title).join(", ")}.
                  </AlertDescription>
                </Alert>
              ) : null}
              <RuleList rules={draft.rules} actions={actions} />
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
        <TabsContent value="published">
          {published.rulebook ? (
            <RuleList rules={published.rules.filter((rule) => rule.review.status === "approved")} />
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
