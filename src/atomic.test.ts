import { Atomic } from './'
import { timeout } from './timeout'

test('Atomic ignore error', async () => {
  const atomic = Atomic()

  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  async function createFailure() {
    throw new Error('failure')
  }

  const failure = createFailure()

  await expect(failure).rejects.toThrow()

  waiting.push(
    atomic(() => failure).catch(() => {})
  )

  waiting.push(
    atomic(async () => {
      history.push(2)
    })
  )
  
  await Promise.all(waiting)
  
  expect(history).toEqual([2])
})

test('Atomic error catch execute sequence', async () => {
  const atomic = Atomic()

  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  async function createFailure() {
    throw new Error('failure')
  }

  const failure = createFailure()

  await expect(failure).rejects.toThrow()

  waiting.push(
    atomic(() => failure).catch(() => {
      history.push(1)
    })
  )

  waiting.push(
    atomic(async () => {
      history.push(2)
    })
  )

  waiting.push(
    atomic(async () => {
      history.push(3)
    })
  )
  
  await Promise.all(waiting)
  
  expect(history).toEqual([1, 2, 3])
})

test('Atomic sync', async () => {
  const atomic = Atomic()

  const count = 1000
  const waitting: Promise<number>[] = []
  for (let c = 0; c < count; ++c) {
    waitting.push(
      atomic(async () => c)
    )
  }

  const list = await Promise.all(waitting)
  for (let c = 0; c < count; ++c) {
    expect(c).toEqual(list[c])
  }
})

test('Atomic timeout', async () => {
  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  const atomic = Atomic()
  waiting.push(
    atomic(async () => {
      await timeout(1000)
      history.push(1)
    })
  )
  waiting.push(
    atomic(async () => {
      await timeout(2000)
      history.push(2)
    })
  )
  waiting.push(
    atomic(async () => {
      await timeout(10)
      history.push(3)
    })
  )
  waiting.push(
    atomic(async () => {
      history.push(4)
    })
  )
  waiting.push(
    atomic(async () => {
      await timeout(100)
      history.push(5)
    })
  )
  
  await Promise.all(waiting)
  
  expect(history).toEqual([1, 2, 3, 4, 5])
})
