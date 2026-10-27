import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStorage, s3Storage } from './index'

const storage = () =>
  s3Storage({ region: 'auto', bucket: 'app', accessKeyId: 'test', secretAccessKey: 'test' })

afterEach(() => vi.restoreAllMocks())

describe('ensureBucket', () => {
  it('creates the configured bucket', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
    await storage().ensureBucket()
    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(CreateBucketCommand)
    expect((command as CreateBucketCommand).input.Bucket).toBe('app')
  })

  it.each([
    ['BucketAlreadyOwnedByYou', new BucketAlreadyOwnedByYou({ message: 'x', $metadata: {} })],
    ['BucketAlreadyExists', new BucketAlreadyExists({ message: 'x', $metadata: {} })],
  ])('treats %s as success', async (_name, error) => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(error as never)
    await expect(storage().ensureBucket()).resolves.toBeUndefined()
  })

  it('rethrows anything else', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('connection refused') as never)
    await expect(storage().ensureBucket()).rejects.toThrow('connection refused')
  })

  it('is a no-op for the memory adapter', async () => {
    await expect(memoryStorage().ensureBucket()).resolves.toBeUndefined()
  })
})
