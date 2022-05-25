export const createMemo = <Data>(data: Data) => [
  () => data,
  (newData: Data) => { data = newData }
] as const
