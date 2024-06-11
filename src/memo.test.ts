import { Memo, MemoValidatingError, WatchMemoError, WithValidating } from './memo'

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
  const validator = (v: number) => {
    if (!Number.isInteger(v)) {
      return 'need integer'
    }
  }
  const [ getVal, setVal ] = WithValidating(Memo(9), validator)
  expect( getVal() ).toBe( 9 )
  setVal( 10 )

  expect(() => {
    setVal( 1.1 )
  }).toThrow(MemoValidatingError)

  {
    expect(() => {
      WithValidating(Memo(1.1), validator)
    }).toThrow(MemoValidatingError)
  }
})

test('MemoWithValidating 修改原Memo也仍然会进行 validating', () => {
  const m = Memo(0)
  const [sourceGet, sourceSet] = m
  let v_count = 0
  const cancelValidating = Memo.appendValidating(m, () => {
    v_count += 1
  })
  expect( v_count ).toBe( 1 )

  sourceSet(10)
  expect(sourceGet()).toBe(10)
  expect( v_count ).toBe( 2 )

  sourceSet(991)
  expect(sourceGet()).toBe(991)
  expect( v_count ).toBe( 3 )

  cancelValidating()

  sourceSet(888)
  expect(sourceGet()).toBe(888)
  expect( v_count ).toBe( 3 )
})

test('WatchMemo', () => {
  const m = Memo(0)
  const [ get, set ] = m
  expect(get()).toBe(0)

  let __watcher_is_called__ = false
  Memo.watch(m, (changed_data) => {
    __watcher_is_called__ = true
    expect(changed_data).toBe(999)
  })

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(true)
})

test('WatchMemo remove watcher', () => {
  const m = Memo(0)
  const [ get, set ] = m

  let __watcher_is_called__ = false
  const cancelWatch = Memo.watch(m, () => {
    __watcher_is_called__ = true
  })

  cancelWatch()

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(false)
})

test('WatchMemo cannot set memo in watcher', () => {
  const m = Memo(0)
  const [ get, set ] = m

  const beforeConsole = console

  Memo.watch(m, () => {
    expect(() => {
      set(10000)
    }).toThrow(WatchMemoError)
  })
  set(9)

  expect(get()).toBe(9)

  set(111)
  expect(get()).toBe(111)

  global.console = beforeConsole
})

test('watching ValidatingMemo By ValidatingMemo(WatchMemo(Memo', () => {
  const m = Memo(0)
  const [ get, set ] = m
  let changed = 0
  Memo.watch(m, () => {
    changed +=1
  })

  Memo.appendValidating(m, (v) => {
    if (v < 0) return 'failure'
  })

  expect(changed).toBe(0)

  set(2)
  expect(get()).toBe(2)
  expect(changed).toBe(1)

  expect(() => set(-222)).toThrow(MemoValidatingError)
  expect(changed).toBe(1)
})

test('watching ValidatingMemo By WatchMemo(ValidatingMemo(Memo', () => {
  const m = Memo(0)
  Memo.appendValidating(m, (v) => {
    if (v < 0) return 'failure'
  })

  const [ get, set ] = m

  let changed = 0
  Memo.watch(m, () => {
    changed += 1
  })

  set(999)

  expect(changed).toBe( 1 )

  expect(() => {
    set(-999)
  }).toThrow(MemoValidatingError)
  expect(get()).toBe(999)
  expect(changed).toBe( 1 )

  set(999)
  expect(changed).toBe( 2 )
})
