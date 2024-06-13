import assert from 'assert'
import { concurrentEach } from './concurrent-each'
import { timeout } from './timeout'
import { Wait } from './wait'
import { nextTick } from './next-tick'
import { Signal } from './signal'
import { Timer } from './timer'

test('concurrentEach(empty list)', async () => {
  let val = 0
  expect(
    await concurrentEach(10, [][Symbol.iterator](), async () => {
      val = 99
    })
  ).toBe(undefined)
  expect( val ).toBe( 0 )
})

test('concurrentEach(error handling)', async () => {
  let has_err = false
  const concurrent = 4
  let c = 0
  try {
    await concurrentEach(concurrent, [1, 2, 3, 4, 5][Symbol.iterator](), async (_, idx) => {
      expect(idx).not.toBe(4)
      if (idx === 0) {
        throw new Error('failure_1')
      } else {
        c += 1
      }
    })
  } catch (err: any) {
    has_err = true
    expect(err.message).toBe('failure_1')
  }

  expect(has_err).toBe(true)
  expect(c).toBe( concurrent - 1 )
})

test('在错误发生后尽可能地阻止并发执行', async () => {
  const [waiting, go] = Wait()
  let revoke_count = 0
  let resolved_count = 0
  let rejected_count = 0

  let timertimeout = 0
  Timer(100, async () => {
    timertimeout += 1
    await timeout(100)

    expect(revoke_count).toBe(3)
    expect(rejected_count).toBe(1)
    expect(resolved_count).toBe(0)

    go()
    expect(revoke_count).toBe(3)
    expect(rejected_count).toBe(1)
    expect(resolved_count).toBe(0)
  })

  expect(() => (
    concurrentEach(3, range(0, 5)[Symbol.iterator](), async (_, idx) => {
      revoke_count += 1
      if (idx === 1) {
        await timeout(50)
        rejected_count += 1
        throw Error('failurexxx')
      } else {
        return waiting.then(() => {
          resolved_count += 1
        })
      }
    })
  )).rejects.toThrow('failurexxx')

  await timeout(200)
  expect(timertimeout).toBe(1)
})

test('concurrentEach(multi error)', async () => {
  let has_err = false
  let c = 0
  try {
    await concurrentEach(3, [1, 2, 3, 4, 5][Symbol.iterator](), async (_, idx) => {
      if (idx === 0) {
        await timeout(100)
        throw new Error('failure_1')
      } else if (idx === 1) {
        await timeout(90)
        throw new Error('failure_2')
      } else {
        await timeout(10)
        c += 1
      }
    })
  } catch (err: any) {
    has_err = true
    expect(err.message).toBe('failure_2')
  }

  expect(has_err).toBe(true)
  expect(c).toBe( 3 )
})

test('concurrent_limit should be integer', async () => {
  {
    let val = 0
    try {
      await concurrentEach(1.1, [][Symbol.iterator](), () => Promise.resolve())
      val = 111
    } catch (err) {
      assert( err instanceof TypeError )
    }

    expect( val ).toBe( 0 )
  }
})

test('concurrent_limit should >= 1', async () => {
  {
    let val = 0
    try {
      await concurrentEach(0, [][Symbol.iterator](), () => Promise.resolve())
      val = 111
    } catch (err) {
      assert( err instanceof RangeError )
    }

    expect( val ).toBe( 0 )
  }
  {
    let val = 0
    try {
      await concurrentEach(0, [2,4,2,1,'a'][Symbol.iterator](), () => Promise.resolve())
      val = 111
    } catch (err) {
      assert( err instanceof RangeError )
    }

    expect( val ).toBe( 0 )
  }
})

function range(start: number, end: number) {
  const list: number[] = []
  for (let i = start; i <= end; ++i) {
    list.push(i)
  }
  return list
}

test('concurrentEach should support Infinity max concurrency', async () => {
  let revoke_count = 0
  const [waiting, ok] = Wait()
  const promise = concurrentEach(Infinity, range(0, 9)[Symbol.iterator](), () => {
    revoke_count += 1
    return waiting
  })
  expect(revoke_count).toBe(10)

  expect(() => (
    concurrentEach(-Infinity, range(0, 9)[Symbol.iterator](), () => {
      revoke_count += 1
      return waiting
    })
  )).rejects.toThrow()

  expect(revoke_count).toBe(10)

  ok()
  await promise
})

