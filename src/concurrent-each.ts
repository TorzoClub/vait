import { Wait } from './wait'

const NONE_ERROR = Symbol('NONE_ERROR')

export async function concurrentEach<T>(
  __CONCURRENT_LIMIT: number,
  list: T[],
  asyncFn: (item: T, idx: number, total: T[]) => Promise<void>,
): Promise<void> {
  if (__CONCURRENT_LIMIT < 1) {
    throw new RangeError('concurrent_limit should >= 1')
  } else if (!Number.isInteger(__CONCURRENT_LIMIT)) {
    throw new TypeError('concurrent_limit should be integer')
  } else if (list.length === 0) {
    return undefined
  }

  let current_concurrent = 0
  let __idx = 0
  let successes = 0
  let error_info: (typeof NONE_ERROR) | Exclude<unknown, typeof NONE_ERROR> = NONE_ERROR
  const [ waiting, done ] = Wait()

  iterate()
  function iterate() {
    for (; current_concurrent < __CONCURRENT_LIMIT; ++current_concurrent) {
      if (__idx < list.length) {
        (async (current_idx: number) => {
          try {
            await asyncFn( list[current_idx], current_idx, list )
            if (error_info === NONE_ERROR) {
              successes += 1
              current_concurrent -= 1
              if (successes === list.length) {
                done()
              } else {
                iterate()
              }
            }
          } catch (error) {
            if (error_info === NONE_ERROR) {
              error_info = error
              done()
            }
          }
        })(__idx)
        __idx += 1
      }
    }
  }

  return waiting.then(() => {
    if (error_info !== NONE_ERROR) {
      throw error_info
    }
  })
}
