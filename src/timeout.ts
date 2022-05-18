import { Lock } from './lock'

export type TimeoutResult = 'CLEAR' | 'TIMEOUT'
export async function timeout(ms: number) {
  const [lock, unlock] = Lock<void>()
  
  setTimeout(unlock, ms)

  return lock
}
