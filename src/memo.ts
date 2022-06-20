type Getter<D> = () => D
type Setter<D> = (d: D) => void
type Memorized<D> = {
  (): D
} & Readonly<[Getter<D>, Setter<D>]>

export const CreateMemo = <Data>(data: Data) => [
  () => data,
  (newData: Data) => { data = newData }
] as const

export const Memo = <D>(data: D) => {
  const [get, set] = CreateMemo<D>(data)

  const ret = Object.assign(() => get(), {
    [Symbol.iterator]() {
      let i = 0
      return {
        next() {
          if (i === 0) {
            i += 1
            return {
              value: get,
              done: false
            }
          } else if (i === 1) {
            i += 1
            return {
              value: set,
              done: false
            }
          } else {
            return { done: true }
          }
        }
      }
    }
  }) as Memorized<D>

  return ret
}
