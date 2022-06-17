import { CreateContext, ContextError, Context } from './context'

test('Context.get', () => {
  const func = () => {}
  const obj = { a: 9 }
  const ctx = CreateContext({
    val: 0,
    undefined: undefined,
    null: null,
    func,
    obj
  })

  expect(ctx.get('val')).toBe(0)
  expect(ctx.get('undefined')).toBe(undefined)
  expect(ctx.get('null')).toBe(null)
  expect(ctx.get('func')).toBe(func)
  expect(ctx.get('obj')).toBe(obj)
})

test('Context.set', () => {
  const ctx = CreateContext({ val: 0 })

  expect(ctx.get('val')).toBe(0)
  ctx.set('val', 999)

  expect(ctx.get('val')).toBe(999)
})

test('Context.has', () => {
  const ctx = CreateContext({ val: 0 })
  expect(ctx.has('val')).toBe(true)
  expect(ctx.has('notfound')).toBe(false)
})

test('Context not support Prototype', () => {
  const ctx = CreateContext(Object.create({ val: 0, und: undefined }))

  expect(ctx.has('val')).toBe(false)
  expect(() => ctx.get('val')).toThrow()
  expect(() => ctx.set('val', 9)).toThrow()
})

test('Context throw', () => {
  const ctx = CreateContext({ val: 0 })

  expect(() => {
    ctx.get('notfound')
  }).toThrow()

  expect(() => {
    ctx.set('notfound', 9)
  }).toThrow()
})

test('ContextError', () => {
  const ctx = CreateContext({ val: 0 })
  try {
    ctx.get('notfound')
  } catch (err) {
    expect(err instanceof ContextError).toBe(true)
  }
})

test('Context immutable', () => {
  const ctx = CreateContext({})
  expect(() => {
    Object.assign(ctx, { get: 9 })
  }).toThrow()
  expect(() => {
    Object.assign(ctx, { set: 9 })
  }).toThrow()
  expect(() => {
    Object.assign(ctx, { other: 9 })
  }).toThrow()
})

test('context share', () => {
  type InitContext = Context<string, { a: number, b: number, c: number }>

  function foo(ctx: InitContext) {
    ctx.set('a', 2)
  }
  function bar(ctx: InitContext) {
    ctx.set('b', ctx.get('a') * ctx.get('b'))
  }

  const c = CreateContext<string, { a: number, b: number, c: number }>({
    a: 0,
    b: 10,
    c: 1
  })

  foo(c)
  expect(c.get('a')).toBe(2)

  bar(c)
  expect(c.get('b')).toBe(20)
})
