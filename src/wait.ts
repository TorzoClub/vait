type Go<T> = (v: T) => void

export function Wait(): readonly [Promise<void>, Go<void>]
export function Wait<T>(): readonly [Promise<T>, Go<T>]
export function Wait<T>() {
  let resolve: Go<T>
  return [
    new Promise<T>(
      inner_resolve => resolve = inner_resolve
    ),
    (v: T) => resolve(v)
  ] as const
}
