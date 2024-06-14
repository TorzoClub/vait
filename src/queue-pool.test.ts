import { nextTick } from "./next-tick"
import { Queue } from "./queue"
import { QueuePool } from "./queue-pool"
import { Signal } from "./signal"
import { timeout } from "./timeout"
import { Timer } from "./timer"
import { Wait } from "./wait"

test('QueuePool', async () => {
  const pool = QueuePool<number>()
  let count = 0
  pool.addTask(1, async () => {
    count += 1
  })
  pool.addTask(1, async () => {
    count += 1
  })

  await timeout(100)

  expect( pool.hasQueue(1) ).toBe( false )
  expect( count ).toBe( 2 )
})

test('QueuePool 独立队列', async () => {
  const pool = QueuePool<number>()
  let count = 0
  pool.addTask(1, async () => {
    await timeout(500)
    count += 1
  })
  pool.addTask(2, async () => {
    count += 1
  })
  await timeout(10)
  expect( count ).toBe( 1 )
  expect( pool.hasQueue(1) ).toBe( true )

  await timeout(600)
  expect( pool.hasQueue(1) ).toBe( false )
  expect( count ).toBe( 2 )
})

test('QueuePool payload', async () => {
  const [waiting, go] = Wait()
  const pool = QueuePool<number, 'abc'|'cba'>()
  const fn = () => waiting
  pool.addTask(1, 'abc', fn)
  // await timeout(100)
  const tasks = pool.getQueue(1).getTasks()
  expect( tasks.length ).toBe( 1 )

  go()

  expect(
    pool.getQueue(1).getPayload(fn)
  ).toBe( 'abc' )
  expect(
    pool.getQueue(1).getPayload(tasks[0])
  ).toBe( 'abc' )
})

test('QueuePool ERROR signal', async () => {
  const pool = QueuePool<number, 'a'|'b'>()
  const err = new Error('ffff')

  pool.addTask(2, 'b', () => Promise.resolve())
  pool.addTask(3, 'b', () => Promise.resolve())

  const failureFunc = () => Promise.reject(err)
  pool.addTask(1, 'a', failureFunc)

  let revoke = 0
  pool.signal.ERROR.receive(sigpayload => {
    revoke += 1
    expect(sigpayload.id).toBe(1)
    expect(sigpayload.payload).toBe('a')
    expect(sigpayload.error).toBe(err)
  })

  await Signal.wait( pool.signal.ALL_DONE )

  expect(revoke).toBe(1)
})

test('QueuePool ALL_DONE signal', async () => {
  const pool = QueuePool<number, 'a'|'b'>()
  const [ waiting, ok ] = Wait()
  let r = 0

  pool.addTask(2, 'b', async () => {
    r += 1
    return waiting
  })

  pool.addTask(2, 'b', async () => {
    r += 1
    return waiting
  })

  pool.addTask(1, 'b', async () => {
    r += 1
    return waiting
  })

  pool.addTask(4, 'b', async () => {
    r += 1
    return waiting
  })

  Timer(100, ok)

  await Signal.wait( pool.signal.ALL_DONE )

  expect(r).toBe(4)
})

test('QueuePool pause/resume', async () => {
  let revoke = 0
  const pool = QueuePool<number, 'a'|'b'>()
  pool.addTask(1, 'a', () => {
    revoke += 1
    return timeout(50)
  })
  pool.addTask(2, 'b', () => {
    revoke += 1
    return timeout(50)
  })
  pool.pause()
  await timeout(100)
  expect(revoke).toBe(0)

  pool.resume()
  await Signal.wait(pool.signal.ALL_DONE)
  expect(revoke).toBe(2)

  pool.addTask(3, 'b', async () => {
    revoke += 1
  })
  await Signal.wait(pool.signal.ALL_DONE)
  expect(revoke).toBe(3)

  expect(() => pool.resume()).not.toThrow()

  await timeout(100)
  expect(revoke).toBe(3)
})
