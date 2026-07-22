import { useEffect, useState } from 'react'

// Launch target: 23rd July 2026, 3:21 PM IST → stored as the equivalent UTC instant
export const LAUNCH_TARGET = new Date('2026-07-23T09:51:00Z').getTime()

export function useIsLaunched() {
  const [launched, setLaunched] = useState(() => Date.now() >= LAUNCH_TARGET)
  useEffect(() => {
    if (launched) return
    const id = setInterval(() => {
      if (Date.now() >= LAUNCH_TARGET) { setLaunched(true); clearInterval(id) }
    }, 1000)
    return () => clearInterval(id)
  }, [launched])
  return launched
}
