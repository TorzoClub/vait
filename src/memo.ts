import { removeByItem } from './utils'

type TypedFunc<type, fn> = fn & {
  type: type
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TypedFunc<T, R, Fn extends ((...args: any[]) => R)>(type: T, fn: Fn): TypedFunc<T, Fn> {
  return Object.assign(fn, { type })
}

export type MemoGetter<D> = TypedFunc<'getter', () => D>
export type MemoSetter<D> = TypedFunc<'setter', (d: D) => void>
type MemoBefore<D> = TypedFunc<'before', (d: D) => void>
type MemoAfter<D> = TypedFunc<'after', (d: D) => void>

export type Memo<D> = [MemoGetter<D>, MemoSetter<D>, ...(MemoBefore<D> | MemoAfter<D>)[]]

export const Memo = <D>(data: D): Memo<D> => {
  const setter = TypedFunc('setter', (new_data: D) => {
    if (arr.length !== 2) {
      arr.forEach(fn => {
        if (fn.type === 'before') {
          fn(new_data)
        }
      })
    }

    data = new_data

    if (arr.length !== 2) {
      for (const fn of arr) {
        if (fn.type === 'after') {
          fn(new_data)
        }
      }
    }
  })

  const arr = [
    TypedFunc('getter', () => data),
    setter,
  ] as Memo<D>
  return arr
}

export class MemoValidatingError extends Error { }

function resetMemo<D>(memo: Memo<D>, new_memo: Memo<D>) {
  memo.splice(0, memo.length)
  for (const fn of new_memo) {
    memo.push( fn )
  }
}

Memo.appendValidating = <D>(memo: Memo<D>, validator: (i: D) => void | string) => {
  const fn = TypedFunc('before', (new_val: D) => {
    validating(new_val, validator)
  }) as TypedFunc<'before', (d: D) => void>

  const [getData] = memo
  fn(getData())

  memo.push(fn)
  return () => resetMemo(memo, removeByItem(memo, fn) as Memo<D>)
}

function validating<D>(val: D, validator: (i: D) => void | string) {
  const res = validator(val)
  if (res !== undefined) {
    throw new MemoValidatingError(res)
  }
}

export const WithValidating = <D>(
  memo: Memo<D>,
  validator: (i: D) => void | string
) => {
  Memo.appendValidating(memo, validator)
  return memo
}

Memo.watch = <D>(memo: Memo<D>, handler: (i: D) => void) => {
  const [isRunning, setRunning] = Memo(false)

  const beforeFn = TypedFunc('before', () => {
    if (isRunning()) {
      setRunning(false)
      throw new WatchMemoError('cannot change memo in watcher')
    } else {
      setRunning(true)
    }
  }) as TypedFunc<'before', (d: D) => void>

  const fn = TypedFunc('after', (new_val: D) => {
    handler(new_val)
    setRunning(false)
  }) as TypedFunc<'after', (d: D) => void>

  memo.push(beforeFn)
  memo.push(fn)

  return () => {
    resetMemo(memo, removeByItem(removeByItem(memo, fn), beforeFn) as Memo<D>)
  }
}

export class WatchMemoError extends Error {}
