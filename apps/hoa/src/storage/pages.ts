import { pageSchema, type Page } from "@/ocr/page"
import { getJson, type ObjectBucket } from "./objects"

/** A file's page records, in order; pages missing from storage are left out. */
export async function loadPages(
  bucket: ObjectBucket,
  keys: { page: (pageIndex: number) => string },
  pageCount: number
): Promise<Page[]> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => getJson(bucket, keys.page(index + 1), pageSchema))
  )
  return pages.filter((page): page is Page => page !== null)
}
