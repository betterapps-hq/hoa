import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { answerSections, emptyAnswers } from "@/projectTypes/answers"
import type { ProjectAnswers } from "@/projectTypes/projectType"
import type { OfferedProjectType } from "../../projectTypes/offeredTypes"
import { ProjectForm } from "../../projectTypes/ProjectForm/ProjectForm"

// What the homeowner says about the project (application-review.md, Applications): a description in their own words and
// the answers to the project type's questions, edited in place while the application can change and read as given
// otherwise.

/** What a draft keeps as the homeowner writes: the description, and the answers when the project has a type. */
export type DraftContent = { description: string; answers: ProjectAnswers | null }

export type ApplicationFormProps = {
  projectType: OfferedProjectType | null
  value: DraftContent
  onChange: (value: DraftContent) => void
  /** After an attempt to run the review: every answer's problems, not only those of questions left. */
  showsAllErrors: boolean
}

/** The description and the project type's questions, each change kept as it's made. */
export function ApplicationForm({ projectType, value, onChange, showsAllErrors }: ApplicationFormProps) {
  return (
    <FieldGroup className="gap-8">
      <Field>
        <FieldLabel htmlFor="application-description">Describe your project</FieldLabel>
        <Textarea
          id="application-description"
          placeholder="What you plan to do, and where on your property"
          maxLength={4000}
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </Field>
      {projectType && projectType.definition.groups.length > 0 ? (
        <>
          <FieldSeparator />
          <ProjectForm
            key={projectType.id}
            definition={projectType.definition}
            value={value.answers ?? emptyAnswers(projectType.definition)}
            onChange={(answers) => onChange({ ...value, answers })}
            showsAllErrors={showsAllErrors}
            reasons={projectType.reasons}
          />
        </>
      ) : null}
    </FieldGroup>
  )
}

export type ApplicationAnswersProps = {
  projectType: OfferedProjectType | null
  description: string | null
  answers: ProjectAnswers | null
}

/**
 * The description and the answers as the homeowner gave them, one line each under what they describe; an answer given
 * once for every item shows once.
 */
export function ApplicationAnswers({ projectType, description, answers }: ApplicationAnswersProps) {
  const items = projectType && answers ? answerSections(projectType.definition, answers) : []
  if (!description && items.length === 0) {
    return <p className="text-sm text-muted-foreground">No description or answers.</p>
  }
  return (
    <div className="flex max-w-prose flex-col gap-6">
      {description ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">Description</h3>
          <p className="text-pretty whitespace-pre-line text-muted-foreground">{description}</p>
        </section>
      ) : null}
      {items.map((item) => (
        <section key={item.key} className="flex flex-col gap-1.5">
          <h3 className="font-medium">{item.heading}</h3>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {item.lines.map((line) => (
              <li key={line.key}>{line.line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
