import { OutterPromise } from './outter-promise'
import { Timer } from './timer'

type RejectTiemout = (reason?: unknown) => void

type TimeoutWaiting = Promise<void>

const handlers = new WeakMap<TimeoutWaiting, RejectTiemout>()

export function rejectTimeout(waiting: TimeoutWaiting) {
  const cancel = handlers.get(waiting)
  if (cancel) {
    handlers.delete(waiting)
    cancel()
  }
}

export class TimeoutRejected extends Error {}

export function timeout(ms: number) {
  const [ resolve, reject, waiting ] = OutterPromise<void>()
  const cancelTimer = Timer(ms, resolve)
  handlers.set(waiting, (cause) => {
    cancelTimer()
    reject(new TimeoutRejected('timeout cancel', { cause }))
  })
  return waiting
}
