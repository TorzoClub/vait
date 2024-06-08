import assert from 'assert'
import { concurrentEach } from './concurrent-each'
import { timeout } from './timeout'

test('concurrentEach(empty list)', async () => {
  let val = 0
  expect(
    await concurrentEach(10, [], async () => {
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
    await concurrentEach(concurrent, [1, 2, 3, 4, 5], async (_, idx) => {
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

test('concurrentEach(multi error)', async () => {
  let has_err = false
  let c = 0
  try {
    await concurrentEach(3, [1, 2, 3, 4, 5], async (_, idx) => {
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
      await concurrentEach(1.1, [], () => Promise.resolve())
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
      await concurrentEach(0, [], () => Promise.resolve())
      val = 111
    } catch (err) {
      assert( err instanceof RangeError )
    }

    expect( val ).toBe( 0 )
  }
  {
    let val = 0
    try {
      await concurrentEach(0, [2,4,2,1,'a'], () => Promise.resolve())
      val = 111
    } catch (err) {
      assert( err instanceof RangeError )
    }

    expect( val ).toBe( 0 )
  }
})
