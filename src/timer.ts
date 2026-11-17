import { Memo } from './memo'

export type TimerState = 'idle' | 'running' | 'canceled' | 'fired'

export type Timer = Readonly<{
  set(ms: number): void
  cancel(): void
  countdown(): number
  elapsedTime(): number
}>

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
  const [getState, setState] = Memo<TimerState>('idle')
  const [getStartTime, setStartTime] = Memo<number>(0)
  const [getTotalTime, setTotalTime] = Memo<number>(0)
  const [getTimerHandle, setTimerHandle] = Memo<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [getFrozenElapsedTime, setFrozenElapsedTime] = Memo<number>(0)
  const [getFrozenCountdown, setFrozenCountdown] = Memo<number>(0)

  const calcElapsedTime = () => clock() - getStartTime()

  const calcCountdown = () => Math.max(0, getTotalTime() - calcElapsedTime())

  function clearTimer() {
    if (getTimerHandle() !== undefined) {
      clearTimeout(getTimerHandle())
      setTimerHandle(undefined)
    }
  }

  function freeze() {
    if (getState() === 'idle') {
      setFrozenElapsedTime(0)
      setFrozenCountdown(Infinity)
    } else if (getState() === 'running') {
      setFrozenElapsedTime(calcElapsedTime())
      setFrozenCountdown(calcCountdown())
    }
  }

  function fire() {
    if (getState() === 'running') {
      freeze()
      setState('fired')
      setFrozenCountdown(0)
      onTimeout()
    }
  }

  function schedule(ms: number) {
    clearTimer()
    setTimerHandle(setTimeout(fire, ms))
  }

  return {
    set(ms: number) {
      assertTimerDuration(ms)

      switch (getState()) {
        case 'canceled':
          throw new Error('Timer has been canceled')
        case 'fired':
          throw new Error('Timer has already fired')
        case 'idle':
          setState('running')
          setStartTime(clock())
          setTotalTime(ms)
          schedule(ms)
        default:
          // running: keep the original start_time, only change the total duration
          setTotalTime(ms)

          if (ms === 0) {
            schedule(0)
          } else {
            const remaining_time = ms - calcElapsedTime()
            if (remaining_time > 0) {
              schedule(remaining_time)
            } else {
              clearTimer()
              fire()
            }
          }
      }
    },
    cancel() {
      if ((getState() !== 'canceled') && (getState() !== 'fired') ) {
        freeze()
        clearTimer()
        setState('canceled')
      }
    },
    countdown() {
      switch (getState()) {
        case 'running':
          return calcCountdown()
        case 'canceled':
          return getFrozenCountdown()
        case 'fired':
          return 0
        case 'idle':
          return Infinity
        default:
          throw new Error(`unknown state: ${getState()}`)
      }
    },
    elapsedTime() {
      switch (getState()) {
        case 'running':
          return calcElapsedTime()
        case 'canceled':
        case 'fired':
          return getFrozenElapsedTime()
        case 'idle':
          return 0
        default:
          throw new Error(`unknown state: ${getState()}`)
      }
    },
  }
}
