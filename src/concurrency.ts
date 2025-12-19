import { Memo, WithValidating } from './memo'
import { nextTick } from './next-tick';
import { Wait } from './wait'

const NONE_ERROR = Symbol('NONE_ERROR')

export type ConcurrencyValve = {
  get(): number;
  set(v: number): void
  memo: Memo<number>
}

concurrency.Valve = (v: number): ConcurrencyValve => {
  const memo = WithValidating(Memo(v), v => {
    if (v < 0) {
      throw new RangeError('concurrent_limit should >= 0')
    } else if (!Number.isInteger(v)) {
      if (v !== Infinity) {
        throw new TypeError('concurrent_limit should be integer')
      }
    }
  })

  return {
    get: Memo.getGetter(memo),
    set: Memo.getSetter(memo),
    memo,
  }
}

concurrency.each = <T>(
  valve: ConcurrencyValve | number,
  list: Array<T>,
  asyncFn: (item: T, idx: number, list: T[]) => Promise<void>
) => (
  concurrency(
    valve,
    list[Symbol.iterator](),
    (item, idx) => asyncFn(item, idx, list)
  )
)

export async function concurrency<T>(
  valOrNum: ConcurrencyValve | number,
  iterator: IterableIterator<T>,
  asyncFn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  if (typeof valOrNum === 'number') {
    return concurrencyWithValve(concurrency.Valve(valOrNum), iterator, asyncFn)
  } else {
    return concurrencyWithValve(valOrNum, iterator, asyncFn)
  }
}

function concurrencyWithValve<T>(
  valve: ConcurrencyValve,
  iterator: IterableIterator<T>,
  asyncFn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  let current_concurrency = 0
  let __idx = 0
  let error_info: (typeof NONE_ERROR) | Exclude<unknown, typeof NONE_ERROR> = NONE_ERROR
  const [ waiting, done ] = Wait()
  let result: IteratorResult<T, void>
  const cancelWatch = Memo.watch(valve.memo, () => {
    nextTick().then(run)
  })

  function after() {
    if (error_info === NONE_ERROR) {
      current_concurrency -= 1
      if (
        (result.done) &&
        (current_concurrency === 0)
      ) {
        done()
      } else {
        run()
      }
    }
  }

  function onError(error: unknown) {
    if (error_info === NONE_ERROR) {
      error_info = error
      done()
    }
  }

  run()
  function run() {
    while (
      (current_concurrency < valve.get()) &&
      (!result || !result?.done)
    ) {
      current_concurrency += 1

      result = iterator.next()
      if (result.done) {
        after()
      } else {
        const item = result.value
        const current_idx = __idx
        __idx += 1

        asyncFn(item, current_idx)
          .then(after)
          .catch(onError)
      }
    }
  }

  return (
    waiting.then(() => {
      cancelWatch()
      if (error_info !== NONE_ERROR) {
        throw error_info
      }
    })
  )
}
