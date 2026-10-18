import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PanelState } from '../../shared/ui/types'
import * as api from './api'

// One poll of /state feeds every page, the same call the extension's panel makes.

interface Ctx {
  state: PanelState | null
  error: string | null
  refresh: () => Promise<void>
  jump: (day: number) => Promise<void>
  reset: () => Promise<void>
}

const BackPocket = createContext<Ctx | null>(null)

const POLL_MS = 3000

export function BackPocketProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Each request gets a number; only the newest one may update the page, so a
  // slow poll that started before a day change can't put the old day back.
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++latest.current
    try {
      const next = await api.getState()
      if (mine !== latest.current) return
      setState(next)
      setError(null)
    } catch (e) {
      if (mine === latest.current) setError((e as Error).message)
    }
  }, [])

  // Day and reset buttons: a failure shows in the error banner instead of
  // disappearing as an unhandled promise.
  const act = useCallback(
    async (change: () => Promise<unknown>) => {
      latest.current++ // anything already in flight is now stale
      try {
        await change()
      } catch (e) {
        setError((e as Error).message)
        return
      }
      await refresh()
    },
    [refresh],
  )

  // Poll only while the tab is visible, and refresh as soon as it is again.
  useEffect(() => {
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const value = useMemo<Ctx>(
    () => ({
      state,
      error,
      refresh,
      jump: (day) => act(() => api.setDay(Math.max(0, day))),
      reset: () => act(() => api.resetDemo()),
    }),
    [state, error, refresh, act],
  )
  return <BackPocket.Provider value={value}>{children}</BackPocket.Provider>
}

export function useBackPocket(): Ctx {
  const ctx = useContext(BackPocket)
  if (!ctx) throw new Error('useBackPocket must be used inside BackPocketProvider')
  return ctx
}
