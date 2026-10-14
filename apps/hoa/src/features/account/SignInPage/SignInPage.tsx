import { useForm } from "@tanstack/react-form"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useState, type ReactNode } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

/** Signing in, each throwing an Error that says what went wrong in words someone can act on. */
export type SignInActions = {
  sendCode: (email: string) => Promise<void>
  signInWithCode: (email: string, code: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  sendResetCode: (email: string) => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  /** Null when Google isn't set up here. */
  continueWithGoogle: (() => Promise<void>) | null
}

type Step = "email" | "code" | "password" | "reset"

const emailSchema = z.object({ email: z.email("Give an email address such as name@example.com.") })
const passwordSchema = z.object({
  email: z.email("Give an email address such as name@example.com."),
  password: z.string().min(1, "Give your password.")
})
const resetSchema = z.object({
  code: z.string().length(6, "Enter the 6-digit code from the email."),
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters.")
})

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/**
 * Moves focus to a step's first field when the step appears, after the person asked for it (sent a code, chose a
 * password). Stable, so React calls it once per mount rather than on every render.
 */
const focusOnMount = (element: HTMLInputElement | null) => element?.focus()

/**
 * Signing in (docs/design/people.md): an email and a code sent to it by default, a password for those who set one, and
 * Google when it's set up. A first sign-in with a code makes the account.
 */
export function SignInPage({ actions }: { actions: SignInActions }) {
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {step === "email" ? (
          <EmailStep
            email={email}
            actions={actions}
            onCodeSent={(next) => {
              setEmail(next)
              setStep("code")
            }}
            onPassword={(next) => {
              setEmail(next)
              setStep("password")
            }}
          />
        ) : null}
        {step === "code" ? <CodeStep email={email} actions={actions} onBack={() => setStep("email")} /> : null}
        {step === "password" ? (
          <PasswordStep
            email={email}
            actions={actions}
            onCode={(next) => {
              setEmail(next)
              setStep("email")
            }}
            onForgot={(next) => {
              setEmail(next)
              setStep("reset")
            }}
          />
        ) : null}
        {step === "reset" ? <ResetStep email={email} actions={actions} onBack={() => setStep("password")} /> : null}
      </div>
    </div>
  )
}

function Panel({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function EmailStep({
  email,
  actions,
  onCodeSent,
  onPassword
}: {
  email: string
  actions: SignInActions
  onCodeSent: (email: string) => void
  onPassword: (email: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email },
    validators: { onSubmit: emailSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await actions.sendCode(value.email.trim())
        onCodeSent(value.email.trim())
      } catch (caught) {
        setError(messageOf(caught))
      }
    }
  })
  const google = actions.continueWithGoogle
  return (
    <Panel title="Sign in" description="Use the email your association has for you.">
      <FieldGroup>
        {google ? (
          <>
            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={() => void google().catch((caught: unknown) => setError(messageOf(caught)))}
              >
                <GoogleMark />
                Continue with Google
              </Button>
            </Field>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">Or</FieldSeparator>
          </>
        ) : null}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="email">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                  <Input
                    id="sign-in-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <Field>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Sending a code" : "Email me a code"}
                  </Button>
                )}
              </form.Subscribe>
              <Button
                type="button"
                variant="link"
                className="text-muted-foreground"
                onClick={() => onPassword(form.state.values.email.trim())}
              >
                Use a password instead
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </FieldGroup>
    </Panel>
  )
}

function CodeStep({ email, actions, onBack }: { email: string; actions: SignInActions; onBack: () => void }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isBusy, setBusy] = useState(false)
  const submit = async (value: string) => {
    if (value.length !== 6) {
      setError("Enter the 6-digit code from the email.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await actions.signInWithCode(email, value)
    } catch (caught) {
      setError(messageOf(caught))
      setBusy(false)
    }
  }
  const resend = async () => {
    setError(null)
    try {
      await actions.sendCode(email)
      setCode("")
      setNotice("We sent a new code.")
    } catch (caught) {
      setError(messageOf(caught))
    }
  }
  return (
    <Panel
      title="Check your email"
      description={
        <>
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit(code)
        }}
      >
        <FieldGroup>
          <Field data-invalid={error !== null} className="items-center">
            <FieldLabel htmlFor="sign-in-code" className="sr-only">
              Code
            </FieldLabel>
            <InputOTP
              id="sign-in-code"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              ref={focusOnMount}
              autoComplete="one-time-code"
              value={code}
              onChange={(value) => {
                setCode(value)
                setNotice(null)
              }}
              onComplete={(value: string) => void submit(value)}
              disabled={isBusy}
              aria-invalid={error !== null}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error ? <FieldError>{error}</FieldError> : null}
            {notice ? <FieldDescription>{notice}</FieldDescription> : null}
          </Field>
          <Field>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Signing in" : "Sign in"}
            </Button>
            <FieldDescription className="text-center">
              No email?{" "}
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => void resend()}>
                Send a new code
              </Button>{" "}
              or{" "}
              <Button type="button" variant="link" className="h-auto p-0" onClick={onBack}>
                use another email
              </Button>
              .
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </Panel>
  )
}

function PasswordStep({
  email,
  actions,
  onCode,
  onForgot
}: {
  email: string
  actions: SignInActions
  onCode: (email: string) => void
  onForgot: (email: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email, password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await actions.signInWithPassword(value.email.trim(), value.password)
      } catch (caught) {
        setError(messageOf(caught))
      }
    }
  })
  const forgot = async () => {
    const parsed = emailSchema.safeParse({ email: form.state.values.email.trim() })
    if (!parsed.success) {
      setError("Give your email first, so we can send you a code.")
      return
    }
    setError(null)
    try {
      await actions.sendResetCode(parsed.data.email)
      onForgot(parsed.data.email)
    } catch (caught) {
      setError(messageOf(caught))
    }
  }
  return (
    <Panel title="Sign in with a password" description="For accounts that have set one.">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="password-email">Email</FieldLabel>
                <Input
                  id="password-email"
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Button
                    type="button"
                    variant="link"
                    className="ml-auto h-auto p-0 text-sm"
                    onClick={() => void forgot()}
                  >
                    Forgot your password?
                  </Button>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  ref={email === "" ? undefined : focusOnMount}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in" : "Sign in"}
                </Button>
              )}
            </form.Subscribe>
            <Button
              type="button"
              variant="link"
              className="text-muted-foreground"
              onClick={() => onCode(form.state.values.email.trim())}
            >
              Email me a code instead
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </Panel>
  )
}

function ResetStep({ email, actions, onBack }: { email: string; actions: SignInActions; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { code: "", password: "" },
    validators: { onSubmit: resetSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await actions.resetPassword(email, value.code, value.password)
      } catch (caught) {
        setError(messageOf(caught))
      }
    }
  })
  return (
    <Panel
      title="Choose a new password"
      description={
        <>
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="code">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="reset-code">Code</FieldLabel>
                <InputOTP
                  id="reset-code"
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS}
                  ref={focusOnMount}
                  autoComplete="one-time-code"
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
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
          {error ? <FieldError>{error}</FieldError> : null}
          <Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving" : "Save and sign in"}
                </Button>
              )}
            </form.Subscribe>
            <Button type="button" variant="link" className="text-muted-foreground" onClick={onBack}>
              Back
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </Panel>
  )
}

/** Google's "G", as its sign-in buttons show it. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
