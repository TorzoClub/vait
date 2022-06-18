export class ContextError extends Error { }

export type Context<
  Keys extends string | number | symbol,
  Pool extends Readonly<Record<Keys, unknown>>
> = Readonly<{
  has<K extends Keys>(key: K): boolean
  get<FK extends Keys>(key: FK): Pool[FK]
  set<FK extends Keys>(key: FK, new_value: Pool[FK]): void
}>

export function CreateContext<
  Keys extends string | number | symbol,
  Pool extends Readonly<Record<Keys, unknown>>
>(preset: Pool): Context<Keys, Pool> {
  const pool: Pool = Object.assign(
    Object.create(null),
    preset,
  )

  function has<K extends Keys>(key: K) {
    return (key in pool)
  }

  return Object.freeze({
    has,

    get<FK extends Keys>(key: FK): Pool[FK] {
      if (!has(key)) {
        throw new ContextError(`'${key}' does not exist in Context`)
      } else {
        return pool[key]
      }
    },

    set<FK extends Keys>(key: FK, new_value: Pool[FK]): void {
      if (!has(key)) {
        throw new ContextError(`'${key}' does not exist in Context`)
      } else {
        pool[key] = new_value
      }
    },
  })
}
