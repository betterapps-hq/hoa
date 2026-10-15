import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

const { fieldContext, formContext } = createFormHookContexts()

/** TanStack Form, with field groups: fields more than one form shares, such as a unit's address, written once. */
export const { useAppForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {},
  formComponents: {}
})

/**
 * Saves a dialog's form, then closes the dialog. A save that fails has already said why, in a toast, and throws to keep
 * the dialog open for another try; its error stops here instead of going unhandled.
 */
export async function saveThenClose(save: () => Promise<unknown>, close: () => void) {
  try {
    await save()
  } catch {
    return
  }
  close()
}
