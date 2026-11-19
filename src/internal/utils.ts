export const removeByItem = <T>(list: T[], remove_item: T) =>
  list.filter((item) => item !== remove_item)

export type ID<T, DistinctName> = T & { __TYPE__: DistinctName }

function removeByIndex<T>(list: T[], index: number) {
  return list.filter((_, idx) => {
    return idx !== index
  })
}

export function removeItem<T>(
  list: T[],
  removeCallback: (value: T, index: number, obj: T[]) => boolean
): readonly [number, T[]] {
  const finded_idx = list.findIndex(removeCallback)
  return [finded_idx, (finded_idx === -1) ? list : removeByIndex(list, finded_idx)]
}

export function getWeakMapItem<K extends WeakKey, T>(
  weakmap: WeakMap<K, T>,
  key: K,
  createDefault: () => T
) {
  const weakmap_item = weakmap.get(key)
  if (weakmap_item === undefined) {
    const new_item = createDefault()
    weakmap.set(key, new_item)
    return new_item
  } else {
    return weakmap_item
  }
}

export function weakMapItemIfExist<K extends WeakKey, T>(
  weakmap: WeakMap<K, T>,
  key: K,
  ifExistFn: (item: T) => void
) {
  const weakmap_item = weakmap.get(key)
  if (weakmap_item !== undefined) {
    ifExistFn(weakmap_item)
  }
}
