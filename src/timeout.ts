import { OuterPromise } from './outer-promise'
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
  const [ resolve, reject, waiting ] = OuterPromise<void>()
  const timer = Timer(Date.now, resolve)
  timer.set(ms)
  handlers.set(waiting, (cause) => {
    timer.cancel()
    reject(new TimeoutRejected('timeout cancel', { cause }))
  })
  return waiting
}
