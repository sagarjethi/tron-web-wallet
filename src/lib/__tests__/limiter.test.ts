import { describe, expect, it } from 'vitest'
import { RateLimiter, retryAfterMs } from '../limiter'

describe('RateLimiter', () => {
  it('lets a burst through, then paces to the rate', async () => {
    const limiter = new RateLimiter(20, 5)
    const start = Date.now()
    await Promise.all(Array.from({ length: 15 }, () => limiter.acquire()))
    // 5 immediately, 10 more at 20/s: at least ~450ms.
    expect(Date.now() - start).toBeGreaterThanOrEqual(400)
  })

  it('holds every request while paused', async () => {
    const limiter = new RateLimiter(100, 10)
    limiter.pause(300)
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeGreaterThanOrEqual(280)
  })
})

describe('retryAfterMs', () => {
  it('reads seconds, defaults and caps', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs(null)).toBe(2000)
    expect(retryAfterMs('abc')).toBe(2000)
    expect(retryAfterMs('600')).toBe(30000)
  })
})
