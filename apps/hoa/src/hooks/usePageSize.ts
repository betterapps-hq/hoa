import { useLocalStorage } from "@mantine/hooks"

/** The page sizes a list offers, besides its own default. */
const pageSizeChoices = [10, 25, 50, 100]

/**
 * How many rows a page of a list shows: its default until the viewer picks another, remembered per list in this
 * browser (Mantine's storage hook tolerates storage that's missing or blocked, and reads it after hydration).
 */
export function usePageSize(list: string, defaultSize: number) {
  const [stored, setStored] = useLocalStorage<number>({ key: `page-size:${list}`, defaultValue: defaultSize })
  const choices = [...new Set([...pageSizeChoices, defaultSize])].toSorted((a, b) => a - b)
  return { pageSize: choices.includes(stored) ? stored : defaultSize, choices, setPageSize: setStored }
}
