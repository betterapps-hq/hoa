import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { useId, useState } from "react"
import { match } from "ts-pattern"
import { FilePicker } from "@/components/FilePicker"
import { Notice } from "@/components/Notice"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { acceptedTypes } from "@/documents/uploads"
import type { Rule, Rulebook } from "@/rules/rules"
import { PublishedRulebook } from "../PublishedRulebook/PublishedRulebook"
import type { ExtractRulesResult } from "../rulebook.functions"
import { RulebookEditor } from "../RulebookEditor/RulebookEditor"

export type RulebookPageProps = {
  rulebook: Rulebook | null
  onExtract: (formData: FormData) => Promise<ExtractRulesResult>
  onPublish: (input: { hoaName: string; documents: string[]; rules: Rule[] }) => Promise<Rulebook>
}

type Extracted = Extract<ExtractRulesResult, { status: "succeeded" }>
type PageState =
  | { step: "published"; rulebook: Rulebook; isNew: boolean }
  | { step: "upload"; error?: string }
  | { step: "extracting" }
  | { step: "review"; extracted: Extracted }

export function RulebookPage({ rulebook, onExtract, onPublish }: RulebookPageProps) {
  const [state, setState] = useState<PageState>(
    rulebook ? { step: "published", rulebook, isNew: false } : { step: "upload" }
  )
  const [hoaName, setHoaName] = useState(rulebook?.hoaName ?? "")
  const [documents, setDocuments] = useState<File[]>([])
  const nameId = useId()

  async function handleExtract() {
    const formData = new FormData()
    formData.set("hoaName", hoaName)
    documents.forEach((document) => formData.append("documents", document))
    setState({ step: "extracting" })
    try {
      const result = await onExtract(formData)
      setState(
        match(result)
          .returnType<PageState>()
          .with({ status: "succeeded" }, (extracted) => ({ step: "review", extracted }))
          .with({ status: "not-configured" }, ({ missing }) => ({
            step: "upload",
            error: `Add ${missing.join(" and ")} to apps/hoa/.env, then restart the dev server.`
          }))
          .with({ status: "failed" }, ({ message }) => ({ step: "upload", error: message }))
          .exhaustive()
      )
    } catch (error) {
      setState({ step: "upload", error: error instanceof Error ? error.message : "The rules couldn't be extracted." })
    }
  }

  return match(state)
    .with({ step: "published" }, ({ rulebook: published, isNew }) => (
      <div className="space-y-6">
        {isNew && (
          <Notice tone="success">
            The rulebook is published. Homeowners can now{" "}
            <Link to="/submit" className="underline">
              submit projects
            </Link>{" "}
            for review.
          </Notice>
        )}
        <PublishedRulebook rulebook={published} />
        <Button variant="outline" onClick={() => setState({ step: "upload" })}>
          Replace the rulebook
        </Button>
      </div>
    ))
    .with({ step: "upload" }, { step: "extracting" }, (current) => {
      const isExtracting = current.step === "extracting"
      return (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>
              <h2>Upload governing documents</h2>
            </CardTitle>
            <CardDescription>
              Add the declaration (CC&amp;Rs), design guidelines and any other rules the committee applies. The
              assistant reads every page, including scanned pages and drawings, and proposes rules for you to approve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void handleExtract()
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={nameId}>HOA name</FieldLabel>
                  <Input
                    id={nameId}
                    value={hoaName}
                    disabled={isExtracting}
                    onChange={(event) => setHoaName(event.target.value)}
                  />
                </Field>
                <FilePicker
                  label="Documents"
                  hint="PDF files, up to 30 MB each."
                  accept={acceptedTypes.governingDocuments}
                  files={documents}
                  onChange={setDocuments}
                  disabled={isExtracting}
                />
                {current.step === "upload" && current.error && <Notice tone="danger">{current.error}</Notice>}
                {isExtracting && (
                  <Notice tone="info">
                    Reading {documents.length} {documents.length === 1 ? "document" : "documents"} and extracting rules.
                    This can take a few minutes for long or scanned documents.
                  </Notice>
                )}
                <div>
                  <Button type="submit" disabled={isExtracting || !hoaName.trim() || documents.length === 0}>
                    {isExtracting && <Loader2Icon className="animate-spin" />}
                    {isExtracting ? "Extracting rules" : "Extract rules"}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )
    })
    .with({ step: "review" }, ({ extracted }) => (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Review the extracted rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {extracted.rules.length} rules found in {extracted.documents.join(", ")}. Check each rule against its
            source, correct anything that&apos;s wrong, and approve the ones the committee applies.
          </p>
        </div>
        <RulebookEditor
          hoaName={extracted.hoaName}
          documents={extracted.documents}
          rules={extracted.rules}
          onPublish={async (rules) => {
            const published = await onPublish({ hoaName: extracted.hoaName, documents: extracted.documents, rules })
            setState({ step: "published", rulebook: published, isNew: true })
          }}
        />
      </div>
    ))
    .exhaustive()
}
