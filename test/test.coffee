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

test 'vait.__value__', (t) ->
    v = vait()

    setTimeout ->
      v.pass '9'
    , 50

    value = await v

    t.is '9', v.__value__

test 'vait fail', (t) ->
  v = vait()

  err = new Error 'error'

  setTimeout ->
    v.fail err
  , 50

  t.throws v

test 'vait.__error__', (t) ->
    v = vait()

    err = new Error 'error'

    setTimeout ->
      v.fail err
    , 50

    await t.throws v
    t.is err, v.__error__

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


test 'vait.__finally__', (t) ->
  v = vait()

  setTimeout ->
    v.pass '9'
  , 50

  t.is v.__finally__, false

  value = await v

  t.is v.__finally__, true
