type Resolve<T> = (value: T | PromiseLike<T>) => void
type Reject = (reason?: unknown) => void

export function OutterPromise<T>() {
  let resolve: undefined | Resolve<T>
  let reject: undefined | Reject

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return [
    resolve as Resolve<T>,
    reject as Reject,
    promise,
  ] as const
}
