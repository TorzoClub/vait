import { OutterPromise } from './outter-promise'

type Go<T> = (v: T) => void
type Cancel = (reason?: unknown) => void

export function Wait(): readonly [Promise<void>, Go<void>, Cancel]
export function Wait<T>(): readonly [Promise<T>, Go<T>, Cancel]
export function Wait<T>() {
  const [ done, failure, waiting ] = OutterPromise<T>()
  return [ waiting, done, failure ] as const
}
