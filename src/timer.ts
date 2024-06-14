export type CancelTimer = () => void
export function Timer(ms: number, fn: () => void): CancelTimer {
  const handler = setTimeout(fn, ms)
  return () => clearTimeout(handler)
}
