import { nextTick } from "./next-tick"
import { Queue } from "./queue"
import { QueuePool } from "./queue-pool"
import { timeout } from "./timeout"

test('queue pool', async () => {
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

test('queue pool 独立队列', async () => {
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

test('queue pool payload', async () => {
  const pool = QueuePool<number, 'abc'|'cba'>()
  const fn = nextTick
  pool.addTask(1, 'abc', fn)
  const tasks = pool.getQueue(1).getTasks()
  expect( tasks.length ).toBe( 1 )

  expect(
    pool.getQueue(1).getPayload(fn)
  ).toBe( 'abc' )
  expect(
    pool.getQueue(1).getPayload(tasks[0])
  ).toBe( 'abc' )
})
