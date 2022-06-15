
export function Context<
  Keys extends string | number | symbol,
  Values,
  Pool extends Readonly<Record<Keys, Values>>
>(preset: Pool) {
  const pool: Pool = Object.assign(
    Object.create(null),
    preset
  )

  function exist<K extends Keys>(key: K) {
    return (key in pool)
  }

  function get<FK extends Keys>(key: FK): never | Pool[FK] {
    if (!exist(key)) {
      throw Error(`cannot find ${key} in Context`)
    } else {
      return pool[key]
    }
  }

  function set<FK extends Keys>(key: FK, value: Pool[FK]): void {
    if (!exist(key)) {
      throw Error(`cannot find ${key} in Context`)
    } else {
      pool[key] = value
    }
  }

  return Object.freeze({ exist, get, set })
}
