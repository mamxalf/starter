import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onShutdown } from './shutdown'

type Handler = () => void

describe('onShutdown', () => {
  const handlers = new Map<string, Handler>()
  let exit: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    handlers.clear()
    vi.spyOn(process, 'on').mockImplementation(((signal: string, fn: Handler) => {
      handlers.set(signal, fn)
      return process
    }) as never)
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('exits 0 after a clean close', async () => {
    onShutdown(async () => {})
    handlers.get('SIGTERM')?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('exits 1 when cleanup fails', async () => {
    onShutdown(async () => {
      throw new Error('boom')
    })
    handlers.get('SIGINT')?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('forces exit 1 when cleanup hangs past 10s', async () => {
    onShutdown(() => new Promise(() => {}))
    handlers.get('SIGTERM')?.()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('runs cleanup once even if signalled twice', async () => {
    const cleanup = vi.fn(async () => {})
    onShutdown(cleanup)
    handlers.get('SIGTERM')?.()
    handlers.get('SIGINT')?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
