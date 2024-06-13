import { Memo, WithValidating } from './memo'
import { Wait } from './wait'

const NONE_ERROR = Symbol('NONE_ERROR')

type ConcurrencyNumber = {
  get(): number;
  set(v: number): void
  memo: Memo<number>
}

concurrency.Number = (v: number): ConcurrencyNumber => {
  const memo = WithValidating(Memo(v), v => {
    if (v < 1) {
      throw new RangeError('concurrent_limit should >= 1')
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

export async function concurrency<T>(
  MaxConcurrency: ConcurrencyNumber | number,
  iterator: IterableIterator<T>,
  asyncFn: (item: T, idx: number) => Promise<void>
): Promise<void> {
  if (typeof MaxConcurrency === 'number') {
    return concurrency(concurrency.Number(MaxConcurrency), iterator, asyncFn)
  }

  const [ getMaxConcurrency ] = MaxConcurrency.memo

  let current_concurrency = 0
  let __idx = 0
  let error_info: (typeof NONE_ERROR) | Exclude<unknown, typeof NONE_ERROR> = NONE_ERROR
  const [ waiting, done ] = Wait()
  let result: IteratorResult<T, void>
  const cancelWatch = Memo.watch(MaxConcurrency.memo, callConcurrent)

  function after() {
    if (error_info === NONE_ERROR) {
      current_concurrency -= 1
      if (
        (result.done) &&
        (current_concurrency === 0)
      ) {
        done()
      } else {
        callConcurrent()
      }
    }
  }

  function onError(error: unknown) {
    if (error_info === NONE_ERROR) {
      error_info = error
      done()
    }
  }

  callConcurrent()
  function callConcurrent() {
    while (
      (current_concurrency < getMaxConcurrency()) &&
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
      cancelWatch && cancelWatch()
      if (error_info !== NONE_ERROR) {
        throw error_info
      }
    })
  )
}
