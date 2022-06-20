interface Getter<D> {
  (): D
}

interface Setter<D> {
  (new_data: D): void
}

export type Memo<D> = Readonly<[Getter<D>, Setter<D>]>

export const Memo = <D>(data: D): Memo<D> => [
  () => data,
  (new_data: D) => { data = new_data }
]

export const Wrap = <D>(data: D) => Memo(data)[0]