test('concurrentEach should dynamically change the max concurrency', async () => {
  let revoke_count = 0
  const changeSignal = Signal<number>()
  const resolved_idx_list: Array<number> = []
  const pedding_tasks: Array<Wait> = []

  const concurrentPromise = concurrentEach(
    1,
    range(0, 9)[Symbol.iterator](),
    (_, idx) => {
      revoke_count += 1
      if (idx < 2) {
        const w = Wait()
        pedding_tasks.push(w)
        const [ waitting ] = w
        return waitting.then(() => {
          resolved_idx_list.push(idx)
        })
      } else {
        return nextTick().then(() => {
          resolved_idx_list.push(idx)
        })
      }
    },
    changeSignal
  )

  await timeout(100)
  expect(revoke_count).toBe(1)

  expect(() => {
    changeSignal.triggerCareError(-1)
  }).toThrow()
  expect(() => {
    changeSignal.triggerCareError(0)
  }).toThrow()
  expect(() => {
    changeSignal.triggerCareError('' as any)
  }).toThrow()

  expect(() => {
    changeSignal.triggerCareError(1)
  }).not.toThrow()
  await timeout(100)
  expect(revoke_count).toBe(1)

  changeSignal.triggerCareError(2)
  await timeout(100)
  expect(revoke_count).toBe(2)

  expect(pedding_tasks.length).toBe(2)

  const [, resolve] = pedding_tasks[0]
  resolve()

  await timeout(100)
  expect(revoke_count).toBe(10)


  expect(resolved_idx_list.indexOf(1)).toBe(-1)

  Timer(100, () => {
    const [, resolve] = pedding_tasks[1]
    resolve()
  })

  await concurrentPromise

  expect(resolved_idx_list[0]).toBe(0) // 第一位为 0
  expect(resolved_idx_list[resolved_idx_list.length - 1]).toBe(1) // 最后一位为 1
  expect(resolved_idx_list.slice(1, resolved_idx_list.length - 1)).toStrictEqual(range(2, 9)) // 中间的是 2～9
})

test('concurrentEach should dynamically change the max concurrency(change to small)', async () => {
  let revoke_count = 0
  const changeSignal = Signal<number>()
  const resolved_idx_list: Array<number> = []
  const pedding_tasks: Array<Wait> = []
  const waiting_list = range(0, 9).map(() => Wait())

  const concurrentPromise = concurrentEach(
    3,
    waiting_list[Symbol.iterator](),
    (w, idx) => {
      revoke_count += 1
      const [ waiting ] = w
      return waiting.then(() => {
        resolved_idx_list.push(idx)
      })
    },
    changeSignal
  )

  expect(revoke_count).toBe(3)

  await timeout(100)
  expect(resolved_idx_list.length).toBe(0)

  changeSignal.triggerCareError(1)
  expect(revoke_count).toBe(3)
  expect(resolved_idx_list.length).toBe(0)

  await timeout(100)
  expect(revoke_count).toBe(3)
  expect(resolved_idx_list.length).toBe(0)

  { // resolve 第一个的 waiting，仍然不会动
    const [ , ok ] = waiting_list[0]
    ok()
    expect(revoke_count).toBe(3)
    expect(resolved_idx_list.length).toBe(0)

    await timeout(100)
    expect(revoke_count).toBe(3)
    assert(resolved_idx_list.includes(0))
  }

  { // resolve 第二个的 waiting，仍然不会动
    const [ , ok ] = waiting_list[1]
    ok()
    await timeout(100)
    expect(revoke_count).toBe(3)
    assert(resolved_idx_list.includes(1))
  }

  // resolve 第三个的 waiting，会动了
  for (let i = 2; i < waiting_list.length; ++i) {
    const before_revoke_count = revoke_count
    assert(resolved_idx_list.includes(i) === false)
    const [ , ok ] = waiting_list[i]
    ok()
    await timeout(100)
    assert(resolved_idx_list.includes(i) === true)
    if (revoke_count !== waiting_list.length) {
      expect(revoke_count).toBe(before_revoke_count + 1)
    }
  }

  await concurrentPromise
})
