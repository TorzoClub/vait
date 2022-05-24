export const createMemo = <Data extends unknown>(data: Data) => [
  () => data,
  (newData: Data) => { data = newData }
] as const
