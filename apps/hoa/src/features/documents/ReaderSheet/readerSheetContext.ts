import { createContext, useContext } from "react"

/** Opens a reader URL in the sheet; false when the URL isn't the reader's. */
export type ReaderSheetValue = { open: (href: string) => boolean }

export const ReaderSheetContext = createContext<ReaderSheetValue | null>(null)

/** The sheet citations open in here, or null where they open the reader's page. */
export const useReaderSheet = () => useContext(ReaderSheetContext)
