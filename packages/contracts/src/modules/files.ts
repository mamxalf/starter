import { oc } from '@orpc/contract'
import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const

export const filesContract = {
  /** Step 1: reserve a file and get a presigned URL. The browser uploads directly to storage. */
  createUpload: oc
    .input(
      z.object({
        filename: z.string().min(1).max(200),
        contentType: z.enum(ALLOWED_CONTENT_TYPES),
        size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
      }),
    )
    .output(
      z.object({
        fileId: z.uuid(),
        upload: z.object({
          url: z.string(),
          method: z.literal('PUT'),
          headers: z.record(z.string(), z.string()),
        }),
      }),
    ),
  /** Step 2: confirm. The API checks the object exists with the declared size. */
  completeUpload: oc
    .input(z.object({ fileId: z.uuid() }))
    .output(z.object({ fileId: z.uuid(), status: z.literal('ready') })),
  downloadUrl: oc.input(z.object({ fileId: z.uuid() })).output(z.object({ url: z.string() })),
}
