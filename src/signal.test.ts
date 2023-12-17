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

test('Signal trigger ignore error', () => {
  const sig = Signal<void>()

  let __val__ = 0
  let __is_call_console_warn__ = false

  const beforeConsole = console
  global.console = {
    ...console,
    warn() {
      __is_call_console_warn__ = true
    }
  }

  sig.receive(() => {
    throw Error('failure')
  })
  sig.receive(() => {
    __val__ = 999
  })

  sig.trigger()

  expect(__val__).toBe(999)
  expect(__is_call_console_warn__).toBe(true)

  global.console = beforeConsole
})

test('Signal cancelReceive()', () => {
  const sig = Signal<void>()

  let __val__ = 0
  const handler = () => {
    __val__ = 999
  }
  sig.receive(handler)
  sig.cancelReceive(handler)
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
