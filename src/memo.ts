export type MemoGetter<D> = () => D
export type MemoSetter<D> = (d: D) => void

export type Memo<D> = Readonly<[MemoGetter<D>, MemoSetter<D>]>

export const Memo = <D>(data: D): Memo<D> => [
  () => data,
  (new_data: D) => { data = new_data },
]

export class MemoValidatingError extends Error { }

export const MemoWithValidating = <D>(
  init_data: D,
  validator: (i: D) => void | string
) => {
  const [getData, innerSetData] = Memo<D>(init_data)
  setData(init_data)

  function setData(val: D) {
    const res = validator(val)
    if (res !== undefined) {
      throw new MemoValidatingError(res)
    } else {
      innerSetData(val)
    }
  }

  return [ getData, setData ] as const
}
