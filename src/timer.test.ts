import { Timer } from './timer'

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('idle：countdown 为 Infinity，elapsedTime 为 0', () => {
    const timer = Timer(Date.now, () => {})

    expect(timer.countdown()).toBe(Infinity)
    expect(timer.elapsedTime()).toBe(0)
  })

  test('idle 时 cancel：冻结 Infinity / 0，之后 set 报错', () => {
    const timer = Timer(Date.now, () => {})

    timer.cancel()

    expect(timer.countdown()).toBe(Infinity)
    expect(timer.elapsedTime()).toBe(0)
    expect(() => timer.set(100)).toThrow(Error)
  })

  test('set 后按经过时间计算 countdown / elapsedTime', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(100)
    await vi.advanceTimersByTimeAsync(40)

    expect(timer.elapsedTime()).toBe(40)
    expect(timer.countdown()).toBe(60)
    expect(onTimeout).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(timer.elapsedTime()).toBe(100)
    expect(timer.countdown()).toBe(0)
  })

  test('第二次 set 保留原起点，只改总时长', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(100)
    await vi.advanceTimersByTimeAsync(30)
    timer.set(200)

    expect(timer.elapsedTime()).toBe(30)
    expect(timer.countdown()).toBe(170)

    await vi.advanceTimersByTimeAsync(170)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(timer.elapsedTime()).toBe(200)
    expect(timer.countdown()).toBe(0)
  })

  test('set(0) 触发 0ms 定时器', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(timer.countdown()).toBe(0)
  })

  test('running 时 set(0) 会重挂 0ms 定时器', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(100)
    await vi.advanceTimersByTimeAsync(10)
    timer.set(0)

    expect(timer.elapsedTime()).toBe(10)
    expect(timer.countdown()).toBe(0)

    await vi.advanceTimersByTimeAsync(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(timer.countdown()).toBe(0)
  })

  test('cancel 冻结 elapsedTime / countdown，且之后 set 报错', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(100)
    await vi.advanceTimersByTimeAsync(20)
    timer.cancel()

    expect(timer.elapsedTime()).toBe(20)
    expect(timer.countdown()).toBe(80)

    await vi.advanceTimersByTimeAsync(100)

    expect(onTimeout).not.toHaveBeenCalled()
    expect(timer.elapsedTime()).toBe(20)
    expect(timer.countdown()).toBe(80)
    expect(() => timer.set(100)).toThrow(Error)

    expect(() => timer.cancel()).not.toThrow()
  })

  test('onTimeout 之后 elapsedTime / countdown 冻结，set 报错', async () => {
    const onTimeout = vi.fn()
    const timer = Timer(Date.now, onTimeout)

    timer.set(100)
    await vi.advanceTimersByTimeAsync(100)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(timer.countdown()).toBe(0)
    expect(timer.elapsedTime()).toBe(100)
    expect(() => timer.set(100)).toThrow(Error)

    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  test('参数校验：只接受非负安全整数', () => {
    const timer = Timer(Date.now, () => {})

    expect(() => timer.set(-1)).toThrow(RangeError)
    expect(() => timer.set(1.5)).toThrow(TypeError)
    expect(() => timer.set(NaN)).toThrow(TypeError)
    expect(() => timer.set(Infinity)).toThrow(TypeError)
    expect(() => timer.set(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError)
  })

  test('使用注入的 clock 计算 elapsed / countdown', () => {
    let now = 1000
    const timer = Timer(() => now, () => {})

    timer.set(100)
    now += 40

    expect(timer.elapsedTime()).toBe(40)
    expect(timer.countdown()).toBe(60)

    timer.cancel()
    now += 1000

    expect(timer.elapsedTime()).toBe(40)
    expect(timer.countdown()).toBe(60)
  })
})
