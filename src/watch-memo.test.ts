import { WatchMemo } from "./watch-memo"

test('WatchMemo', () => {
  const [ get, set, watch ] = WatchMemo(0)
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
  const [ get, set, watch ] = WatchMemo(0)

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
  const [ get, set, watch ] = WatchMemo(0)

  const beforeConsole = console

  watch(() => {
    expect(() => {
      set(10000)
    }).toThrow()
  })
  set(9)

  expect(get()).toBe(9)

  global.console = beforeConsole
})
