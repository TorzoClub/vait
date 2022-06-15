import { Context, ContextError } from './context'

test('Context.get', () => {
  const func = () => {}
  const obj = { a: 9 }
  const ctx = Context({
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
  const ctx = Context({ val: 0 })

  expect(ctx.get('val')).toBe(0)
  ctx.set('val', 999)

  expect(ctx.get('val')).toBe(999)
})

test('Context.has', () => {
  const ctx = Context({ val: 0 })
  expect(ctx.has('val')).toBe(true)
  expect(ctx.has('notfound')).toBe(false)
})

test('Context not support Prototype', () => {
  const ctx = Context(Object.create({ val: 0, und: undefined }))

  expect(ctx.has('val')).toBe(false)
  expect(() => ctx.get('val')).toThrow()
  expect(() => ctx.set('val', 9)).toThrow()
})

test('Context throw', () => {
  const ctx = Context({ val: 0 })

  expect(() => {
    ctx.get('notfound')
  }).toThrow()

  expect(() => {
    ctx.set('notfound', 9)
  }).toThrow()
})

test('ContextError', () => {
  const ctx = Context({ val: 0 })
  try {
    ctx.get('notfound')
  } catch (err) {
    expect(err instanceof ContextError).toBe(true)
  }
})

test('Context immutable', () => {
  const ctx = Context({})
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
