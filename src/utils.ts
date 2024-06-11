export const removeByItem = <T>(list: T[], remove_item: T) =>
  list.filter((item) => item !== remove_item)
