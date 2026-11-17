import { ConveyorTimer } from './conveyor-timer'

describe('ConveyorTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('timeout -1 时 mount 不创建 Timer，setTimeout 后再触发', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(1000)
    expect(onTimeout).not.toHaveBeenCalled()

    timer.setTimeout(50)
    await vi.advanceTimersByTimeAsync(50)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledWith(50)
  })

  test('正数 timeout 时 mount 立即创建 Timer', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', onTimeout)

    await vi.advanceTimersByTimeAsync(50)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  test('正数改正数保留原起点', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(100)
    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(30)

    timer.setTimeout(200)
    await vi.advanceTimersByTimeAsync(170)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledWith(200)
  })

  test('setTimeout(0) 触发 0ms Timer', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.mount('a', onTimeout)
    timer.setTimeout(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  test('setTimeout(-1) 取消 Timer，之后再改成正数会重新创建', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(10)

    timer.setTimeout(-1)
    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).not.toHaveBeenCalled()

    timer.setTimeout(50)
    await vi.advanceTimersByTimeAsync(50)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledWith(50)
  })

  test('stop 后不触发，也不会被 setTimeout 补建', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', onTimeout)
    timer.stop('a')

    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).not.toHaveBeenCalled()

    timer.setTimeout(50)
    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  test('clear 取消所有 Timer 与 factory', async () => {
    const timer = ConveyorTimer<string>()
    const a = vi.fn()
    const b = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', a)
    timer.mount('b', b)

    timer.clear()
    await vi.advanceTimersByTimeAsync(100)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()

    timer.setTimeout(50)
    await vi.advanceTimersByTimeAsync(100)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  test('触发后自动删除，不会被 setTimeout 重新计时', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(50)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    timer.setTimeout(50)
    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  test('多个 id 互不影响', async () => {
    const timer = ConveyorTimer<string>()
    const a = vi.fn()
    const b = vi.fn()

    timer.setTimeout(100)
    timer.mount('a', a)
    timer.mount('b', b)
    await vi.advanceTimersByTimeAsync(50)

    timer.stop('a')
    await vi.advanceTimersByTimeAsync(60)

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  test('重复 mount 同一 id 会替换旧 Timer', async () => {
    const timer = ConveyorTimer<string>()
    const onTimeout = vi.fn()

    timer.setTimeout(50)
    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(10)

    timer.mount('a', onTimeout)
    await vi.advanceTimersByTimeAsync(50)

    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledWith(50)
  })

  test('参数校验：安全整数且 >= -1', () => {
    const timer = ConveyorTimer<string>()

    expect(() => timer.setTimeout(-2)).toThrow(RangeError)
    expect(() => timer.setTimeout(1.5)).toThrow(TypeError)
    expect(() => timer.setTimeout(NaN)).toThrow(TypeError)
    expect(() => timer.setTimeout(Infinity)).toThrow(TypeError)
    expect(() => timer.setTimeout(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError)
  })
})
