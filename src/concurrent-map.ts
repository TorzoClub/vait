import { ConcurrencyNumber, concurrency } from './concurrency'

export function concurrentMap<T, NT>(
  conccurrencyNumber: ConcurrencyNumber | number,
  list: T[],
  asyncFn: (item: T, idx: number, total: T[]) => Promise<NT>,
): Promise<NT[]> {
  if (list.length === 0) {
    return Promise.resolve([])
  } else {
    const new_list: NT[] = []
    return concurrency.each(
      conccurrencyNumber,
      list,
      async (item, idx) => {
        new_list[idx] = await asyncFn(item, idx, list)
      }
    ).then(() => new_list)
  }
}
