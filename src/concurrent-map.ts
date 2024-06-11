import { concurrentEach } from './concurrent-each'
import { Memo } from './memo'

export function concurrentMap<T, NT>(
  __CONCURRENT_LIMIT: number,
  list: T[],
  asyncFn: (item: T, idx: number, total: T[]) => Promise<NT>,
): Promise<NT[]> {
  if (list.length === 0) {
    return Promise.resolve([])
  } else {
    const new_list: NT[] = []
    return (
      concurrentEach(
        Memo(__CONCURRENT_LIMIT),
        list[Symbol.iterator](),
        async (item, idx) => {
          new_list[idx] = await asyncFn(item, idx, list)
        }
      ).then(() => new_list)
    )
  }
}
