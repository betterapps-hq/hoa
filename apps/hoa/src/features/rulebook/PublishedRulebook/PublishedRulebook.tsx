import { DownloadIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { attempt } from "../attempt"
import type { RulebookSources, RulebookView } from "../rulebook.functions"
import { recordsOf } from "../rulebookRecords"
import { RulebookWorkspace } from "../RulebookWorkspace/RulebookWorkspace"
import type { RulebookSource } from "../useRulebookWorkspace"
import { saveFile } from "./PublishedRulebook.utils"

export type PublishedRulebookProps = {
  published: RulebookView
  sources: RulebookSources
  source: RulebookSource
  /** The published rules file's JSON, exactly as written. */
  loadRulesFile: () => Promise<string>
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** The published rulebook, read-only: its version, its rules file's hash and download, and the same views as a draft. */
export function PublishedRulebook({ published, sources, source, loadRulesFile }: PublishedRulebookProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const { rulebook, content } = published
  if (!rulebook || !content) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing published yet</EmptyTitle>
          <EmptyDescription>Homeowners’ applications are checked against the published rulebook.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const records = recordsOf(sources, content, "published")
  const download = async () => {
    setIsDownloading(true)
    const json = await attempt(loadRulesFile, "The rules file couldn't be downloaded.")
    setIsDownloading(false)
    if (json) {
      saveFile(`rules-version-${rulebook.version ?? "draft"}.json`, json)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Version {rulebook.version}</CardTitle>
          <CardDescription>
            {records.rules.length} rules
            {rulebook.publishedAt ? `, published ${dateFormat.format(new Date(rulebook.publishedAt))}` : ""}.
            Applications are reviewed against this version.
          </CardDescription>
        </CardHeader>
        {published.fileSha256 ? (
          <>
            <CardContent>
              <p className="text-sm text-muted-foreground">Rules file SHA-256</p>
              <p className="font-mono text-sm break-all">{published.fileSha256}</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" disabled={isDownloading} onClick={() => void download()}>
                <DownloadIcon />
                {isDownloading ? "Downloading" : "Download rules file"}
              </Button>
            </CardFooter>
          </>
        ) : null}
      </Card>
      <RulebookWorkspace records={records} source={source} actions={null} />
    </div>
  )
}
