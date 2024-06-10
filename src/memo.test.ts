import { Memo, MemoValidatingError, ValidatingMemo } from './memo'

test('Memo', async () => {
  const [getVal, setVal] = Memo(114514)

  expect(getVal()).toBe(114514)

  const return_val = setVal(9999)
  expect(return_val).toBe(undefined)

  expect(getVal()).toBe(9999)
})

test('share Memo', () => {
  function outerFn([getVal, setVal]: Memo<number>) {
    expect(getVal()).toBe(9)

    setVal(0)
    expect(getVal()).toBe(0)
  }

  const m = Memo(9)
  outerFn(m)
})

test('MemoWithValidating', () => {
  const [ getVal, setVal ] = ValidatingMemo(Memo(9), (v) => {
    if (!Number.isInteger(v)) {
      return 'need integer'
    }
  })
  expect( getVal() ).toBe( 9 )
  setVal( 10 )

  expect(() => {
    setVal( 1.1 )
  }).toThrow(MemoValidatingError)
})
