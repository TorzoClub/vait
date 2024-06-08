import { concurrentEach } from "./concurrent-each"

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
      concurrentEach(__CONCURRENT_LIMIT, list, async (item, idx, total) => {
        new_list[idx] = await asyncFn(item, idx, total)
      })
      .then(() => new_list)
    )
  }
}
