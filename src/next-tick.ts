import { timeout } from './timeout'
export function nextTick() {
  return timeout(0)
}
