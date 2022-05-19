import { nextTick } from './next-tick'

test.only('nextTick', async () => {
  let value: number | undefined = undefined

  const promise = nextTick().then(() => {
    value = 100
  })
  expect(value).toBe(undefined)

  await promise

  expect(value).toBe(100)
})
