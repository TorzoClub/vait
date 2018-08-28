test = require 'ava'
vait = require '../'

test 'vait pass', (t) ->
  v = vait()

  setTimeout ->
    v.pass '9'
  , 50

  time1 = Date.now()
  value = await v
  time2 = Date.now()

  t.is value, '9'
  t.true time2 > time1


test 'vait fail', (t) ->
  v = vait()

  err = new Error 'error'

  setTimeout ->
    v.fail err
  , 50

  t.throws v


test 'vait.timeout', (t) ->
  time1 = Date.now()
  await vait.timeout(50)
  time2 = Date.now()

  t.true time2 > time1
  t.true (time2 - time1) >= 50


test 'vait.nextTick', (t) ->
  time1 = Date.now()
  await vait.timeout(50)
  time2 = Date.now()

  t.true(time2 > time1)
