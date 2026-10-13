import { describe, expect, it, vi } from "vitest"
import {
  applicationKeys,
  extensionOf,
  governingKeys,
  hoaCacheKey,
  jobOutputKey,
  jobOutputPrefix,
  projectTypeKeys,
  rulebookBuildKeys,
  rulebookKeys
} from "./keys"
import { createObjectPromptCache, getJson, putJson, toHex, type ObjectBucket } from "./objects"
import { createPresigner } from "./presign"
import { acceptedTypes, uploadHint, validateUpload } from "./uploadRules"

const megabyte = 1024 * 1024

describe("validateUpload", () => {
  it("accepts PDF and Word for governing documents, and images only for applications", () => {
    expect(validateUpload({ name: "ccrs.pdf", type: "application/pdf", size: 10 * megabyte }, "governing")).toEqual({
      isValid: true,
      upload: { format: "pdf", mediaType: "application/pdf" }
    })
    expect(validateUpload({ name: "gate.JPG", type: "", size: megabyte }, "application")).toEqual({
      isValid: true,
      upload: { format: "image", mediaType: "image/jpeg" }
    })
    expect(validateUpload({ name: "plan.png", type: "image/png", size: megabyte }, "governing")).toMatchObject({
      isValid: false,
      message: "plan.png isn't a PDF or Word file. Save it as a PDF."
    })
  })

  it("refuses formats the review model can't read, oversized and empty files", () => {
    expect(validateUpload({ name: "IMG_0001.HEIC", type: "image/heic", size: megabyte }, "application")).toMatchObject({
      message: "IMG_0001.HEIC isn't a PDF, Word, JPEG or PNG file. Save photos as JPEG or PNG."
    })
    expect(validateUpload({ name: "notes.txt", type: "text/plain", size: 10 }, "application")).toMatchObject({
      message: "notes.txt isn't a PDF, Word, JPEG or PNG file."
    })
    expect(validateUpload({ name: "big.jpg", type: "image/jpeg", size: 6 * megabyte }, "application")).toMatchObject({
      message: "big.jpg is larger than 5 MB."
    })
    expect(validateUpload({ name: "empty.pdf", type: "application/pdf", size: 0 }, "application")).toMatchObject({
      message: "empty.pdf is empty."
    })
  })
})

describe("acceptedTypes and uploadHint", () => {
  it("say what each target takes, from the same rules validateUpload checks", () => {
    expect(acceptedTypes("governing")).toEqual({
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"]
    })
    expect(acceptedTypes("application")["image/png"]).toEqual([".png", ".jpg", ".jpeg"])
    expect(uploadHint("governing")).toBe("PDF or Word up to 50 MB.")
    expect(uploadHint("application")).toBe("PDF or Word up to 25 MB, JPEG or PNG up to 5 MB.")
    expect(uploadHint("template")).toBe("PDF or Word up to 10 MB.")
    expect(validateUpload({ name: "form.png", type: "image/png", size: 10 }, "template")).toMatchObject({
      message: "form.png isn't a PDF or Word file. Save it as a PDF."
    })
  })
})

