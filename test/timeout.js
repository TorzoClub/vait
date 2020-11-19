import test from 'ava'
import vait from '../'

test('vait.timeout', async t => {
  const time1 = Date.now()
  await vait.timeout(50)
  const time2 = Date.now()
  t.true(time2 > time1)
  t.true((time2 - time1) >= 50)
})
