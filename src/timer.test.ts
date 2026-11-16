import { timeout } from './timeout'
import { PromiseTimer, Timer } from './timer'

test('timer', async () => {
  let value: number | undefined = undefined

  Timer(100, () => {
    value = 999
  })

  expect( value ).toBe( undefined )

  await timeout(200)

  expect( value ).toBe( 999 )
})

test('timer timing', async () => {
  const start_time = Date.now()
  let end_time = start_time
  Timer(1000, () => {
    end_time = Date.now()
  })
  await timeout(1500)
  const time_difference = end_time - start_time
  expect(time_difference).toBeGreaterThanOrEqual(999)
})

test('timer cancel', async () => {
  let value = 0
  const cancelTimer = Timer(25, () => {
    value = 9
  })
  cancelTimer()

  await timeout(100)

  expect(value).toBe(0)
})

describe('PromiseTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const neverSettle = () => new Promise<void>(() => {})

  test('初始 -1 不启用定时器', async () => {
    const timer = PromiseTimer(-1)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    await vi.advanceTimersByTimeAsync(1000)

    expect(onTimeout).not.toHaveBeenCalled()
    cancel()
  })

  test('0 是 0ms 计时', async () => {
    const timer = PromiseTimer(0)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    await vi.advanceTimersByTimeAsync(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    cancel()
  })

  test('-1 会取消已运行的定时器', async () => {
    const timer = PromiseTimer(50)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    await vi.advanceTimersByTimeAsync(10)
    timer.setTime(-1)
    await vi.advanceTimersByTimeAsync(100)

    expect(onTimeout).not.toHaveBeenCalled()
    cancel()
  })

  test('setTime 动态调整，并从挂载时刻计算 elapsed', async () => {
    const timer = PromiseTimer(-1)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    timer.setTime(50)
    await vi.advanceTimersByTimeAsync(50)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout.mock.calls[0][0]).toBeGreaterThanOrEqual(50)
    cancel()
  })

  test('setTime(0) 会重挂 0ms 定时器', async () => {
    const timer = PromiseTimer(50)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    await vi.advanceTimersByTimeAsync(10)
    timer.setTime(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    cancel()
  })

  test('取消函数阻止超时', async () => {
    const timer = PromiseTimer(50)
    const onTimeout = vi.fn()
    const cancel = timer.mount(neverSettle(), onTimeout)

    cancel()
    await vi.advanceTimersByTimeAsync(100)

    expect(onTimeout).not.toHaveBeenCalled()
  })

  test('promise 结算后自动取消定时器', async () => {
    const timer = PromiseTimer(50)
    const onTimeout = vi.fn()
    let resolve!: () => void
    const promise = new Promise<void>(r => { resolve = r })
    timer.mount(promise, onTimeout)

    resolve()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)

    expect(onTimeout).not.toHaveBeenCalled()
  })

  test('校验：安全整数且 >= -1，else TypeError/RangeError', () => {
    expect(() => PromiseTimer(Infinity)).toThrow(TypeError)
    expect(() => PromiseTimer(-2)).toThrow(RangeError)
    expect(() => PromiseTimer(-1.5)).toThrow(TypeError)
    expect(() => PromiseTimer(1.5)).toThrow(TypeError)

    const timer = PromiseTimer(-1)

    expect(() => timer.setTime(Infinity)).toThrow(TypeError)
    expect(() => timer.setTime(-2)).toThrow(RangeError)
    expect(() => timer.setTime(-1.5)).toThrow(TypeError)
    expect(() => timer.setTime(1.5)).toThrow(TypeError)

    expect(timer.getTime()).toBe(-1)
    timer.setTime(0)
    expect(timer.getTime()).toBe(0)
    timer.setTime(100)
    expect(timer.getTime()).toBe(100)
  })
})
