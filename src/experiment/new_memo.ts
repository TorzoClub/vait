import { Signal } from '../signal'

class MemoError extends Error { }
class ValidatorError extends Error { }
class MemoValidationError extends Error { }

type Memo<D> = {
  value: () => D,
  change: (new_data: D) => void,
  map: <R>(fn: (d: D) => R) => Memo<R>,
  ap: <R>(mfn: Memo<(d: D) => R>) => Memo<R>,
}
type MemoSpreaded<D> = readonly [() => D, (new_data: D) => void, Memo<D>]

export function MemoSpreaded<D>(data: D): MemoSpreaded<D> {
  const m = Memo(data)
  return [ m.value, m.change, m ]
}

export function Memo<D>(data: D): Memo<D> {
  return {
    value: () => data,
    change: (new_data: D) => { data = new_data },
    map: <R>(fn: (d: D) => R): Memo<R> => Memo(fn(data)),
    ap: <R>(mfn: Memo<(d: D) => R>): Memo<R> => mfn.map(fn => fn(data)),
  }
}


type ReactiveMemo<D> = readonly [
  () => D,
  (new_data: D) => void,
  Signal<D>,
  Signal<D>,
]

function LifeCycleMemo<D>(m: Memo<D>, before: (new_data: D) => void, after: () => void) {
  const [isRunning, runningState] = MemoSpreaded(false)
  return [ m.value, (new_data: D) => {
    if (isRunning()) {
      throw new MemoError('can\'t setData in hooks')
    } else {
      runningState(true)
    }

    try {
      before(new_data)
      m.change(new_data)
      after()
    } finally {
      runningState(false)
    }
  } ] as const
}

export function ReactiveMemo<D>(_m: Memo<D>) {
  const sig_will_change = Signal<D>()
  const sig_changed = Signal<D>()

  const rm = LifeCycleMemo(_m, (new_data) => {
    try {
      sig_will_change.triggerCareError(new_data)
    } catch (cause) {
      if (cause instanceof ValidatorError) {
        throw new TypeError(`validator error: ${cause.message}`, { cause })
      } else {
        throw new MemoValidationError(`validating failure: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
      }
    }
  }, () => sig_changed.trigger(_m.value()))

  return [
    rm[0],
    rm[1],
    sig_will_change,
    sig_changed,
  ] as const
}

export function ForwardReactiveMemo<D>(from: ReactiveMemo<D>, to: Memo<D>) {
  const [, , , sig_changed] = from
  return sig_changed.receive(to.change)
}

export function WatchReactiveMemo<D>(m: ReactiveMemo<D>, on_change: (new_data: D) => void) {
  const [, , , sig_changed] = m
  const cancel_watch = sig_changed.receive(on_change)
  return cancel_watch
}

type ValidatorReturnValue = void | null | string
type Validator = <D>(new_data: D) => ValidatorReturnValue | Promise<ValidatorReturnValue>

export function ValidateReactiveMemo<D>(m: ReactiveMemo<D>, validator: Validator) {
  const [, , sig_will_change,] = m
  const cancelValidate = sig_will_change.receive(async (new_data) => {
    const res = await validator(new_data)
    if (typeof res === 'string') {
      throw new ValidatorError(res)
    }
  })
  return cancelValidate
}
