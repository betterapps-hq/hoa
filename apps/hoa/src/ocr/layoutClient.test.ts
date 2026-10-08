import { describe, expect, it, vi } from "vitest"
import { analyzeResultOf, createLayoutClient, LayoutError, LayoutNotReadyError, resultIdOf } from "./layoutClient"

const operationUrl =
  "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/abc-123?api-version=2024-11-30"

function client(responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const response of responses) {
    fetch.mockResolvedValueOnce(response)
  }
  return {
    fetch,
    layout: createLayoutClient({ endpoint: "https://example.cognitiveservices.azure.com/", key: "k", fetch })
  }
}

describe("createLayoutClient", () => {
  it("submits a URL source with Markdown and figures requested, and returns the operation URL", async () => {
    const { fetch, layout } = client([
      new Response(null, { status: 202, headers: { "operation-location": operationUrl } })
    ])

    expect(await layout.submit({ urlSource: "https://files.example/doc.pdf" }, "1-50")).toBe(operationUrl)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toBe(
      "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&outputContentFormat=markdown&output=figures&pages=1-50"
    )
    expect(init?.body).toBe(JSON.stringify({ urlSource: "https://files.example/doc.pdf" }))
  })

  it("marks client errors permanent and throttling retryable", async () => {
    const { layout } = client([new Response("bad file", { status: 400 }), new Response("slow down", { status: 429 })])
    await expect(layout.submit({ base64Source: "eA==" })).rejects.toMatchObject({ status: 400, isRetryable: false })
    await expect(layout.submit({ base64Source: "eA==" })).rejects.toMatchObject({ status: 429, isRetryable: true })
  })

  it("throws not-ready while running, then returns the response text", async () => {
    const done = JSON.stringify({ status: "succeeded", analyzeResult: { content: "x" } })
    const { layout } = client([new Response(JSON.stringify({ status: "running" })), new Response(done)])
    await expect(layout.poll(operationUrl)).rejects.toBeInstanceOf(LayoutNotReadyError)
    expect(analyzeResultOf(await layout.poll(operationUrl))).toEqual({ content: "x" })
  })

  it("reports a failed analysis as permanent", async () => {
    const { layout } = client([new Response(JSON.stringify({ status: "failed", error: { message: "Corrupt PDF" } }))])
    const error = await layout.poll(operationUrl).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LayoutError)
    expect(error).toMatchObject({ isRetryable: false, message: "Layout couldn't read the document: Corrupt PDF" })
  })

  it("downloads a figure from the analysis result", async () => {
    const { fetch, layout } = client([new Response(new Uint8Array([1, 2, 3]))])
    expect(new Uint8Array(await layout.figure(operationUrl, "16.1"))).toEqual(new Uint8Array([1, 2, 3]))
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/analyzeResults/abc-123/figures/16.1?api-version=2024-11-30")
  })

  it("rejects an operation URL without a result id", () => {
    expect(() => resultIdOf("https://example.com/other")).toThrow("Unexpected operation URL")
  })
})
