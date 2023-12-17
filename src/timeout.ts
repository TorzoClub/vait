import { Wait } from './wait'

export async function timeout(ms: number) {
  const [wait, go] = Wait<void>()
  setTimeout(go, ms)
  return wait
}
