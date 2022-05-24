import { Lock } from './lock'

test('lock', async () => {
  const [lock, unlock] = Lock()

  let val: number | undefined = undefined
  lock.then(() => {
    val = 233
  })
  expect(val).toBe(undefined)

  unlock()

  await lock

  expect(val).toBe(233)
})

test('lock timeout', async () => {
  const [lock, unlock] = Lock()

  let val: number | undefined = undefined
  lock.then(() => {
    val = 233
  })
  expect(val).toBe(undefined)

  const start_time = Date.now()
  setTimeout(unlock, 1000)

  await lock

  const end_time = Date.now()

  const time_difference = end_time - start_time
  expect(time_difference).toBeGreaterThanOrEqual(1000)
})

test('lock return value', async () => {
  const [lock, unlock] = Lock<number>()
  unlock(233)
  expect(await lock).toBe(233)
})