describe("keys", () => {
  it("builds the object layout from record ids", () => {
    const governing = governingKeys("hoa", "doc")
    expect(governing.source("Guidelines.PDF")).toBe("hoas/hoa/governing/doc/source.pdf")
    expect(governing.page(3)).toBe("hoas/hoa/governing/doc/pages/3.json")
    expect(governing.ocr("azure-layout", "1-50")).toBe("hoas/hoa/governing/doc/ocr/azure-layout/1-50.json")
    expect(governing.layout()).toBe("hoas/hoa/governing/doc/layout.json")
    expect(governing.figureImage("16.1")).toBe("hoas/hoa/governing/doc/figures/16.1.png")
    expect(governing.figureDescription("16.1")).toBe("hoas/hoa/governing/doc/figures/16.1.json")
    expect(governing.sectionText("doc:4")).toBe("hoas/hoa/governing/doc/sections/doc:4.md")

    const application = applicationKeys("hoa", "app")
    expect(application.root).toBe("hoas/hoa/applications/app/")
    expect(application.source("file", "appendix.docx")).toBe("hoas/hoa/applications/app/files/file/source.docx")
    expect(application.ocr("file", "azure-layout", "all")).toBe(
      "hoas/hoa/applications/app/files/file/ocr/azure-layout/all.json"
    )
    expect(application.page("file", 1)).toBe("hoas/hoa/applications/app/files/file/pages/1.json")
    expect(application.figureImage("file", "image")).toBe("hoas/hoa/applications/app/files/file/figures/image.png")
    expect(application.figureDescription("file", "image")).toBe(
      "hoas/hoa/applications/app/files/file/figures/image.json"
    )
    expect(application.cache("facts", "abc")).toBe("hoas/hoa/applications/app/cache/facts/abc.json")
    expect(application.review("r1")).toBe("hoas/hoa/applications/app/reviews/r1.json")

    expect(hoaCacheKey("hoa", "extract", "abc")).toBe("hoas/hoa/cache/extract/abc.json")
    expect(jobOutputKey("hoa", "job", "extract", "s1")).toBe("hoas/hoa/jobs/job/extract/s1.json")
    expect(jobOutputPrefix("hoa", "job")).toBe("hoas/hoa/jobs/job/")
    expect(extensionOf("README")).toBe("bin")

    const projectType = projectTypeKeys("hoa", "type")
    expect(projectType.root).toBe("hoas/hoa/project-types/type/")
    expect(projectType.template("t1", "Neighbor approval.DOCX")).toBe("hoas/hoa/project-types/type/templates/t1.docx")
  })

  it("keeps a rulebook's rules file and its build's stage outputs apart", () => {
    expect(rulebookKeys("hoa", "rb")).toEqual({
      root: "hoas/hoa/rulebooks/rb/",
      file: "hoas/hoa/rulebooks/rb/rules.json"
    })
    const build = rulebookBuildKeys("hoa", "job")
    expect(build.step("structure:doc")).toBe("hoas/hoa/jobs/job/structure/doc.json")
    expect(build.step("find-rules:declaration:article-4")).toBe(
      "hoas/hoa/jobs/job/find-rules/declaration:article-4.json"
    )
    expect(build.step("find-rules:declaration:article-4:rerun")).toBe(
      "hoas/hoa/jobs/job/find-rules/declaration:article-4:rerun.json"
    )
    expect(build.step("merge")).toBe("hoas/hoa/jobs/job/merge/result.json")
  })
})

describe("objects", () => {
  function bucket(): ObjectBucket & { stored: Map<string, string> } {
    const stored = new Map<string, string>()
    return {
      stored,
      get: async (key) => {
        const text = stored.get(key)
        return text === undefined ? null : { text: async () => text }
      },
      put: async (key, value) => {
        stored.set(key, typeof value === "string" ? value : new TextDecoder().decode(value))
      }
    }
  }

  it("round-trips JSON and caches prompt results by hash", async () => {
    const store = bucket()
    await putJson(store, "a.json", { value: 1 })
    expect(
      await getJson(store, "a.json", (await import("zod")).z.object({ value: (await import("zod")).z.number() }))
    ).toEqual({ value: 1 })
    expect(await getJson(store, "missing.json", (await import("zod")).z.unknown())).toBeNull()

    const cache = createObjectPromptCache(store, (hash) => `cache/${hash}.json`)
    expect(await cache.get("h")).toBeUndefined()
    await cache.put("h", { answer: "yes" })
    expect(await cache.get("h")).toEqual({ answer: "yes" })
    expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe("000fff")
  })
})

describe("createPresigner", () => {
  it("signs short-lived PUT and GET URLs for the environment's bucket", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") })
    const presigner = createPresigner({
      accountId: "acct",
      bucket: "hoa-dev",
      accessKeyId: "key",
      secretAccessKey: "secret"
    })
    const upload = new URL(await presigner.upload("hoas/hoa/governing/doc/source.pdf"))
    const download = new URL(await presigner.download("hoas/hoa/governing/doc/source.pdf"))
    vi.useRealTimers()

    expect(upload.origin + upload.pathname).toBe(
      "https://acct.r2.cloudflarestorage.com/hoa-dev/hoas/hoa/governing/doc/source.pdf"
    )
    expect(upload.searchParams.get("X-Amz-Expires")).toBe("900")
    expect(upload.searchParams.get("X-Amz-SignedHeaders")).toBe("host")
    expect(upload.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/)
    expect(download.searchParams.get("X-Amz-Expires")).toBe("300")
  })
})
