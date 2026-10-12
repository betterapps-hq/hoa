/** Text read as JSON, or why it isn't JSON. */
export function parseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null }
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "That isn't JSON." }
  }
}
