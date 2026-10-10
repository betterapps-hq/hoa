/**
 * Display text in sentence case: the first letter capitalized and the rest as written, so names and acronyms keep
 * their case ("front" becomes "Front", "CC&Rs amendment" stays as is). For rendering only; stored labels keep their
 * case (docs/ux.md).
 */
export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
