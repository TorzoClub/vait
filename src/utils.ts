export const removeByItem = <T>(list: T[], remove_item: T) =>
  list.filter((item) => item !== remove_item)

export type ID<T, DistinctName> = T & { __TYPE__: DistinctName }
