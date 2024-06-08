import assert from 'assert'
import { Queue } from "./queue"
import { timeout } from "./timeout"
import { Wait } from './wait'

test('Queue 不会立即执行', async () => {
  const q = Queue()

  let val = 0

  const p = q.task(async () => {
    val = 999
  })

  expect( val ).toBe( 0 )

  await p
  expect( val ).toBe( 999 )
})

test('Queue 返回值', async () => {
  const q = Queue()

  expect(
    await q.task(() => Promise.resolve(9))
  ).toBe(9)
})

test('Queue 只会 await 当前任务', async () => {
  const q = Queue()

  let val = 0

  q.task(async () => {
    await timeout(100)
  })

  const p = q.task(async () => {
    await timeout(100)
    val = 999
  })

  q.task(async () => {
    await timeout(1000)
    val = 14212421124
  })

  const start_time = Date.now()
  await p
  const end_time = Date.now()
  assert( val === 999 )
  assert( (end_time - start_time) < 300 )
})


test('Queue 错误处理', async () => {
  const q = Queue()

  try {
    await q.task(async () => {
      throw new Error('111111failure')
    })
    throw Error('did not throw error')
  } catch (err: any) {
    expect( err.message ).toBe( '111111failure' )
  }
})

test('Queue 任务出错时也不会停止队列', async () => {
  const q = Queue()

  let val = 0

  q.task(async () => {
    throw new Error('111111failure')
  }).catch(() => {})

  const p1 = q.task(async () => {
    val = 992
  })

  q.task(async () => {})

  await p1

  expect( val ).toBe( 992 )
})

test('Queue payload', async () => {
  const q = Queue<number>()
  const p = q.task(9, async () => {})
  {
    const payloads = q.getTasks().map(t => t.payload)
    expect(payloads.length).toBe(1)
    expect(payloads).toStrictEqual([9])
  }

  await p

  {
    const payloads = q.getTasks().map(t => t.payload)
    expect(payloads.length).toBe(0)
  }
})

test('Queue setTasks', async () => {
  const q = Queue<number>()
  const list: number[] = []
  for (let i = 0; i < 10; ++i) {
    q.task(i, async () => {
      list.push(i)
    })
  }
  q.setTasks(
    q.getTasks().filter(t => {
      return t.payload % 2 === 0
    })
  )
  await timeout(100)
  expect(list).toStrictEqual([ 0, 2, 4, 6, 8 ])
})

test('Queue getStatus', async () => {
  const q = Queue()
  async function test() {
    expect( q.getStatus() ).toBe('pause')

    const p = q.task(() => timeout(300))
    expect( q.getStatus() ).toBe('running') // 只要有任务，它就会是 running

    await timeout(10)
    expect( q.getStatus() ).toBe('running')

    await p
    expect( q.getStatus() ).toBe('pause')
  }

  await test()
  await test()
  await test()
  await test()
  await test()

  await test()
  await timeout(10)
  await test()
  await timeout(10)
  await test()
})

test('Queue ALL_DONE signal', async () => {
  const q = Queue()
  let val = 0
  q.signals.ALL_DONE.receive(() => {
    expect(q.getStatus()).toBe('pause')
    val = 99
  })

  await q.task(() => Promise.resolve())

  expect(val).toBe(99)
})

test('Queue PROCESSING signal', async () => {
  const q = Queue<number>()
  let val = 0
  q.signals.PROCESSING.receive((current_task) => {
    val = 99
    expect( q.getStatus() ).toBe('running')
    expect( current_task.payload ).toBe( 1 )
  })

  await q.task(1, () => Promise.resolve())

  expect(val).toBe(99)
})

test('Queue WILL_PROCESSING signal', async () => {
  const q = Queue<number>()
  let revoke_count = 0
  q.signals.WILL_PROCESSING.receive(() => {
    revoke_count += 1
    q.setTasks(
      q.getTasks().filter(t => {
        return t.payload % 2 === 0
      })
    )
  })

  const list: number[] = []

  for (let i = 0; i < 100; ++i) {
    q.task(i, async () => {
      list.push(i)
    })
  }

  const [waiting, done] = Wait()
  q.signals.ALL_DONE.receive(done)
  await waiting

  assert(list.length !== 0)

  for (const num of list) {
    assert(num % 2 === 0)
  }

  expect( revoke_count ).toBe( list.length )
})

test('Queue keep sequence', async () => {
  const q = Queue()
  const list: string[] = []
  const input = 'abcdefghijklmn'.split('')
  for (let i = 0; i < input.length; ++i) {
    q.task(async () => {
      const w1 = Math.floor(Math.random() * 30)
      const w2 = Math.floor(Math.random() * 30)

      await timeout(w1)
      list.push( input.slice(0, i + 1).join('') )
      await timeout(w2)
    })
  }

  const [waiting, done] = Wait()
  q.signals.ALL_DONE.receive(done)
  await waiting

  for (let i = 0; i < input.length; ++i) {
    expect( list[i] ).toBe( input.slice(0, i + 1).join('') )
  }
})

test('Queue concurrent', async () => {
  const MAX_CONCURRENT = 3
  const q = Queue(MAX_CONCURRENT)
  let c = 0
  let total = 0
  for (let i = 0; i < 10; ++i) {
    q.task(async () => {
      c += 1
      await timeout(100)
      total += 1
    })
  }
  await timeout(10)
  expect( c ).toBe( MAX_CONCURRENT )

  const [waiting, done] = Wait()
  q.signals.ALL_DONE.receive(done)
  await waiting
  expect( total ).toBe( 10 )
})
