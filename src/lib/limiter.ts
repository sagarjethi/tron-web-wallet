/**
 * Paces requests to TronGrid.
 *
 * TronGrid enforces 15 requests per second per API key and suspends the key for several seconds when
 * a burst exceeds it. Every visitor shares the wallet's key through the proxy, so one tab loading a
 * spam-heavy address must never cause that. This token bucket keeps each tab well under the limit,
 * and a 429 pauses the whole bucket for as long as the server asks.
 */
export class RateLimiter {
  private tokens: number
  private last = Date.now()
  private pausedUntil = 0
  private queue: (() => void)[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  private readonly ratePerSecond: number
  private readonly burst: number

  constructor(ratePerSecond: number, burst: number) {
    this.ratePerSecond = ratePerSecond
    this.burst = burst
    this.tokens = burst
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.drain()
    })
  }

  /** Stops issuing tokens until `ms` from now, for example after a 429 with Retry-After. */
  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms)
    this.tokens = 0
    this.schedule(ms)
  }

  private refill() {
    const now = Date.now()
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSecond)
    this.last = now
  }

  private drain() {
    const now = Date.now()
    if (now < this.pausedUntil) return this.schedule(this.pausedUntil - now)
    this.refill()
    while (this.queue.length && this.tokens >= 1) {
      this.tokens -= 1
      this.queue.shift()!()
    }
    if (this.queue.length) this.schedule(Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000))
  }

  private schedule(ms: number) {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.drain()
    }, Math.max(ms, 10))
  }
}

/** 8 per second leaves headroom under TronGrid's 15 for other tabs and the server's own retries. */
export const tronGridLimiter = new RateLimiter(8, 8)

/** Retry-After in milliseconds from a 429 response, with a safe default and cap. */
export function retryAfterMs(header: string | null | undefined): number {
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 30) * 1000 : 2000
}
