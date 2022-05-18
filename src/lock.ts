type Unlock<T> = 
(() => void) | ((v?: T) => void)

export function Lock<T extends unknown>() {
  let outterResolve: (value?: T) => void
  const lock = new Promise<T | void>((resolve) => {
    outterResolve = resolve
  })

  const unlock: Unlock<T> = (v) => {
    if (v === undefined) {
      outterResolve()
    } else {
      outterResolve(v)
    }
  }
  
  return [lock, unlock] as const
}
