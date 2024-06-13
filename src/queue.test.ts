import assert from 'assert'
import { Queue, QueueSignal, WithPayload, runTask } from './queue'
import { timeout } from './timeout'
import { Wait } from './wait'
import { Memo } from './memo'

jest.setTimeout(15000)

test('runTask (Queue', async () => {
  const q = Queue()
  let count = 0
  const val = await runTask(q, async () => {
    count += 1
    return 'return'
  })
  expect(count).toBe(1)
  expect(val).toBe('return')
  await timeout(10)
  expect(q.getStatus()).toBe('pause')
})

test('runTask (QueueWithPayload', async () => {
  const q = WithPayload<number>(Queue())
  let count = 0
  const fn = async () => {
    count += 1
    return 'return'
  }
  const promise = runTask(q, 9, fn)
  expect( q.getPayload(fn) ).toBe(9)
  const val = await promise
  expect(count).toBe(1)
  expect(val).toBe('return')
  await timeout(10)
  expect(q.getStatus()).toBe('pause')
})

test('runTask (QueueWithSignal', async () => {
  const q = Queue(QueueSignal())
  const [waiting, go] = Wait()
  let count = 0
  let done = 0
  q.signal.ALL_DONE.receive(() => {
    expect(q.getStatus()).toBe('pause')
    done += 1
    go()
  })
  const val = await runTask(q, async () => {
    count += 1
    return 'return'
  })
  expect(count).toBe(1)
  expect(val).toBe('return')
  // await timeout(10)
  await waiting
  expect(done).toBe(1)
  expect(q.getStatus()).toBe('pause')
})

test('runTask (WithPayload(QueueSignal', async () => {
  const q = WithPayload<number>(Queue(QueueSignal()))
  const [waiting, go] = Wait()
  let count = 0
  let done = 0
  q.signal.ALL_DONE.receive(() => {
    expect(q.getStatus()).toBe('pause')
    done += 1
    go()
  })
  const fn = async () => {
    count += 1
    return 'return'
  }
  const promise = runTask(q, 9, fn)
  expect( q.getPayload(fn) ).toBe(9)
  const val = await promise
  expect(count).toBe(1)
  expect(val).toBe('return')
  // await timeout(10)
  await waiting
  expect(done).toBe(1)
  expect(q.getStatus()).toBe('pause')
})

test('Queue', () => {
  expect(() => {
    Queue().setMaxConcurrent(1.1)
  }).toThrow()
  expect(() => {
    Queue().setMaxConcurrent(0.9)
  }).toThrow()
  expect(() => {
    Queue().setMaxConcurrent(0)
  }).toThrow()
  expect(() => {
    Queue().setMaxConcurrent('0' as any)
  }).toThrow()
})

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

test('Queue 任务出错时也不会停止队列', async () => {
  const q = Queue()

  let count = 0

  q.task(async () => {
    count += 1
  })

  q.task(async () => {
    throw new Error('111111failure')
  })

  q.task(async () => {
    count += 1
  })

  await timeout(50)

  expect( count ).toBe( 2 )
})

test('Queue payload', async () => {
  const q = WithPayload<number>(Queue())
  let fn: null | (() => Promise<void>) = async () => {}

  q.task(1, fn)
  {
    const tasks = q.getTasks()
    expect(tasks.length).toBe(1)
    expect( q.getPayload(fn) ).toBe(1)
  }
  await timeout(10)
  {
    const tasks = q.getTasks()
    expect(tasks.length).toBe(0)
    expect( q.getPayload(fn) ).toBe(1)
  }

  expect(() => {
    q.getPayload(() => Promise.resolve())
  }).toThrow()
})

test('Queue setTasks', async () => {
  const q = WithPayload<number>(Queue())
  const list: number[] = []
  for (let i = 0; i < 10; ++i) {
    q.task(i, async () => {
      list.push(i)
    })
  }
  q.setTasks(
    q.getTasks().filter(fn => {
      const payload = q.getPayload(fn)
      return payload % 2 === 0
    })
  )
  await timeout(100)
  expect(list).toStrictEqual([ 0, 2, 4, 6, 8 ])

  {
    const q = WithPayload<number>(Queue(QueueSignal()))
    const list: number[] = []
    for (let i = 0; i < 10; ++i) {
      q.task(i, async () => {
        list.push(i)
      })
    }
    q.setTasks(
      q.getTasks().filter(fn => {
        const payload = q.getPayload(fn)
        return payload % 2 === 0
      })
    )
    await timeout(100)
    expect(list).toStrictEqual([ 0, 2, 4, 6, 8 ])
  }
})

