import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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

  const refresh = useCallback(async () => {
    try {
      setState(await api.getState())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

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
      jump: async (day) => {
        await api.setDay(Math.max(0, day))
        await refresh()
      },
      reset: async () => {
        await api.resetDemo()
        await refresh()
      },
    }),
    [state, error, refresh],
  )
  return <BackPocket.Provider value={value}>{children}</BackPocket.Provider>
}

export function useBackPocket(): Ctx {
  const ctx = useContext(BackPocket)
  if (!ctx) throw new Error('useBackPocket must be used inside BackPocketProvider')
  return ctx
}
