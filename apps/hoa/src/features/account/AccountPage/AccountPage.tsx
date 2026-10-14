import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { AccountDetails } from "../account.functions"

/** Changing the account, each throwing an Error that says what went wrong. */
export type AccountActions = {
  rename: (name: string) => Promise<void>
  addPassword: (password: string) => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  connectGoogle: () => Promise<void>
  disconnectGoogle: (accountId: string) => Promise<void>
  signOutElsewhere: () => Promise<void>
}

const nameSchema = z.object({ name: z.string().trim().min(1, "Give your name.").max(200) })
const newPassword = z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters.")

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/** The signed-in person's account (docs/design/people.md): their name, how they sign in, and their other sessions. */
export function AccountPage({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <NameCard account={account} actions={actions} />
      <SignInCard account={account} actions={actions} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Other devices</h2>
          </CardTitle>
          <CardDescription>Sign out everywhere but here, such as on a computer you no longer use.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() =>
              void actions
                .signOutElsewhere()
                .then(() => toast.success("Signed out on your other devices."))
                .catch((caught: unknown) => toast.error(messageOf(caught)))
            }
          >
            Sign out on other devices
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function NameCard({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  const form = useForm({
    defaultValues: { name: account.name },
    validators: { onSubmit: nameSchema },
    onSubmit: async ({ value }) => {
      try {
        await actions.rename(value.name.trim())
        toast.success("Name saved.")
      } catch (caught) {
        toast.error(messageOf(caught))
      }
    }
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>You</h2>
        </CardTitle>
        <CardDescription>
          You sign in as <span className="font-medium text-foreground">{account.email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup className="max-w-md">
            <form.Field name="name">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="account-name">Name</FieldLabel>
                  <Input
                    id="account-name"
                    autoComplete="name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => [state.isSubmitting, state.isDefaultValue] as const}>
              {([isSubmitting, isDefault]) => (
                <Button type="submit" className="self-start" disabled={isSubmitting || isDefault}>
                  Save
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function SignInCard({ account, actions }: { account: AccountDetails; actions: AccountActions }) {
  const [isEditingPassword, setEditingPassword] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>How you sign in</h2>
        </CardTitle>
        <CardDescription>A code by email always works. A password or Google is quicker.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Code by email</ItemTitle>
            <ItemDescription>We send a 6-digit code to {account.email}.</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant="secondary">On</Badge>
          </ItemActions>
        </Item>
        <Item variant="outline" className="flex-wrap">
          <ItemContent>
            <ItemTitle>Password</ItemTitle>
            <ItemDescription>{account.hasPassword ? "Set." : "Not set."}</ItemDescription>
          </ItemContent>
          {isEditingPassword ? null : (
            <ItemActions>
              <Button variant="outline" size="sm" onClick={() => setEditingPassword(true)}>
                {account.hasPassword ? "Change password" : "Add a password"}
              </Button>
            </ItemActions>
          )}
          {isEditingPassword ? (
            <PasswordForm
              hasPassword={account.hasPassword}
              actions={actions}
              onDone={() => setEditingPassword(false)}
            />
          ) : null}
        </Item>
        {account.isGoogleConfigured || account.googleAccountId ? (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Google</ItemTitle>
              <ItemDescription>
                {account.googleAccountId ? "Connected." : "Sign in with the Google account for this email."}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const google = account.googleAccountId
                  void (google ? actions.disconnectGoogle(google) : actions.connectGoogle()).catch((caught: unknown) =>
                    toast.error(messageOf(caught))
                  )
                }}
              >
                {account.googleAccountId ? "Disconnect" : "Connect Google"}
              </Button>
            </ItemActions>
          </Item>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PasswordForm({
  hasPassword,
  actions,
  onDone
}: {
  hasPassword: boolean
  actions: AccountActions
  onDone: () => void
}) {
  const schema = z.object({
    current: hasPassword ? z.string().min(1, "Give your current password.") : z.string(),
    next: newPassword
  })
  const form = useForm({
    defaultValues: { current: "", next: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      try {
        if (hasPassword) {
          await actions.changePassword(value.current, value.next)
        } else {
          await actions.addPassword(value.next)
        }
        toast.success(hasPassword ? "Password changed." : "Password added.")
        onDone()
      } catch (caught) {
        toast.error(messageOf(caught))
      }
    }
  })
  return (
    <form
      noValidate
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="max-w-md pt-2">
        {hasPassword ? (
          <form.Field name="current">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        ) : null}
        <form.Field name="next">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor="next-password">{hasPassword ? "New password" : "Password"}</FieldLabel>
              <Input
                id="next-password"
                type="password"
                autoComplete="new-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
              />
              <FieldDescription>At least 10 characters.</FieldDescription>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <div className="flex gap-2">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {hasPassword ? "Change password" : "Add password"}
              </Button>
            )}
          </form.Subscribe>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
