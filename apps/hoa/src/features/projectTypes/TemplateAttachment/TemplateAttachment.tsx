import { DownloadIcon, XIcon } from "lucide-react"
import { FileTypeMedia } from "@/components/FileTypeMedia/FileTypeMedia"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle
} from "@/components/ui/attachment"
import { buttonVariants } from "@/components/ui/button"
import { fileSizeText } from "@/lib/text"
import type { DocumentTemplate } from "@/projectTypes/projectType"
import { templateHref } from "../uploadTemplate"

export type TemplateAttachmentProps = {
  projectTypeId: string
  template: DocumentTemplate
  /** Takes the template off the document. */
  onRemove?: () => void
  /** While a new template uploads: how far it's got, in words. */
  progress?: string | null
  size?: "default" | "sm"
}

/** A document's template as an attached file: its type, name and size, to download, and to remove where it's kept. */
export function TemplateAttachment({
  projectTypeId,
  template,
  onRemove,
  progress = null,
  size = "default"
}: TemplateAttachmentProps) {
  const isBusy = progress !== null
  return (
    <Attachment size={size} className="max-w-full">
      <FileTypeMedia fileName={template.fileName} mediaType={template.mediaType} />
      <AttachmentContent>
        <AttachmentTitle title={template.fileName}>{template.fileName}</AttachmentTitle>
        <AttachmentDescription>{progress ?? `Template, ${fileSizeText(template.sizeBytes)}`}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <a
          className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
          href={templateHref(projectTypeId, template)}
          download
          aria-label={`Download ${template.fileName}`}
          title="Download"
        >
          <DownloadIcon aria-hidden />
        </a>
        {onRemove ? (
          <AttachmentAction
            type="button"
            disabled={isBusy}
            aria-label={`Remove ${template.fileName}`}
            title="Remove"
            onClick={onRemove}
          >
            <XIcon />
          </AttachmentAction>
        ) : null}
      </AttachmentActions>
    </Attachment>
  )
}
