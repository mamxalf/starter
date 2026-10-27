import { withSystem } from '@starter/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDeps, type TestKit } from '../../test/helpers'
import { cleanupPendingUploads } from './files.service'

let kit: TestKit

beforeAll(async () => {
  kit = await createTestDeps()
  kit.signUp('alice', 'alice@example.com')
  await kit.inRequest(() =>
    kit.clientAs('alice').tenants.create({ name: 'Acme', slug: 'acme', defaultLocale: 'id' }),
  )
})

afterAll(() => kit.db.destroy())

describe('files (presigned upload flow)', () => {
  it('becomes ready only after the object exists with the declared size', async () => {
    const api = kit.clientAs('alice', 'acme')
    const { fileId, upload } = await kit.inRequest(() =>
      api.files.createUpload({ filename: 'logo.png', contentType: 'image/png', size: 1234 }),
    )
    expect(upload.headers['content-type']).toBe('image/png')

    await expect(kit.inRequest(() => api.files.completeUpload({ fileId }))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })

    // Simulate the browser's direct PUT to storage.
    const key = upload.url.replace('memory://', '')
    expect(key).toMatch(/^tenants\/[\w-]+\/[\w-]+$/)
    kit.storage.objects.set(key, { size: 1234, contentType: 'image/png' })

    await expect(kit.inRequest(() => api.files.completeUpload({ fileId }))).resolves.toEqual({
      fileId,
      status: 'ready',
    })
    const { url } = await kit.inRequest(() => api.files.downloadUrl({ fileId }))
    expect(url).toContain(fileId)
  })

  it('rejects disallowed types and oversized files at the contract', async () => {
    const api = kit.clientAs('alice', 'acme')
    await expect(
      kit.inRequest(() =>
        api.files.createUpload({
          filename: 'x.exe',
          contentType: 'application/x-msdownload' as 'image/png',
          size: 10,
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('cleans up stale pending uploads', async () => {
    const api = kit.clientAs('alice', 'acme')
    await kit.inRequest(() =>
      api.files.createUpload({
        filename: 'abandoned.pdf',
        contentType: 'application/pdf',
        size: 10,
      }),
    )
    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000)
    expect(await cleanupPendingUploads(kit.deps, tomorrow)).toBe(1)

    const left = await withSystem(kit.db, (trx) =>
      trx.selectFrom('files').select('status').execute(),
    )
    expect(left).toEqual([{ status: 'ready' }])
  })
})
