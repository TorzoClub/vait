import { timeout } from './timeout'
import { Timer } from './timer'

test('timer', async () => {
  let value: number | undefined = undefined

  Timer(100, () => {
    value = 999
  })

  expect( value ).toBe( undefined )

  await timeout(200)

  expect( value ).toBe( 999 )
})

test('timer timing', async () => {
  const start_time = Date.now()
  let end_time = start_time
  Timer(1000, () => {
    end_time = Date.now()
  })
  await timeout(1500)
  const time_difference = end_time - start_time
  expect(time_difference).toBeGreaterThanOrEqual(999)
})

test('timer cancel', async () => {
  let value = 0
  const cancelTimer = Timer(25, () => {
    value = 9
  })
  cancelTimer()

  await timeout(100)

  expect(value).toBe(0)
})
