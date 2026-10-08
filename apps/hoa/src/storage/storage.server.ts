import { env as bindings } from "cloudflare:workers"
import { env } from "@/env.server"
import { createPresigner, type Presigner } from "./presign"

/** The environment's R2 bucket. */
export function getBucket(): R2Bucket {
  return bindings.FILES
}

/** Presigns URLs with the environment's R2 API token; throws with what's missing when it isn't configured. */
export function getPresigner(): Presigner {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Uploads need an R2 API token: set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (docs/setup.md)."
    )
  }
  return createPresigner({
    accountId: R2_ACCOUNT_ID,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  })
}
