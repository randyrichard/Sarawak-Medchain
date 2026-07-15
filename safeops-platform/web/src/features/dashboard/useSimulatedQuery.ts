import { useEffect, useState } from 'react'

/**
 * Simulates the fetch lifecycle for shell placeholders so loading states are
 * honest. When real endpoints land, callers swap this for the API hook with
 * the same { loading, data } shape.
 */
export function useSimulatedQuery<T>(produce: () => T, ms = 900): { loading: boolean; data: T | null } {
  const [state, setState] = useState<{ loading: boolean; data: T | null }>({ loading: true, data: null })
  useEffect(() => {
    const t = setTimeout(() => setState({ loading: false, data: produce() }), ms + Math.random() * 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return state
}
