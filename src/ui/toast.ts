import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type ToastTone = 'ok' | 'error'

export const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

/** How long a secret may stay on the clipboard or on screen. */
export const SECRET_TTL_MS = 60_000

let pendingClipboardClear: ReturnType<typeof setTimeout> | undefined

export function useCopy() {
  const toast = useToast()
  return useCallback(
    async (value: string, what = 'Copied', opts: { sensitive?: boolean } = {}) => {
      try {
        await navigator.clipboard.writeText(value)
        if (!opts.sensitive) return toast(what)
        toast(`${what}. The clipboard clears in ${SECRET_TTL_MS / 1000} seconds.`)
        clearTimeout(pendingClipboardClear)
        // Overwrite rather than read: reading the clipboard needs a permission prompt.
        pendingClipboardClear = setTimeout(() => void navigator.clipboard.writeText('').catch(() => {}), SECRET_TTL_MS)
      } catch {
        toast('Copy failed. Select the text and copy it manually.', 'error')
      }
    },
    [toast],
  )
}

/**
 * Holds a revealed secret and forgets it after SECRET_TTL_MS, or as soon as the tab is hidden,
 * so a phrase or key is never left on an unattended screen.
 */
export function useEphemeralSecret(): [string | null, (value: string | null) => void] {
  const [secret, setSecret] = useState<string | null>(null)
  useEffect(() => {
    if (secret === null) return
    const timer = setTimeout(() => setSecret(null), SECRET_TTL_MS)
    const onHide = () => document.visibilityState === 'hidden' && setSecret(null)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [secret])
  return [secret, setSecret]
}
