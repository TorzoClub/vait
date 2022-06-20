export type Memo<D> = Readonly<[() => D, (new_data: D) => void]>

export const Memo = <D>(data: D): Memo<D> => [
  () => data,
  (new_data: D) => { data = new_data }
]

export const Wrap = <D>(data: D) => () => data
