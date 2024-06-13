import { OutterPromise } from './outter-promise'

type Go<T> = (v: T) => void
type RejectWaiting = (reason?: unknown) => void
type Waiting<T> = Promise<T>

export class WaitingRejected extends Error {}

export type Wait<T = void> = readonly [Waiting<T>, Go<T>, RejectWaiting]

export function Wait(): Wait
export function Wait<T>(): Wait<T>
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
