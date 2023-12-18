export type MemoGetter<D> = () => D
export type MemoSetter<D> = (d: D) => void

export type Memo<D> = Readonly<[MemoGetter<D>, MemoSetter<D>]>

export const Memo = <D>(data: D): Memo<D> => [
  () => data,
  (new_data: D) => { data = new_data },
]
