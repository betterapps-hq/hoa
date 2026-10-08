import { z } from "zod"

export const layoutApiVersion = "2024-11-30"
export const layoutEngine = `azure-layout@${layoutApiVersion}`

/** A Layout failure. `isRetryable` is false for errors that will fail the same way again (4xx other than 429). */
export class LayoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly isRetryable: boolean
  ) {
    super(message)
    this.name = "LayoutError"
  }
}

/** Thrown by `poll` while Layout is still working; the Workflow step retries on a constant delay. */
export class LayoutNotReadyError extends Error {
  constructor() {
    super("Layout is still analyzing the document.")
    this.name = "LayoutNotReadyError"
  }
}

export type LayoutSource = { urlSource: string } | { base64Source: string }

export type LayoutClient = {
  /** Starts an analysis and returns the operation URL to poll. `pages` is a range such as "1-50", for PDFs only. */
  submit: (source: LayoutSource, pages?: string) => Promise<string>
  /** Returns the finished response as JSON text, or throws `LayoutNotReadyError` while it's running. */
  poll: (operationUrl: string) => Promise<string>
  /** The cropped PNG of one figure, from an analysis that finished in the last 24 hours. */
  figure: (operationUrl: string, figureId: string) => Promise<ArrayBuffer>
}

const operationSchema = z.object({
  status: z.enum(["notStarted", "running", "succeeded", "failed", "canceled"]),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional()
})

async function failure(response: Response, action: string) {
  const detail = (await response.text()).slice(0, 500)
  const isRetryable = response.status === 429 || response.status >= 500
  return new LayoutError(`Layout ${action} failed (${response.status}): ${detail}`, response.status, isRetryable)
}

/** The result id in an operation URL: `.../analyzeResults/{resultId}?api-version=...`. */
export function resultIdOf(operationUrl: string) {
  const match = /analyzeResults\/([^/?]+)/.exec(operationUrl)
  if (!match?.[1]) {
    throw new LayoutError(`Unexpected operation URL: ${operationUrl}`, 0, false)
  }
  return match[1]
}

/**
 * Calls Azure AI Document Intelligence's prebuilt Layout model with `fetch` (docs/design/ocr.md, "Flow"). Markdown
 * output and cropped figure images are always requested.
 */
export function createLayoutClient(settings: { endpoint: string; key: string; fetch?: typeof fetch }): LayoutClient {
  const endpoint = settings.endpoint.replace(/\/$/, "")
  const request = settings.fetch ?? fetch
  const headers = { "Ocp-Apim-Subscription-Key": settings.key }
  const modelUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-layout`

  return {
    async submit(source, pages) {
      const query = new URLSearchParams({
        "api-version": layoutApiVersion,
        outputContentFormat: "markdown",
        output: "figures"
      })
      if (pages) {
        query.set("pages", pages)
      }
      const response = await request(`${modelUrl}:analyze?${query}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(source)
      })
      if (response.status !== 202) {
        throw await failure(response, "submit")
      }
      const operationUrl = response.headers.get("operation-location")
      if (!operationUrl) {
        throw new LayoutError("Layout accepted the request without an operation URL.", 202, true)
      }
      return operationUrl
    },

    async poll(operationUrl) {
      const response = await request(operationUrl, { headers })
      if (!response.ok) {
        throw await failure(response, "poll")
      }
      const text = await response.text()
      const operation = operationSchema.parse(JSON.parse(text))
      if (operation.status === "succeeded") {
        return text
      }
      if (operation.status === "failed" || operation.status === "canceled") {
        const message = operation.error?.message ?? operation.status
        throw new LayoutError(`Layout couldn't read the document: ${message}`, 200, false)
      }
      throw new LayoutNotReadyError()
    },

    async figure(operationUrl, figureId) {
      const resultId = resultIdOf(operationUrl)
      const url = `${modelUrl}/analyzeResults/${resultId}/figures/${figureId}?api-version=${layoutApiVersion}`
      const response = await request(url, { headers })
      if (!response.ok) {
        throw await failure(response, "figure download")
      }
      return response.arrayBuffer()
    }
  }
}

/** The analyze response wraps the result; page records are built from `analyzeResult`. */
export function analyzeResultOf(responseText: string): unknown {
  const parsed: unknown = JSON.parse(responseText)
  return z.object({ analyzeResult: z.unknown() }).parse(parsed).analyzeResult
}
