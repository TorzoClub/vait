import { Serial } from './serial'
import { timeout } from './timeout'

test('Serial ignore error', async () => {
  const serial = Serial()

  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  async function createFailure() {
    throw new Error('failure')
  }

  const failure = createFailure()

  await expect(failure).rejects.toThrow()

  waiting.push(
    serial(() => failure).catch(() => {})
  )

  waiting.push(
    serial(async () => {
      history.push(2)
    })
  )

  await Promise.all(waiting)

  expect(history).toEqual([2])
})

test('Serial error catch execute sequence', async () => {
  const serial = Serial()

  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  async function createFailure() {
    throw new Error('failure')
  }

  const failure = createFailure()

  await expect(failure).rejects.toThrow()

  waiting.push(
    serial(() => failure).catch(() => {
      history.push(1)
    })
  )

  waiting.push(
    serial(async () => {
      history.push(2)
    })
  )

  waiting.push(
    serial(async () => {
      history.push(3)
    })
  )

  await Promise.all(waiting)

  expect(history).toEqual([1, 2, 3])
})

test('Serial sync', async () => {
  const serial = Serial()

  const count = 1000
  const waitting: Promise<number>[] = []
  for (let c = 0; c < count; ++c) {
    waitting.push(
      serial(async () => c)
    )
  }

  const list = await Promise.all(waitting)
  for (let c = 0; c < count; ++c) {
    expect(c).toEqual(list[c])
  }
})

test('Serial return value', async () => {
  const serial = Serial()

  expect(233).toBe(
    await serial(async () => 233)
  )

  expect('233').toBe(
    await serial(async () => '233')
  )
})

test('Serial timeout', async () => {
  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  const serial = Serial()
  waiting.push(
    serial(async () => {
      await timeout(1000)
      history.push(1)
    })
  )
  waiting.push(
    serial(async () => {
      await timeout(2000)
      history.push(2)
    })
  )
  waiting.push(
    serial(async () => {
      await timeout(10)
      history.push(3)
    })
  )
  waiting.push(
    serial(async () => {
      history.push(4)
    })
  )
  waiting.push(
    serial(async () => {
      await timeout(100)
      history.push(5)
    })
  )

  await Promise.all(waiting)

  expect(history).toEqual([1, 2, 3, 4, 5])
})
