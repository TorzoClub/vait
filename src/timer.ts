import { Memo, WithValidating } from './memo'

export type CancelTimer = () => void

export function Timer(ms: number, fn: () => void): CancelTimer {
  const handler = setTimeout(fn, ms)
  return () => clearTimeout(handler)
}

export type PromiseTimer = Readonly<{
  getTime(): number
  setTime(t: number): void
  mount(
    promise: Promise<unknown>,
    onTimeout: (elapsed_time: number) => void,
  ): CancelTimer
}>

type TimerHandle =
  | { scene: 'unset' }
  | { scene: 'set', handler: ReturnType<typeof setTimeout> }

function validateTimeoutValue(v: number) {
  if (!Number.isSafeInteger(v)) {
    throw new TypeError('timeout should be a safe integer')
  }
  if (v < -1) {
    throw new RangeError('timeout should >= -1')
  }
}

function setTimeoutWrap(callback: () => void, time: number): TimerHandle {
  if (time < 0) {
    return { scene: 'unset' }
  } else {
    const handler = setTimeout(callback, time)
    return { scene: 'set', handler }
  }
}

export function PromiseTimer(initial: number): PromiseTimer {
  const timeMemo = WithValidating(Memo(initial), validateTimeoutValue)
  const [getTime, setTime] = timeMemo

  return {
    getTime,
    setTime,
    mount(promise, onTimeout) {
      const init_time = Date.now()
      let $timer: TimerHandle = { scene: 'unset' }
      let $is_timeout = false
      let cancelTimeMemoWatcher: CancelTimer = () => {}

      function unschedule() {
        if ($timer.scene === 'set') {
          clearTimeout($timer.handler)
          $timer = { scene: 'unset' }
        }
      }

      function fire() {
        if ($is_timeout) { return }
        $is_timeout = true
        unschedule()
        cancelTimeMemoWatcher()
        onTimeout(Date.now() - init_time)
      }

      function cancel() {
        unschedule()
        cancelTimeMemoWatcher()
      }

      function schedule(time: number) {
        unschedule()
        $timer = setTimeoutWrap(fire, time)
      }

      const initial_time = getTime()
      if (initial_time >= 0) {
        schedule(initial_time)
      }

      promise.finally(cancel).catch(() => {})

      cancelTimeMemoWatcher = Memo.watch(timeMemo, (new_time) => {
        if ($is_timeout) { return }
        if (new_time < 0) {
          unschedule()
          return
        }
        if (new_time === 0) {
          schedule(0)
          return
        }
        const elapsed_time = Date.now() - init_time
        const remaining_time = new_time - elapsed_time
        if (remaining_time > 0) {
          schedule(remaining_time)
        } else {
          fire()
        }
      })

      return cancel
    },
  }
}
