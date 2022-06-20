import { Memo, Wrap } from './memo'

test('CreateMemo', async () => {
  const [getVal, setVal] = Memo(114514)

  expect(getVal()).toBe(114514)

  const return_val = setVal(9999)
  expect(return_val).toBe(undefined)

  expect(getVal()).toBe(9999)
})

test('Wrap', () => {
  const valueWrapper = Wrap('wrap')
  expect(valueWrapper()).toBe('wrap')
})
