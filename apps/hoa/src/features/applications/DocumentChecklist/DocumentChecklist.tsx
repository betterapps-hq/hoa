import { CheckCircle2Icon, CircleIcon } from "lucide-react"
import { InfoTip } from "@/components/InfoTip/InfoTip"
import { listNames, sentenceCase } from "@/lib/text"
import type { ProjectDocument } from "@/projectTypes/projectType"
import { documentStatuses, type KindedFile } from "../fileKinds"

export type DocumentChecklistProps = { documents: readonly ProjectDocument[]; files: readonly KindedFile[] }

/** Which of the documents the project type asks for are among the files, and which are still missing. */
export function DocumentChecklist({ documents, files }: DocumentChecklistProps) {
  const statuses = documentStatuses(documents, files)
  const missing = statuses.filter((status) => status.document.isRequired && status.files.length === 0)
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4">
      <ul className="flex flex-col gap-2" aria-label="Documents to include">
        {statuses.map(({ document, files: added }) => {
          const isAdded = added.length > 0
          return (
            <li key={document.documentType} className="flex items-start gap-2 text-sm">
              {isAdded ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                <span className={isAdded ? "font-medium" : undefined}>
                  {sentenceCase(document.label)}
                  {document.isRequired ? (
                    <span aria-hidden className="ml-0.5 text-destructive">
                      *
                    </span>
                  ) : null}
                </span>
                <span className="sr-only">
                  {document.isRequired ? "Required. " : ""}
                  {isAdded ? "Added" : "Not added yet"}
                </span>
                {document.mustShow.length > 0 ? (
                  <InfoTip label={`What the ${document.label.toLowerCase()} must show`}>
                    <p className="font-medium">It must show</p>
                    <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                      {document.mustShow.map((item) => (
                        <li key={item}>{sentenceCase(item)}</li>
                      ))}
                    </ul>
                  </InfoTip>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {missing.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Still needed: {listNames(missing.map((status) => status.document.label.toLowerCase()))}. If one is inside
          another file, mark that file as other or several documents.
        </p>
      ) : null}
    </div>
  )
}
