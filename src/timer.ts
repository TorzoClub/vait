export type Timer = Readonly<{
  set(ms: number): void
  cancel(): void
  countdown(): number
  elapsedTime(): number
}>

type TimerState = 'idle' | 'running' | 'canceled' | 'fired'

function assertTimerDuration(ms: number) {
  if (!Number.isSafeInteger(ms)) {
    throw new TypeError('timer duration should be a safe integer')
  } else if (ms < 0) {
    throw new RangeError('timer duration should >= 0')
  }
}

export function Timer(
  clock: () => number,
  onTimeout: () => void,
): Timer {
  let state: TimerState = 'idle'
  let start_time = 0
  let total_time = 0
  let timer_handle: ReturnType<typeof setTimeout> | undefined
  let frozen_elapsed_time = 0
  let frozen_countdown = Infinity

  function elapsedNow() {
    return clock() - start_time
  }

  function countdownNow() {
    return Math.max(0, total_time - elapsedNow())
  }

  function clearTimer() {
    if (timer_handle !== undefined) {
      clearTimeout(timer_handle)
      timer_handle = undefined
    }
  }

  function freeze() {
    if (state === 'idle') {
      frozen_elapsed_time = 0
      frozen_countdown = Infinity
    } else if (state === 'running') {
      frozen_elapsed_time = elapsedNow()
      frozen_countdown = countdownNow()
    }
  }

  function fire() {
    if (state !== 'running') { return }
    freeze()
    state = 'fired'
    frozen_countdown = 0
    onTimeout()
  }

  function schedule(ms: number) {
    clearTimer()
    timer_handle = setTimeout(fire, ms)
  }

  function set(ms: number) {
    assertTimerDuration(ms)

    if (state === 'canceled') {
      throw new Error('Timer has been canceled')
    }
    if (state === 'fired') {
      throw new Error('Timer has already fired')
    }

    if (state === 'idle') {
      state = 'running'
      start_time = clock()
      total_time = ms
      schedule(ms)
      return
    }

    // running: keep the original start_time, only change the total duration
    total_time = ms

    if (ms === 0) {
      schedule(0)
      return
    }

    const remaining_time = ms - elapsedNow()
    if (remaining_time > 0) {
      schedule(remaining_time)
    } else {
      clearTimer()
      fire()
    }
  }

  function cancel() {
    if (state === 'canceled' || state === 'fired') { return }
    freeze()
    clearTimer()
    state = 'canceled'
  }

  return {
    set,
    cancel,
    countdown() {
      if (state === 'running') { return countdownNow() }
      if (state === 'canceled') { return frozen_countdown }
      if (state === 'fired') { return 0 }
      return Infinity
    },
    elapsedTime() {
      if (state === 'running') { return elapsedNow() }
      if (state === 'canceled' || state === 'fired') {
        return frozen_elapsed_time
      }
      return 0
    },
  }
}
