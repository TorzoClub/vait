export const CreateMemo = <Data>(data: Data) => [
  () => data,
  (newData: Data) => { data = newData }
] as const
