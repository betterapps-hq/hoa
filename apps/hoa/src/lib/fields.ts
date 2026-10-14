import { z } from "zod"

/** Text a form may leave empty: trimmed, at most `max` characters, and null when empty. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === "" ? null : text))
