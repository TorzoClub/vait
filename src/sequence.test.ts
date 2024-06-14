import { Sequence } from './sequence'
import { timeout } from './timeout'
import { Wait } from './wait'

test('Serial', async () => {
  const sq = Sequence()

  const list: number[] = []

  for (let i = 0; i < 50; ++i) {
    ((i: number) => {
      sq(async () => {
        await timeout(Math.floor(Math.random()*60))
        list.push(i)
      })
    })(i)
  }

  await sq(async () => {
    list.push(999888222)
  })

  expect(list.includes(999888222)).toBe(true)
  expect(list.indexOf(999888222)).toBe(50)

  for (let i = 0; i < (list.length - 1); ++i) {
    expect(list[i]).toBe(i)
  }
})

test('Serial ignore error', async () => {
  const sq = Sequence()

  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  async function createFailure() {
    throw new Error('failure')
  }

  const failure = createFailure()

  await expect(failure).rejects.toThrow()

  waiting.push(
    sq(() => failure).catch(() => {})
  )

  waiting.push(
    sq(async () => {
      history.push(2)
    })
  )

  await Promise.all(waiting)

  expect(history).toEqual([2])
})

test('Serial sync', async () => {
  const sq = Sequence()

  const count = 1000
  const waitting: Promise<unknown>[] = []
  for (let c = 0; c < count; ++c) {
    waitting.push(
      sq(async () => c)
    )
  }

  const list = await Promise.all(waitting)
  for (let c = 0; c < count; ++c) {
    expect(c).toEqual(list[c])
  }
})

test('Serial return value', async () => {
  jest.setTimeout(1000)
  const sq = Sequence()

  expect(233).toBe(
    await sq(async () => 233)
  )

  expect('233').toBe(
    await sq(async () => '233')
  )
})

test('Serial timeout', async () => {
  const history: number[] = []
  const waiting: Promise<unknown>[] = []

  const sq = Sequence()
  waiting.push(
    sq(async () => {
      await timeout(1000)
      history.push(1)
    })
  )
  waiting.push(
    sq(async () => {
      await timeout(2000)
      history.push(2)
    })
  )
  waiting.push(
    sq(async () => {
      await timeout(10)
      history.push(3)
    })
  )
  waiting.push(
    sq(async () => {
      history.push(4)
    })
  )
  waiting.push(
    sq(async () => {
      await timeout(100)
      history.push(5)
    })
  )

  await Promise.all(waiting)

  expect(history).toEqual([1, 2, 3, 4, 5])
})
