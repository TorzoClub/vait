import { Timer } from './timer'

type TimerFactory = () => void

export type ConveyorTimer<ID> = Readonly<{
  setTimeout(ms: number): void
  mount(id: ID, onTimeout: (elapsed_time: number) => void): void
  stop(id: ID): void
  clear(): void
}>

function assertTimeoutConfig(v: number) {
  if (!Number.isSafeInteger(v)) {
    throw new TypeError('timeout should be a safe integer')
  }
  if (v < -1) {
    throw new RangeError('timeout should >= -1')
  }
}

/**
 * Conveyor 的 Timer 池。
 *
 * 一个实例管理一组 (id -> Timer)，timeout 为 -1 时只登记 factory，不创建 Timer；
 * 改成非负数时再为已登记的任务补建 Timer。
 */
export function ConveyorTimer<ID>(): ConveyorTimer<ID> {
  let timeout = -1

  const timers = new Map<ID, Timer>()
  const factories = new Map<ID, TimerFactory>()

  function stop(id: ID) {
    const timer = timers.get(id)
    if (timer !== undefined) {
      timer.cancel()
      timers.delete(id)
    }
    factories.delete(id)
  }

  function clear() {
    for (const timer of timers.values()) {
      timer.cancel()
    }
    timers.clear()
    factories.clear()
  }

  function mount(id: ID, onTimeout: (elapsed_time: number) => void) {
    stop(id)

    let timer: Timer
    const createTimer = () => {
      timer = Timer(Date.now, () => {
        const elapsed_time = timer.elapsedTime()
        timers.delete(id)
        factories.delete(id)
        onTimeout(elapsed_time)
      })

      timers.set(id, timer)
      timer.set(timeout)
    }

    factories.set(id, createTimer)

    if (timeout >= 0) {
      createTimer()
    }
  }

  function setTimeoutTime(ms: number) {
    assertTimeoutConfig(ms)
    timeout = ms

    if (ms < 0) {
      for (const timer of timers.values()) {
        timer.cancel()
      }
      timers.clear()
      return
    }

    for (const [id, createTimer] of [...factories]) {
      const timer = timers.get(id)
      if (timer !== undefined) {
        timer.set(ms)
      } else {
        createTimer()
      }
    }
  }

  return {
    setTimeout: setTimeoutTime,
    mount,
    stop,
    clear,
  }
}
