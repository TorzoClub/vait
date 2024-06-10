import { OutterPromise } from './outter-promise'

type Go<T> = (v: T) => void
type RejectWaiting = (reason?: unknown) => void
export type Waiting<T> = Promise<T>

export class WaitingRejected extends Error {}

export function Wait(): readonly [Waiting<void>, Go<void>, RejectWaiting]
export function Wait<T>(): readonly [Waiting<T>, Go<T>, RejectWaiting]
export function Wait<T>() {
  const [ resolve, reject, promise ] = OutterPromise<T>()
  return [
    promise,
    resolve,
    (cause?: unknown) => reject(
      new WaitingRejected('Waiting was cancel', { cause })
    )
  ] as const
}
