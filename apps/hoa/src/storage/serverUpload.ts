import {
  createAdapter,
  presignedAdapter,
  type UploadAdapter,
  type Uploader,
  type UploadItem,
  type UploadStatus
} from "@uploadcn/core"

// Every upload (documents.md, Uploads) starts on the server, which records it and signs an R2 URL when the
// environment has the token for one. The bytes then go straight to R2, or through the Worker when it doesn't, and the
// server finishes it. UploadCN runs the queue around that: progress, retries and cancelling.

/** What the server returns when an upload starts: the presigned URL for its bytes, or null to send them through it. */
export type StartedUpload = { uploadUrl: string | null; contentType: string }

/** How one kind of file starts, travels and finishes. */
export type ServerUpload<TStarted extends StartedUpload, TResult> = {
  /** Names the adapter in UploadCN's errors. */
  name: string
  start: (file: File) => Promise<TStarted>
  /** Sends the bytes through the Worker, for an environment that can't presign. */
  throughServer: (started: TStarted, file: File) => Promise<void>
  /** What the file is once it's stored. */
  finish: (started: TStarted, file: File) => Promise<TResult>
}

/** An UploadCN adapter for one kind of file. */
export function serverUploadAdapter<TStarted extends StartedUpload, TResult>(
  upload: ServerUpload<TStarted, TResult>
): UploadAdapter<TResult> {
  return createAdapter(
    async (context) => {
      const started = await upload.start(context.file)
      const { uploadUrl } = started
      if (uploadUrl) {
        await presignedAdapter({
          getTarget: () => ({ url: uploadUrl, method: "PUT", headers: { "Content-Type": started.contentType } })
        }).upload(context)
      } else {
        await upload.throughServer(started, context.file)
        context.onProgress(context.file.size)
      }
      return upload.finish(started, context.file)
    },
    { name: upload.name }
  )
}

const settled: ReadonlySet<UploadStatus> = new Set(["success", "error", "cancelled", "rejected"])

/** Starts every chosen file and resolves with them all once each has uploaded, failed or been turned away. */
export function uploadAll<TResult>(uploader: Uploader<TResult>): Promise<readonly UploadItem<TResult>[]> {
  uploader.start()
  return new Promise((resolve) => {
    const check = () => {
      const { items } = uploader.getState()
      if (items.every((item) => settled.has(item.status))) {
        unsubscribe()
        resolve(items)
      }
    }
    const unsubscribe = uploader.subscribe(check)
    check()
  })
}
