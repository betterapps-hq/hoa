import type { MouseEvent } from "react"

/** A click that follows a link where it is: not a middle-click or one with a modifier, which opens a new tab or window. */
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