test('Queue getStatus', async () => {
  const q = Queue(QueueSignal())
  async function test() {
    expect( q.getStatus() ).toBe('pause')

    const p = q.task(() => timeout(100))
    expect( q.getStatus() ).toBe('running') // 只要有任务，它就会是 running

    await timeout(10)
    expect( q.getStatus() ).toBe('running')
    const [waiting, done] = Wait()
    const cancel = q.signal.ALL_DONE.receive(() => {
      expect( q.getStatus() ).toBe('pause')
      cancel()
      done()
    })
    await waiting
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
  const a = Queue()
  const q = Queue(QueueSignal())
  let val = 0
  q.signal.ALL_DONE.receive(() => {
    expect(q.getStatus()).toBe('pause')
    val += 1
  })

  for (let i = 0; i < 100; ++i) {
    q.task(() => Promise.resolve())
  }

  await timeout(100)

  expect(val).toBe(1)
})

test('Queue ALL_DONE signal in concurrent', async () => {
  const q = Queue(QueueSignal())
  q.setMaxConcurrent(30)
  let val = 0
  q.signal.ALL_DONE.receive(() => {
    expect(q.getStatus()).toBe('pause')
    val += 1
  })

  for (let i = 0; i < 100; ++i) {
    q.task(() => Promise.resolve())
  }

  await timeout(100)

  expect(val).toBe(1)
})

test('Queue PROCESSING signal', async () => {
  const q = WithPayload<number>(Queue(QueueSignal()))
  let val = 0
  q.signal.PROCESSING.receive((current_task) => {
    val = 99
    expect( q.getStatus() ).toBe('running')
    expect( q.getPayload(current_task) ).toBe( 1 )
  })

  q.task(1, () => Promise.resolve())

  await timeout(30)

  expect(val).toBe(99)
})

test('Queue WILL_PROCESSING signal', async () => {
  const qa = WithPayload<number>(Queue())
  const q = WithPayload<number>(Queue(QueueSignal()))
  let revoke_count = 0
  q.signal.WILL_PROCESSING.receive(() => {
    revoke_count += 1
    q.setTasks(
      q.getTasks().filter(t => {
        return q.getPayload(t) % 2 === 0
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
  q.signal.ALL_DONE.receive(done)
  await waiting

  assert(list.length !== 0)

  for (const num of list) {
    assert(num % 2 === 0)
  }

  expect( revoke_count ).toBe( 50 )

  {
    const q = Queue(QueueSignal())
    let revoke_count = 0
    q.signal.WILL_PROCESSING.receive(() => {
      q.setTasks([])
    })
    q.task(async () => {
      revoke_count += 1
    })
    await timeout(100)
    expect(revoke_count).toBe(0)
  }
})

test('Queue keep sequence', async () => {
  const q = Queue(QueueSignal())
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
  q.signal.ALL_DONE.receive(done)
  await waiting

  for (let i = 0; i < input.length; ++i) {
    expect( list[i] ).toBe( input.slice(0, i + 1).join('') )
  }
})

test('Queue concurrent', async () => {
  const MAX_CONCURRENT = 3
  const q = Queue(QueueSignal())
  q.setMaxConcurrent(MAX_CONCURRENT)
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
  q.signal.ALL_DONE.receive(done)
  await waiting
  expect( total ).toBe( 10 )
})

test('Queue concurrent(2)', async () => {
  const MAX_CONCURRENT = 3
  const q = Queue()
  q.setMaxConcurrent(MAX_CONCURRENT)
  let [ waiting, done ] = Wait()

  let c = 0
  for (let i = 0; i < 10; ++i) {
    q.task(async () => {
      c += 1
      await waiting
    })
  }

  await timeout(200)
  expect(c).toBe( MAX_CONCURRENT )

  {
    const [ new_waiting, newDone ] = Wait()
    const oldDone = done
    waiting = new_waiting
    done = newDone
    oldDone()
    await timeout(200)
    expect(c).toBe( MAX_CONCURRENT * 2 )
  }

  {
    const [ new_waiting, newDone ] = Wait()
    const oldDone = done
    waiting = new_waiting
    done = newDone
    oldDone()
    await timeout(200)
    expect(c).toBe( MAX_CONCURRENT * 3 )
  }

  {
    const [ new_waiting, newDone ] = Wait()
    const oldDone = done
    waiting = new_waiting
    done = newDone
    oldDone()
    await timeout(200)
    expect(c).toBe( 10 )
  }
})
