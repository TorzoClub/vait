export interface VaitMemo<D> {
  (): Readonly<[() => D, (d: D) => void]>
}

export const Memo = <D>(data: D) => [
  () => data,
  (new_data: D) => { data = new_data }
] as const
