import { timeout } from './'

test('timeout', async () => {
  let value: number | undefined = undefined

  const promise = timeout(100).then(() => {
    value = 100
  })
  expect(value).toBe(undefined)

  await promise

  expect(value).toBe(100)
})

test('timeout timing', async () => {
  const start_time = Date.now()
  await timeout(1000)
  const end_time = Date.now()
  const time_difference = end_time - start_time
  expect(time_difference).toBeGreaterThanOrEqual(1000)
})
