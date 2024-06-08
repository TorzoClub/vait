export function Timer(ms: number, fn: () => void) {
  const handler = setTimeout(fn, ms)
  return () => clearTimeout(handler)
}
