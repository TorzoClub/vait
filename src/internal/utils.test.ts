import {
  getWeakMapItem,
  removeByItem,
  removeItem,
  weakMapItemIfExist,
} from './utils'

describe('removeByItem', () => {
  test('移除所有匹配项并保持其余顺序', () => {
    const list = ['a', 'b', 'a', 'c']

    expect(removeByItem(list, 'a')).toEqual(['b', 'c'])
    expect(list).toEqual(['a', 'b', 'a', 'c'])
  })

  test('没有匹配项时返回内容相同的新数组', () => {
    const list = [1, 2, 3]
    const result = removeByItem(list, 4)

    expect(result).toEqual([1, 2, 3])
    expect(result).not.toBe(list)
  })

  test('空数组', () => {
    expect(removeByItem([], 'a')).toEqual([])
  })

  test('按引用移除对象', () => {
    const a = { id: 1 }
    const b = { id: 2 }
    const list = [a, b, a]

    expect(removeByItem(list, a)).toEqual([b])
  })
})

describe('removeItem', () => {
  test('移除第一个匹配项并返回索引', () => {
    const list = ['a', 'b', 'c']

    const [index, result] = removeItem(list, item => item === 'b')

    expect(index).toBe(1)
    expect(result).toEqual(['a', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  test('只移除第一个匹配项', () => {
    const list = ['a', 'b', 'a', 'c']

    const [index, result] = removeItem(list, item => item === 'a')

    expect(index).toBe(0)
    expect(result).toEqual(['b', 'a', 'c'])
  })

  test('没有匹配项时返回 -1 与原数组引用', () => {
    const list = [1, 2, 3]

    const [index, result] = removeItem(list, item => item === 4)

    expect(index).toBe(-1)
    expect(result).toBe(list)
  })

  test('空数组返回 -1 与原数组引用', () => {
    const list: number[] = []

    const [index, result] = removeItem(list, () => true)

    expect(index).toBe(-1)
    expect(result).toBe(list)
  })

  test('回调收到 value / index / 原数组', () => {
    const list = ['a', 'b', 'c']
    const callback = vi.fn((value: string, index: number, array: string[]) => {
      expect(array).toBe(list)
      return value === 'b' && index === 1
    })

    const [index] = removeItem(list, callback)

    expect(index).toBe(1)
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenNthCalledWith(1, 'a', 0, list)
    expect(callback).toHaveBeenNthCalledWith(2, 'b', 1, list)
  })
})

describe('getWeakMapItem', () => {
  test('不存在时创建默认值并写回 WeakMap', () => {
    const map = new WeakMap<object, string>()
    const key = {}
    const createDefault = vi.fn(() => 'default')

    const result = getWeakMapItem(map, key, createDefault)

    expect(result).toBe('default')
    expect(createDefault).toHaveBeenCalledTimes(1)
    expect(map.get(key)).toBe('default')
  })

  test('已存在时直接返回，不调用 createDefault', () => {
    const map = new WeakMap<object, number>()
    const key = {}
    map.set(key, 42)
    const createDefault = vi.fn(() => 0)

    expect(getWeakMapItem(map, key, createDefault)).toBe(42)
    expect(createDefault).not.toHaveBeenCalled()
  })

  test('不同 key 使用不同的默认值', () => {
    const map = new WeakMap<object, number>()
    const a = {}
    const b = {}
    let count = 0

    const valueA = getWeakMapItem(map, a, () => ++count)
    const valueB = getWeakMapItem(map, b, () => ++count)

    expect(valueA).toBe(1)
    expect(valueB).toBe(2)
    expect(count).toBe(2)
  })
})

describe('weakMapItemIfExist', () => {
  test('存在时回调收到值', () => {
    const map = new WeakMap<object, string>()
    const key = {}
    map.set(key, 'value')
    const ifExist = vi.fn()

    weakMapItemIfExist(map, key, ifExist)

    expect(ifExist).toHaveBeenCalledTimes(1)
    expect(ifExist).toHaveBeenCalledWith('value')
  })

  test('不存在时不调用回调', () => {
    const map = new WeakMap<object, string>()
    const ifExist = vi.fn()

    weakMapItemIfExist(map, {}, ifExist)

    expect(ifExist).not.toHaveBeenCalled()
  })
})
