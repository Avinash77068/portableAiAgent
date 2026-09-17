import { useEffect, useRef, useState } from 'react'

export function useSplashScreen(isLoading: boolean, minimumDuration = 1200) {
  const [isSplashVisible, setIsSplashVisible] = useState(true)
  const startedAtRef = useRef(Date.now())

  useEffect(() => {
    if (isLoading) return undefined
    const elapsed = Date.now() - startedAtRef.current
    const remaining = Math.max(150, minimumDuration - elapsed)
    const timer = window.setTimeout(() => setIsSplashVisible(false), remaining)
    return () => window.clearTimeout(timer)
  }, [isLoading, minimumDuration])

  return isSplashVisible
}
