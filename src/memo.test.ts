import { CreateMemo, Memo } from './memo'

test('CreateMemo', async () => {
  const [getVal, setVal] = CreateMemo(114514)

  expect(getVal()).toBe(114514)

  const return_val = setVal(9999)
  expect(return_val).toBe(undefined)

  expect(getVal()).toBe(9999)
})

test('Memo value wrap', () => {
  const valueWrapper = Memo('ion')
  expect(valueWrapper()).toBe('ion')
})

test('Memo iterator', () => {
  const memo = Memo('ion')
  const [getVal, setVal] = memo

  const arr = [...memo]
  expect(arr.length).toBe(2)
  expect(arr).toEqual([getVal, setVal])
})

test('Memo getVal/setVal', () => {
  const memo = Memo(0)
  const [getVal, setVal] = memo

  expect(getVal()).toBe(0)
  expect(memo()).toBe(0)

  const return_val = setVal(999)
  expect(return_val).toBe(undefined)

  expect(getVal()).toBe(999)
  expect(memo()).toBe(999)
})
