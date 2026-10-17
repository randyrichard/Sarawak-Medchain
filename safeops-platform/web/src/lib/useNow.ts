import { useEffect, useState } from 'react'

/**
 * The time now, read again every `everyMs` while the component is on screen.
 *
 * For labels relative to it, such as "updated 2m ago". Computed once, such a label stayed
 * "updated just now" for as long as the page was open, which was false after the first
 * minute and made a refresh look like it had done nothing.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
