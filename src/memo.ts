export interface MemoGetter<D> {
  (): D
}

export interface MemoSetter<D> {
  (new_data: D): void
}

export type Memo<D> = Readonly<[MemoGetter<D>, MemoSetter<D>]>

export const Memo = <D>(data: D): Memo<D> => [
  () => data,
  (new_data: D) => { data = new_data },
]

export const Wrap = <D>(data: D) => Memo(data)[0]
