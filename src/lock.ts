type Unlock<T> = (v: T) => void

export function Lock(): readonly [Promise<void>, Unlock<void>]
export function Lock<T>(): readonly [Promise<T>, Unlock<T>]
export function Lock<T>() {
  let resolve: Unlock<T>
  return [
    new Promise<T>(
      inner_resolve => resolve = inner_resolve
    ),
    (v: T) => resolve(v)
  ] as const
}
