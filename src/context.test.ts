import { Context } from './context'

test('Context get', () => {
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

test('Context set', () => {
  const ctx = Context({ val: 0 })

  expect(ctx.get('val')).toBe(0)
  ctx.set('val', 999)

  expect(ctx.get('val')).toBe(999)
})

test('Context exist', () => {
  const ctx = Context({ val: 0 })
  expect(ctx.exist('val')).toBe(true)
  expect(ctx.exist('notfound')).toBe(false)
})

test('Context exist throw', () => {
  const ctx = Context({ val: 0, und: undefined })

  expect(() => {
    const b = ctx.get('notfound')
  }).toThrow()

  expect(() => {
    ctx.set('notfound', 9)
  }).toThrow()
})

test('Context not support Propertype', () => {
  const ctx = Context(Object.create({ val: 0, und: undefined }))

  expect(ctx.exist('val')).toBe(false)
  expect(() => ctx.get('val')).toThrow()
  expect(() => ctx.set('val', 9)).toThrow()
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
