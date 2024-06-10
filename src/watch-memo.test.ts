import { Memo, MemoValidatingError, ValidatingMemo } from './memo'
import { WatchMemo, WatchMemoError } from './watch-memo'

test('WatchMemo', () => {
  const [ get, set, watch ] = WatchMemo(Memo(0))
  expect(get()).toBe(0)

  let __watcher_is_called__ = false
  watch((changed_data) => {
    __watcher_is_called__ = true
    expect(changed_data).toBe(999)
  })

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(true)
})

test('WatchMemo remove watcher', () => {
  const [ get, set, watch ] = WatchMemo(Memo(0))

  let __watcher_is_called__ = false
  const cancelWatch = watch(() => {
    __watcher_is_called__ = true
  })

  cancelWatch()

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(false)
})

test('WatchMemo cannot set memo in watcher', () => {
  const [ get, set, watch ] = WatchMemo(Memo(0))

  const beforeConsole = console

  watch(() => {
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
  const [get, set, watch] = WatchMemo(Memo(0))
  let changed = 0
  watch(() => {
    changed +=1
  })

  const [, vSet] = ValidatingMemo([get, set], (v) => {
    if (v < 0) return 'failure'
  })

  expect(changed).toBe(0)

  vSet(2)
  expect(get()).toBe(2)
  expect(changed).toBe(1)

  expect(() => vSet(-222)).toThrow(MemoValidatingError)
  expect(changed).toBe(1)
})

test('watching ValidatingMemo By WatchMemo(ValidatingMemo(Memo', () => {
  const [get, set, watch] = WatchMemo(ValidatingMemo(Memo(0), (v) => {
    if (v < 0) return 'failure'
  }))

  let changed = 0
  watch(() => {
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
