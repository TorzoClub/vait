import { Signal } from './signal'

test('Signal', () => {
  const obj = Signal()
  expect(typeof obj).toBe('object')
})

test('Signal trigger', () => {
  const sig = Signal<void>()

  let __val__ = 0
  sig.receive(() => {
    __val__ = 999
  })
  sig.trigger()

  expect(__val__).toBe(999)
})

test('Signal trigger queue', () => {
  const sig = Signal<void>()

  let __val__ = 0

  sig.receive(() => {
    __val__ = 1
  })
  sig.receive(() => {
    expect(__val__).toBe(1)
    __val__ = 2
  })
  sig.receive(() => {
    expect(__val__).toBe(2)
    __val__ = 3
  })
  sig.receive(() => {
    expect(__val__).toBe(3)
    __val__ = 4
  })

  sig.trigger()
})

function ignoreConsoleWarn(fakeWarning: typeof console.warn) {
  const beforeConsole = console
  global.console = {
    ...console,
    warn: fakeWarning,
  }
  return () => global.console = beforeConsole
}

test('Signal trigger ignore error', () => {
  const sig = Signal<void>()

  let __val__ = 0
  let __is_call_console_warn__ = false

  const restoreConsole = ignoreConsoleWarn(() => {
    __is_call_console_warn__ = true
  })

  sig.receive(() => {
    throw Error('failure')
  })
  sig.receive(() => {
    __val__ = 999
  })

  sig.trigger()

  expect(__val__).toBe(999)
  expect(__is_call_console_warn__).toBe(true)

  restoreConsole()
})

test('Signal receive() return value', () => {
  const sig = Signal()

  let __val__ = 0
  const handler = () => {
    __val__ = 999
  }
  const cancel = sig.receive(handler)
  sig.trigger()
  expect(__val__).toBe(999)

  cancel()
  __val__ = 0
  sig.trigger()
  expect(__val__).toBe(0)
})

test('Signal cancelReceive()', () => {
  const sig = Signal<void>()

  let __val__ = 0
  const handler = () => {
    __val__ = 999
  }
  sig.receive(handler)
  sig.trigger()
  expect(__val__).toBe(999)

  sig.cancelReceive(handler)
  __val__ = 0
  sig.trigger()
  expect(__val__).toBe(0)
})

test('Signal cancelReceive() other func', () => {
  const sig = Signal<void>()

  let __val__ = 0
  const handler = () => {
    __val__ = 999
  }

  sig.receive(handler)
  sig.cancelReceive(handler)

  const otherFn = () => {}
  sig.cancelReceive(otherFn)

  sig.trigger()

  expect(__val__).toBe(0)
})


test('Signal cancelReceive() queue', () => {
  const sig = Signal<void>()

  let __val__ = 0
  const handler = () => {
    __val__ = 999
  }
  sig.receive(handler)
  sig.receive(() => {
    expect(__val__).toBe(0)
  })
  sig.receive(() => {
    __val__ = 3
  })

  sig.cancelReceive(handler)
  sig.trigger()

  expect(__val__).toBe(3)
})

test('Signal isEmpty()', () => {
  const sig = Signal()
  expect(sig.isEmpty()).toBe(true)

  sig.receive(() => {})
  expect(sig.isEmpty()).toBe(false)
})

test('Signal a large quantity handlers', () => {
  const sig = Signal()
  let l = -1
  const HANDLER_NUMBER = 50_000
  for (let i = 0; i < HANDLER_NUMBER; ++i) {
    sig.receive(() => l = i)
  }
  sig.trigger()
  expect(l).toBe(HANDLER_NUMBER - 1)
})

jest.setTimeout(30000)
test('Signal a large quantity error handlers', async () => {
  const restoreConsole = ignoreConsoleWarn(() => {})

  const sig = Signal()
  let l = -1
  const HANDLER_NUMBER = 10_000
  for (let i = 0; i < HANDLER_NUMBER; ++i) {
    sig.receive(() => {
      l = i
      throw new Error('test')
    })
  }

  const waiting = Signal.wait(sig)

  sig.trigger()

  await waiting
  restoreConsole()

  expect(l).toBe(HANDLER_NUMBER - 1)
})

test('Signal.once', async () => {
  const sig = Signal<9>()
  let call_count = 0
  Signal.once(sig, (p) => {
    call_count += 1
    expect(p).toBe(9)
  })
  sig.trigger(9)
  expect(call_count).toBe( 1 )
  sig.trigger(9)
  expect(call_count).toBe( 1 )
  sig.trigger(9)
  expect(call_count).toBe( 1 )
})

test('Signal.wait', async () => {
  {
    const sig = Signal()
    const p = Signal.wait(sig)
    sig.trigger()
    await p
  }
  {
    const sig = Signal<1>()
    const p = Signal.wait(sig)
    sig.trigger( 1 )
    expect( await p ).toBe( 1 )
  }
})
