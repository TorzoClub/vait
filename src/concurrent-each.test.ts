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
  const data = 'abcde'.split('')
  let has_err = false
  let catch_err: any
  const preset_error = new Error('failure')
  let revoke_count = 0
  try {
    await concurrentEach(
      3,
      data,
      async (item, idx) => {
        if (idx === 2) {
          await timeout(100)
          throw preset_error
        } else {
          revoke_count += 1
        }
      },
    )
  } catch (err) {
    catch_err = err
    has_err = true
  }

  expect(has_err).toBe(true)

  expect(revoke_count).toBe(data.length - 1)
  expect(catch_err).toBe(preset_error)
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
