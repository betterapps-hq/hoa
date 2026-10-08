import { AwsClient } from "aws4fetch"

export type R2Credentials = { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }

/**
 * Presigned R2 URLs (docs/design/documents.md, "Uploads"): browsers upload straight to R2, and Layout reads files
 * through a short-lived GET URL, so file bytes never pass through a Worker.
 */
export function createPresigner(credentials: R2Credentials) {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "s3",
    region: "auto"
  })
  const objectUrl = (key: string, expiresSeconds: number) => {
    const url = new URL(`https://${credentials.accountId}.r2.cloudflarestorage.com/${credentials.bucket}/${key}`)
    url.searchParams.set("X-Amz-Expires", String(expiresSeconds))
    return url
  }
  return {
    /**
     * A PUT URL valid for 15 minutes. It can't bind the content type (aws4fetch never signs it), so `completeUpload`
     * checks the stored object's size.
     */
    async upload(key: string) {
      const request = await client.sign(objectUrl(key, 15 * 60), { method: "PUT", aws: { signQuery: true } })
      return request.url
    },
    /** A GET URL, valid for 5 minutes by default; Layout's urlSource gets 30 minutes. */
    async download(key: string, expiresSeconds = 5 * 60) {
      const request = await client.sign(objectUrl(key, expiresSeconds), { method: "GET", aws: { signQuery: true } })
      return request.url
    }
  }
}

export type Presigner = ReturnType<typeof createPresigner>
