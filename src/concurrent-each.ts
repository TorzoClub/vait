import { Memo, ChangedSignal, WithValidating } from './memo'
import { Wait } from './wait'

const NONE_ERROR = Symbol('NONE_ERROR')

export async function concurrentEach<T>(
  init_max_concurrent: number,
  iterator: IterableIterator<T>,
  asyncFn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  const [MaxConcurrentMemo, watch] = ChangedSignal(
    WithValidating(Memo(init_max_concurrent), v => {
      if (v < 1) {
        throw new RangeError('concurrent_limit should >= 1')
      } else if (!Number.isInteger(v)) {
        throw new TypeError('concurrent_limit should be integer')
      }
    })
  )

  const [ getMaxConcurrent ] = MaxConcurrentMemo

  let current_concurrent = 0
  let __idx = 0
  let error_info: (typeof NONE_ERROR) | Exclude<unknown, typeof NONE_ERROR> = NONE_ERROR
  const [ waiting, done ] = Wait()

  let result: IteratorResult<T, void>

  function after() {
    if (error_info === NONE_ERROR) {
      current_concurrent -= 1
      if (
        (result.done) &&
        (current_concurrent === 0)
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

  const cancelWatch = watch(() => {
    callConcurrent()
  })

  callConcurrent()
  function callConcurrent() {
    while (
      (current_concurrent < getMaxConcurrent()) &&
      (!result || !result?.done)
    ) {
      current_concurrent += 1

      result = iterator.next()
      if (result.done) {
        after()
      } else {
        const item = result.value
        const current_idx = __idx
        ++__idx

        asyncFn(item, current_idx)
          .then(after)
          .catch(onError)
      }
    }
  }

  return waiting.then(() => {
    cancelWatch()
    if (error_info !== NONE_ERROR) {
      throw error_info
    }
  })
}
