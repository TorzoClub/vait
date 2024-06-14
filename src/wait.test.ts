import { Wait, WaitingRejected } from './wait'

test('Wait', async () => {
  const [wait, go] = Wait()

  let val: number | undefined = undefined
  wait.then(() => {
    val = 233
  })
  expect(val).toBe(undefined)

  go()

  await wait

  expect(val).toBe(233)
})

test('Wait timeout', async () => {
  const [wait, go] = Wait()

  let val: number | undefined = undefined
  wait.then(() => {
    val = 233
  })
  expect(val).toBe(undefined)

  const start_time = Date.now()
  setTimeout(go, 1000)

  await wait

  const end_time = Date.now()

  const time_difference = end_time - start_time
  expect(time_difference).toBeGreaterThanOrEqual(1000)
})

test('Wait return value', async () => {
  const [wait, go] = Wait<number>()
  go(233)
  expect(await wait).toBe(233)
})

test('Wait no argument', async () => {
  const [wait, go] = Wait()
  go()
  expect(await wait).toBe(undefined)
})

test('Wait call go repeatedly', async () => {
  const [wait, go] = Wait<number>()
  go(1)
  expect(await wait).toBe(1)

  go(2)
  expect(await wait).toBe(1)

  go(3)
  expect(await wait).toBe(1)

  go(4)
  expect(await wait).toBe(1)
})


test('Wait error handling', async () => {
  const [ waiting, , cancel ] = Wait()
  cancel(new Error('aaaa'))
  expect( waiting ).rejects.toThrow(WaitingRejected)

  const cancel_error = new Error('cancelerror')
  try {
    const [waiting, , cancel] = Wait()
    cancel(cancel_error)
    await waiting
  } catch (err: unknown) {
    expect( err instanceof WaitingRejected ).toBe( true )
    if (err instanceof WaitingRejected) {
      expect( err.cause ).toBe( cancel_error )
    } else {
      throw err
    }
  }
})
