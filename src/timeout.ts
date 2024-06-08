import { Wait } from './wait'

export async function timeout(ms: number) {
  const [ wait, go ] = Wait()
  setTimeout(go, ms)
  return wait
}
