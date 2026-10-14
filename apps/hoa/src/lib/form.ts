import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

const { fieldContext, formContext } = createFormHookContexts()

/** TanStack Form, with field groups: fields more than one form shares, such as a unit's address, written once. */
export const { useAppForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {}
})
