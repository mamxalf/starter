import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type PresignedUpload = {
  url: string
  method: 'PUT'
  /** Headers the browser must send with the upload (they are part of the signature). */
  headers: Record<string, string>
}

/** Port: any S3-compatible object store. Files never pass through the API server. */
export interface Storage {
  presignUpload(input: {
    key: string
    contentType: string
    size: number
    expiresIn?: number
  }): Promise<PresignedUpload>
  presignDownload(key: string, expiresIn?: number): Promise<string>
  head(key: string): Promise<{ size: number; contentType?: string } | null>
  delete(key: string): Promise<void>
  /** Creates the bucket if it is missing. Dev convenience: production buckets are provisioned. */
  ensureBucket(): Promise<void>
}

const BUCKET_EXISTS = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'])

export type S3Config = {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export function s3Storage(config: S3Config): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket

  return {
    async presignUpload({ key, contentType, size, expiresIn = 300 }) {
      // ContentLength + ContentType are signed: the browser cannot upload a different size or type.
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      })
      const url = await getSignedUrl(client, command, { expiresIn })
      return { url, method: 'PUT', headers: { 'content-type': contentType } }
    },
    presignDownload(key, expiresIn = 300) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn })
    },
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return { size: res.ContentLength ?? 0, contentType: res.ContentType }
      } catch (error) {
        if (error instanceof NotFound) return null
        throw error
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },
    async ensureBucket() {
      try {
        await client.send(new CreateBucketCommand({ Bucket }))
      } catch (error) {
        // Matched by name: S3-compatible servers (MinIO, R2, Garage) all report these two codes.
        if (error instanceof Error && BUCKET_EXISTS.has(error.name)) return
        throw error
      }
    },
  }
}

export type MemoryStorage = Storage & {
  objects: Map<string, { size: number; contentType: string }>
}

/** For tests and offline dev: simulates uploads by writing into a Map. */
export function memoryStorage(): MemoryStorage {
  const objects: MemoryStorage['objects'] = new Map()
  return {
    objects,
    async presignUpload({ key, contentType }) {
      return {
        url: `memory://${key}`,
        method: 'PUT',
        headers: { 'content-type': contentType },
      }
    },
    async presignDownload(key) {
      return `memory://${key}`
    },
    async head(key) {
      return objects.get(key) ?? null
    },
    async delete(key) {
      objects.delete(key)
    },
    async ensureBucket() {},
  }
}
