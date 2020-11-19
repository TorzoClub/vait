import test from 'ava'
import vait from '../'

test('vait pass', async t => {
  const v = vait()

  vait.timeout(50, '9').then(v.pass)

  const time1 = Date.now()
  const value = await v
  const time2 = Date.now()

  t.is(value, '9')
  t.true(time2 > time1)
})

test('vait.__value__', async t => {
  const v = vait()

  vait.timeout(50, '9').then(v.pass)

  const value = await v

  t.is('9', v.__value__)
})

test('vait fail', async t => {
  const v = vait()

  vait.timeout(50).then(() => {
    v.fail(Error('error'))
  })

  await t.throws(v)
})

test('vait.__error__', async t => {
  const v = vait()
  const err = new Error('error')

  vait.timeout(50).then(() => {
    v.fail(err)
  })

  await t.throws(v)
  t.is(err, v.__error__)
})

test('vait.__finally__ with resolve', async t => {
  const v = vait()

  vait.timeout(50, '9').then(v.pass)

  t.is(v.__finally__, false)

  const value = (await v)

  t.is(v.__finally__, true)
})

test('vait.__finally__ with reject', async t => {
  const v = vait()
  const err = new Error('error')

  vait.timeout(50).then(() => {
    v.fail(err)
  })

  t.is(v.__finally__, false)
  await t.throws(v)
  return t.is(v.__finally__, true)
})
