import { ImageUpIcon, Trash2Icon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { DangerDialog } from "@/components/DangerDialog/DangerDialog"
import { OrganizationAvatar } from "@/components/OrganizationAvatar/OrganizationAvatar"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AddressFields } from "@/features/people/AddressFields/AddressFields"
import { ChoiceSelect } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { attempt } from "@/lib/attempt"
import { useAppForm } from "@/lib/form"
import {
  logoMaxBytes,
  logoTypes,
  organizationDetailsSchema,
  settingsInputSchema,
  unitSystemLabels,
  unitSystems,
  type OrganizationDetailsInput,
  type OrganizationSettings
} from "@/organization/organization"
import { addressValues, type Address } from "@/places/address"

/** The association as its settings page shows it. */
export type SettingsData = {
  id: string
  name: string
  logo: string | null
  address: Address
  settings: OrganizationSettings
}

/** Changing the association, each throwing an Error that says what went wrong. */
export type SettingsActions = {
  saveDetails: (details: OrganizationDetailsInput) => Promise<void>
  saveSettings: (settings: OrganizationSettings) => Promise<void>
  uploadLogo: (file: File) => Promise<void>
  removeLogo: () => Promise<void>
  deleteAssociation: (name: string) => Promise<void>
}

const unitSystemChoices = unitSystems.map((value) => ({ value, label: unitSystemLabels[value] }))

/**
 * The association's settings (docs/design/people.md, Settings): its name, logo and mailing address, how forms measure
 * and how long applications are kept, and deleting it. What its documents say is the rulebook's settings.
 */
export function SettingsPage({ association, actions }: { association: SettingsData; actions: SettingsActions }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 lg:px-6">
      <DetailsCard association={association} actions={actions} />
      <ApplicationsCard settings={association.settings} actions={actions} />
      <DeleteCard name={association.name} actions={actions} />
    </div>
  )
}

function SaveFooter({ children }: { children: ReactNode }) {
  return <CardFooter className="justify-end border-t">{children}</CardFooter>
}

function DetailsCard({ association, actions }: { association: SettingsData; actions: SettingsActions }) {
  const form = useAppForm({
    defaultValues: { name: association.name, address: addressValues(association.address) },
    validators: { onSubmit: organizationDetailsSchema },
    onSubmit: ({ value }) => attempt(() => actions.saveDetails(value), "Saved.").catch(() => undefined)
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Association</h2>
        </CardTitle>
        <CardDescription>Its name, logo and mailing address.</CardDescription>
      </CardHeader>
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <CardContent>
          <FieldGroup className="gap-6">
            <LogoField association={association} actions={actions} />
            <form.Field name="name">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="association-name">
                    Name
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="association-name"
                    required
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <AddressFields form={form} fields="address" idPrefix="association" onAddressChange={(change) => change()} />
          </FieldGroup>
        </CardContent>
        <SaveFooter>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
            )}
          </form.Subscribe>
        </SaveFooter>
      </form>
    </Card>
  )
}

/** The logo, shown as the sidebar shows it, with a way to upload another or take it off. */
function LogoField({ association, actions }: { association: SettingsData; actions: SettingsActions }) {
  const input = useRef<HTMLInputElement>(null)
  const [isWorking, setWorking] = useState(false)
  const run = async (action: () => Promise<void>, done: string) => {
    setWorking(true)
    await attempt(action, done).catch(() => undefined)
    setWorking(false)
  }
  return (
    <Field>
      <FieldLabel htmlFor="association-logo">Logo</FieldLabel>
      <div className="flex flex-wrap items-center gap-4">
        <OrganizationAvatar organization={association} className="size-16 text-lg" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isWorking} onClick={() => input.current?.click()}>
            <ImageUpIcon />
            {association.logo ? "Replace" : "Upload"}
          </Button>
          {association.logo ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isWorking}
              onClick={() => void run(actions.removeLogo, "Logo removed.")}
            >
              <Trash2Icon />
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={input}
          id="association-logo"
          type="file"
          accept={logoTypes.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) {
              return
            }
            if (file.size > logoMaxBytes) {
              toast.error("Use an image of 1 MB or less.")
              return
            }
            void run(() => actions.uploadLogo(file), "Logo saved.")
          }}
        />
      </div>
      <FieldDescription>A square PNG, JPEG or WebP image, up to 1 MB. Without one, its initials show.</FieldDescription>
    </Field>
  )
}

function ApplicationsCard({ settings, actions }: { settings: OrganizationSettings; actions: SettingsActions }) {
  const form = useAppForm({
    defaultValues: settings,
    validators: { onSubmit: settingsInputSchema },
    onSubmit: ({ value }) => attempt(() => actions.saveSettings(value), "Saved.").catch(() => undefined)
  })
  const days = (name: "retentionDays" | "draftRetentionDays", label: string, description: string) => (
    <form.Field name={name}>
      {(field) => (
        <Field data-invalid={field.state.meta.errors.length > 0}>
          <FieldLabel htmlFor={`settings-${name}`}>{label}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`settings-${name}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              className="w-28"
              value={Number.isNaN(field.state.value) ? "" : field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.valueAsNumber)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          <FieldDescription>{description}</FieldDescription>
          <FieldError errors={field.state.meta.errors} />
        </Field>
      )}
    </form.Field>
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Applications</h2>
        </CardTitle>
        <CardDescription>How forms measure, and how long applications are kept.</CardDescription>
      </CardHeader>
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <CardContent>
          <FieldGroup className="gap-6">
            <form.Field name="unitSystem">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="settings-unitSystem">Measure in</FieldLabel>
                  <ChoiceSelect
                    id="settings-unitSystem"
                    className="w-52"
                    value={field.state.value}
                    choices={unitSystemChoices}
                    onChange={field.handleChange}
                  />
                </Field>
              )}
            </form.Field>
            {days("retentionDays", "Keep decided applications", "Counted from the committee's last decision.")}
            {days("draftRetentionDays", "Keep unsent drafts", "Counted from the draft's last change.")}
          </FieldGroup>
        </CardContent>
        <SaveFooter>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
            )}
          </form.Subscribe>
        </SaveFooter>
      </form>
    </Card>
  )
}

function DeleteCard({ name, actions }: { name: string; actions: SettingsActions }) {
  const [isDeleting, setDeleting] = useState(false)
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>
          <h2>Delete association</h2>
        </CardTitle>
        <CardDescription>
          Deletes its people, units, committees, documents, rulebook and applications, and everyone’s access to it. This
          can’t be undone.
        </CardDescription>
      </CardHeader>
      <SaveFooter>
        <Button variant="destructive" onClick={() => setDeleting(true)}>
          Delete association
        </Button>
      </SaveFooter>
      {isDeleting ? (
        <DangerDialog
          title={`Delete ${name}?`}
          description="Everything it keeps is deleted for good, and nobody can open it again."
          typeToConfirm={name}
          confirmLabel="Delete association"
          onConfirm={() => attempt(() => actions.deleteAssociation(name), "Association deleted.")}
          onOpenChange={setDeleting}
        />
      ) : null}
    </Card>
  )
}
