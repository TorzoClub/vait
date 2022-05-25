import { createMemo } from './create-memo'

test('createMemo', async () => {
  const [getVal, setVal] = createMemo(114514)

  expect(getVal()).toBe(114514)

  const return_val = setVal(9999)
  expect(return_val).toBe(undefined)

  expect(getVal()).toBe(9999)
})
