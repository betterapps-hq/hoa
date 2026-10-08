import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { useId, useState } from "react"
import { match } from "ts-pattern"
import { FilePicker } from "@/components/FilePicker"
import { Notice } from "@/components/Notice"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { acceptedTypes } from "@/documents/uploads"
import { projectTypes, type ProjectTypeId } from "@/rules/rules"
import type { ReviewProjectResult } from "../review.functions"
import { ReviewResult } from "../ReviewResult/ReviewResult"

export type SubmitProjectPageProps = {
  hoaName: string | undefined
  onSubmit: (formData: FormData) => Promise<ReviewProjectResult>
}

type PageState =
  | { step: "form"; error?: string }
  | { step: "reviewing" }
  | { step: "result"; result: ReviewProjectResult }

export function SubmitProjectPage({ hoaName, onSubmit }: SubmitProjectPageProps) {
  const [state, setState] = useState<PageState>({ step: "form" })
  const [projectType, setProjectType] = useState<ProjectTypeId>("fence")
  const [description, setDescription] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const typeId = useId()
  const descriptionId = useId()

  if (!hoaName) {
    return (
      <Notice tone="info">
        The HOA hasn&apos;t published its rulebook yet. An HOA representative needs to{" "}
        <Link to="/rules" className="underline">
          upload and approve the rules
        </Link>{" "}
        before projects can be reviewed.
      </Notice>
    )
  }

  async function handleSubmit() {
    const formData = new FormData()
    formData.set("projectType", projectType)
    formData.set("description", description)
    files.forEach((file) => formData.append("files", file))
    setState({ step: "reviewing" })
    try {
      setState({ step: "result", result: await onSubmit(formData) })
    } catch (error) {
      setState({ step: "form", error: error instanceof Error ? error.message : "The project couldn't be reviewed." })
    }
  }

  if (state.step === "result") {
    return (
      <div className="space-y-6">
        {match(state.result)
          .with({ status: "succeeded" }, (result) => <ReviewResult {...result} />)
          .with({ status: "no-rulebook" }, () => (
            <Notice tone="warning">The rulebook has no rules for this project type yet.</Notice>
          ))
          .with({ status: "not-configured" }, ({ missing }) => (
            <Notice tone="danger">Add {missing.join(" and ")} to apps/hoa/.env, then restart the dev server.</Notice>
          ))
          .with({ status: "failed" }, ({ message }) => (
            <Notice tone="danger">The project couldn&apos;t be reviewed: {message}</Notice>
          ))
          .exhaustive()}
        <Button variant="outline" onClick={() => setState({ step: "form" })}>
          Submit another project
        </Button>
      </div>
    )
  }

  const isReviewing = state.step === "reviewing"
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h2>Submit a project to {hoaName}</h2>
        </CardTitle>
        <CardDescription>
          Upload your application packet. The assistant checks it against the community&apos;s approved rules and
          recommends a decision for the Design Review Committee.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={typeId}>Project type</FieldLabel>
              <NativeSelect
                id={typeId}
                className="w-full"
                value={projectType}
                disabled={isReviewing}
                onChange={(event) => {
                  const selected = projectTypes.find((type) => type.id === event.target.value)
                  if (selected) {
                    setProjectType(selected.id)
                  }
                }}
              >
                {projectTypes.map((type) => (
                  <NativeSelectOption key={type.id} value={type.id}>
                    {type.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={descriptionId}>Description (optional)</FieldLabel>
              <Textarea
                id={descriptionId}
                rows={3}
                value={description}
                disabled={isReviewing}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <FilePicker
              label="Application files"
              hint="The application form, drawings, plot plan, photos and product sheets. PDF, Word or image files, up to 30 MB each."
              accept={acceptedTypes.application}
              files={files}
              onChange={setFiles}
              disabled={isReviewing}
            />
            {state.step === "form" && state.error && <Notice tone="danger">{state.error}</Notice>}
            {isReviewing && (
              <Notice tone="info">Reviewing your application against the rules. This takes about a minute.</Notice>
            )}
            <div>
              <Button type="submit" disabled={isReviewing || files.length === 0}>
                {isReviewing && <Loader2Icon className="animate-spin" />}
                {isReviewing ? "Reviewing" : "Submit for review"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
