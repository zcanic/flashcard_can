export function useHaptic() {
  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    navigator.vibrate(pattern)
  }

  return {
    tap: () => vibrate(20),
    success: () => vibrate([30, 30, 40]),
    warning: () => vibrate(80),
  }
}
