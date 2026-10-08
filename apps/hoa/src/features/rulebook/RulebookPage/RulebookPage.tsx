import { PencilIcon, ScrollTextIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { GoverningDocument } from "@/documents/governingDocument"
import type { CitationSource } from "@/features/documents/DocumentViewer/DocumentViewer"
import { JobProgress } from "@/features/jobs/JobProgress/JobProgress"
import type { Job } from "@/jobs/job"
import type { RulebookView } from "../rulebook.functions"
import { readyToApprove } from "../rulebookEditing"
import type { RuleCardActions } from "../RuleCard/RuleCard"
import { RuleTable } from "../RuleTable/RuleTable"

export type RulebookPageProps = {
  draft: RulebookView
  published: RulebookView
  documents: GoverningDocument[]
  loadJob: (jobId: string) => Promise<Job | null>
  onBuild: (documentIds: string[]) => Promise<void>
  /** Approves every pending rule with no open issues; resolves to how many. */
  onApproveReady: () => Promise<number>
  onPublish: (rulebookId: string) => Promise<void>
  /** Copies the published rulebook into a draft to edit. */
  onEditPublished: () => Promise<void>
  onDiscardDraft: () => Promise<void>
  actions: RuleCardActions
  /** The documents citations come from. */
  source: CitationSource
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

/** The administrator's rulebook: build from documents, review and edit the draft, publish; or edit the published one. */
export function RulebookPage({
  draft,
  published,
  documents,
  loadJob,
  onBuild,
  onApproveReady,
  onPublish,
  onEditPublished,
  onDiscardDraft,
  actions,
  source,
  onChanged
}: RulebookPageProps) {
  const ready = documents.filter((document) => document.status === "ready")
  const [selected, setSelected] = useState<string[]>(() => ready.map((document) => document.id))
  const [isBusy, setIsBusy] = useState(false)
  const [tab, setTab] = useState(draft.rulebook || !published.rulebook ? "draft" : "published")
  const counts = {
    pending: draft.rules.filter((rule) => rule.review.status === "pending").length,
    approved: draft.rules.filter((rule) => rule.review.status === "approved").length,
    rejected: draft.rules.filter((rule) => rule.review.status === "rejected").length
  }
  const readyCount = readyToApprove(draft.rules).length
  const publishedRules = published.rules.filter((rule) => rule.review.status === "approved")

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setIsBusy(true)
    const succeeded = await attempt(action, fallback)
    setIsBusy(false)
    onChanged()
    return succeeded
  }

  const editPublished = async () => {
    if (await run(onEditPublished, "The draft wasn't created.")) {
      setTab("draft")
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
                    disabled={isBusy || readyCount === 0}
                    onClick={() =>
                      void run(async () => {
                        const count = await onApproveReady()
                        toast.success(`Approved ${count} ${count === 1 ? "rule" : "rules"}.`)
                      }, "Approving failed.")
                    }
                  >
                    Approve all ready ({readyCount})
                  </Button>
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
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" disabled={isBusy} />}>
                      Discard draft
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Discard the draft?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Every change in this draft is lost. The published rulebook stays as it is.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void run(onDiscardDraft, "The draft wasn't discarded.")}
                        >
                          Discard
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
              {draft.removed.length > 0 ? (
                <Alert>
                  <AlertTitle>
                    {draft.removed.length} published {draft.removed.length === 1 ? "rule isn’t" : "rules aren’t"} in
                    this draft
                  </AlertTitle>
                  <AlertDescription>
                    {draft.removed.length === 1 ? "It’s" : "They’re"} removed when you publish.
                    <Accordion className="w-full">
                      <AccordionItem value="removed">
                        <AccordionTrigger>Show which</AccordionTrigger>
                        <AccordionContent>
                          <ul className="list-disc pl-5">
                            {draft.removed.map((rule) => (
                              <li key={rule.ruleKey}>{rule.title}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </AlertDescription>
                </Alert>
              ) : null}
              <RuleTable rules={draft.rules} actions={actions} source={source} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollTextIcon />
                </EmptyMedia>
                <EmptyTitle>No draft</EmptyTitle>
                <EmptyDescription>
                  {published.rulebook
                    ? "To change the rules, edit the published rulebook, or build a new draft from the documents."
                    : "Build the rulebook from the HOA’s documents to review its rules."}
                </EmptyDescription>
              </EmptyHeader>
              {published.rulebook ? (
                <EmptyContent>
                  <Button disabled={isBusy || draft.isBuilding} onClick={() => void editPublished()}>
                    <PencilIcon />
                    Edit published rules
                  </Button>
                </EmptyContent>
              ) : null}
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
                  <CardAction>
                    {draft.rulebook ? (
                      <Button variant="outline" onClick={() => setTab("draft")}>
                        Open the draft
                      </Button>
                    ) : (
                      <Button disabled={isBusy || draft.isBuilding} onClick={() => void editPublished()}>
                        <PencilIcon />
                        Edit rules
                      </Button>
                    )}
                  </CardAction>
                </CardHeader>
              </Card>
              <RuleTable rules={publishedRules} source={source} />
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
