import test from 'ava'
import vait from '../'

test('vait.wait', async t => {
  const promise = new Promise(resolve => {
    vait.timeout(100, 'value').then(resolve)
  })

  const v = vait.wait(promise)

  t.false(v.__finally__)

  const t1 = Date.now()
  await v
  const t2 = Date.now()

  t.true(t2 > t1)
  t.true((t2 - t1) >= 100)
  t.false((t2 - t1) < 100)

  t.is(v.__value__, 'value')
  t.true(v.__finally__)
})

test('vait.wait reject', async t => {
  const err = Error('reject')
  const promise = new Promise((resolve, reject) => {
    vait.timeout(100, err).then(reject)
  })

  const v = vait.wait(promise)

  t.false(v.__finally__)

  const t1 = Date.now()
  await t.throws(v)
  const t2 = Date.now()

  t.true(t2 > t1)
  t.true((t2 - t1) >= 100)
  t.false((t2 - t1) < 100)

  t.is(v.__error__, err)
  t.true(v.__finally__)
})

test('vait.wait chain', async t => {
  const result = []

  const v = vait()

  const vw1 = vait.wait(v)
  const vw2 = vait.wait(vw1)
  const vw3 = vait.wait(vw2)

  vw1.then(val => {
    t.is(val, 'hehe')
    result.push('vw1')
  })
  vw2.then(val => {
    t.is(val, 'hehe')
    result.push('vw2')
  })
  vw3.then(val => {
    t.is(val, 'hehe')
    result.push('vw3')
  })

  v.pass('hehe')

  await vw3

  t.true(vw1.__finally__, vw2.__finally__, vw3.__finally__)

  t.is(vw1.__value__, 'hehe')
  t.is(vw2.__value__, 'hehe')
  t.is(vw3.__value__, 'hehe')

  t.deepEqual([ 'vw1', 'vw2', 'vw3' ], result)
})
