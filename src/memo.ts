import { Signal } from './signal'
import { ID, removeByItem } from './utils'

type FuncType = 'getter' | 'setter' | 'before' | 'after'

type Func<D, R> = (d: D) => R

type TypedFunc<
  type extends FuncType,
  D,
  R
> = { type: type } & Func<D, R>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TypedFunc<T extends FuncType, D, R>(
  type: T,
  fn: Func<D, R>
) {
  return Object.assign(fn, { type })
}

export type MemoGetter<D> = TypedFunc<'getter', void, D>
export type MemoSetter<D> = TypedFunc<'setter', D, void>
type MemoBefore<D> = TypedFunc<'before', D, void>
type MemoAfter<D> = TypedFunc<'after', D, void>

export type MemoLike<D> = [ MemoGetter<D>, MemoSetter<D>, ...Array<MemoBefore<D> | MemoAfter<D>> ]
export type Memo<D> = ID<MemoLike<D>, 'memo'>

// type TypeMemo = [ MemoGetter<D> ]

export class MemoError extends Error { }

export const Memo = <D>(data: D): Memo<D> => {
  let is_running = false
  const setter = TypedFunc('setter', (new_data: D) => {
    if (is_running) {
      throw new MemoError('can\'t setData in hooks')
    } else {
      is_running = true
    }

    const source_data = data

    try {
      const after_fns: MemoAfter<D>[] = []

      if (arr.length !== 2) {
        for (let i = 0; i < arr.length; ++i) {
          const fn = arr[i]
          if (fn.type === 'before') {
            fn(new_data)
          } else if (fn.type === 'after') {
            after_fns.push(fn)
          }
        }
      }

      data = new_data

      for (let i = 0; i < after_fns.length; ++i) {
        after_fns[i](new_data)
      }
    } catch (err) {
      data = source_data
      throw err
    } finally {
      is_running = false
    }
  })

  const arr = [
    TypedFunc('getter', () => data),
    setter,
  ] as Memo<D>

  return arr
}
Memo.getGetter = <D>(m: MemoLike<D>) => m[0]
Memo.getSetter = <D>(m: MemoLike<D>) => m[1]
Memo.value = <D>(m: MemoLike<D>) => Memo.getGetter(m)()
Memo.change = <D>(m: MemoLike<D>, value: D) => Memo.getSetter(m)(value)

function overwriteMemo<D>(memo: Memo<D>, new_memo: MemoLike<D>) {
  memo.splice(0, memo.length)
  for (const fn of new_memo) {
    memo.push( fn )
  }
}

function initValidator<D>(validator: (i: D) => void | string) {
  return (val: D) => {
    const res = validator(val)
    if (res !== undefined) {
      throw new MemoError(`validating failure: ${res}`)
    }
  }
}

export function appendTypedFunc<D>(
  memo: Memo<D>,
  typedFunc: MemoBefore<D> | MemoAfter<D>,
) {
  const removeTypedFunc = () => overwriteMemo(memo, removeByItem(memo, typedFunc) as Memo<D>)
  memo.push(typedFunc)
  return removeTypedFunc
}

Memo.addValidator = <D>(memo: Memo<D>, validator: (i: D) => void | string) => {
  const validatingFn = TypedFunc('before', initValidator(validator))
  const removeValidator = appendTypedFunc(memo, validatingFn)

  try {
    validatingFn(Memo.value(memo))
  } catch (err) {
    removeValidator()
    throw err
  }

  return removeValidator
}

Memo.watch = <D>(memo: Memo<D>, changedCallback: (i: D) => void) => {
  return appendTypedFunc(memo, TypedFunc('after', changedCallback))
}

Memo.forward = <D>(from: Memo<D>, to: MemoLike<D>) => {
  Memo.change(to, Memo.value(from))
  const cancelForward = Memo.watch(from, Memo.getSetter(to))
  return cancelForward
}

export const WithValidating = <D>(
  memo: MemoLike<D>,
  validator: (i: D) => void | string
) => {
  const validate = initValidator(validator)

  validate( Memo.value(memo) )

  const new_memo = Memo<D>(Memo.value(memo))
  Memo.addValidator(new_memo, validate)
  Memo.forward(new_memo, memo)

  return new_memo
}

export const ChangedSignal = <D>(
  observer_memo: MemoLike<D>
) => {
  const changed_signal = Signal<D>()

  const watchingMemo = Memo<D>( Memo.value(observer_memo) )
  Memo.forward(watchingMemo, observer_memo)
  Memo.watch(watchingMemo, changed_signal.triggerCareError)

  return [watchingMemo, changed_signal.receive] as const
}
