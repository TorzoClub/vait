import { Memo, MemoError, WithValidating, ChangedSignal } from './memo'
import assert from 'assert'

const positiveValidator = (val: number) => {
  if (val <= 0) {
    return 'Value must be positive'
  }
}

const nonEmptyStringValidator = (val: string) => {
  if (!val.trim()) {
    return 'String must not be empty'
  }
}

const evenNumberValidator = (val: number) => {
  if (val % 2 !== 0) {
    return 'Value must be an even number'
  }
}

test('Memo should successly getData/setData', () => {
  const [get, set] = Memo(9)
  expect(get()).toBe(9)
  set(0)
  expect(get()).toBe(0)
})

test('Memo.get/Memo.set', () => {
  const m = Memo(0)
  expect(Memo.value(m)).toBe(0)

  Memo.change(m, 9)
  expect(Memo.value(m)).toBe(9)
})

test('Memo.forward', () => {
  const previous = Memo(0)
  const next = Memo(100)
  Memo.forward(next, previous)

  expect(Memo.value(previous)).toBe(100)

  Memo.change(next, 999)

  expect(Memo.value(next)).toBe(999)
  expect(Memo.value(previous)).toBe(999)
})

// 测试 Memo 在被卸载时的行为
test('Memo should clean up properly after validation removal', () => {
  const memo = Memo(1)
  const [getData, setData] = memo
  const removeValidator = Memo.addValidator(memo, positiveValidator)

  expect(() => setData(-1)).toThrow(MemoError)

  removeValidator()

  expect(() => setData(-1)).not.toThrow()
})

// 测试多重验证器
test('WithValidating should support multiple validators', () => {
  const memo = Memo(1)
  const cancel1 = Memo.addValidator(memo, (i) => {
    if (i < 0) {
      return 'fff'
    }
  })
  const cancel2 = Memo.addValidator(memo, (i) => {
    if (i > 10) {
      return 'fff'
    }
  })
  const [get, set] = memo
  expect(() => set(-1)).toThrow()
  expect(() => set(0)).not.toThrow()
  expect(() => set(5)).not.toThrow()
  expect(() => set(11)).toThrow()

  cancel2()

  expect(() => set(999)).not.toThrow()
  expect(() => {
    Memo.addValidator(memo, (i) => {
      if (i > 10) {
        return 'fff'
      }
    })
  }).toThrow()

  expect(() => set(-1)).toThrow()

  cancel1()

  expect(() => set(-1)).not.toThrow()
})

// 测试动态调整验证器
test('Dynamic validators should work correctly', () => {
  const memo = Memo(10)
  const [getData, setData] = memo
  const removeValidator = Memo.addValidator(memo, positiveValidator)

  setData(20)
  expect(getData()).toBe(20)

  removeValidator()
  Memo.addValidator(memo, evenNumberValidator)

  setData(22)
  expect(getData()).toBe(22)

  expect(() => setData(21)).toThrow(MemoError)
})

// 测试 Memo.addValidator 函数的边缘情况
test('Memo.addValidator should throw error when adding invalid initial value', () => {
  const memo = Memo(1)
  const [,setData] = memo
  let cancel: any
  // 在添加验证器时验证当前值是否有效
  expect(() => {
    cancel = Memo.addValidator(memo, positiveValidator)
  }).not.toThrow()

  expect(() => setData(-10)).toThrow()

  cancel()

  expect(() => setData(-10)).not.toThrow()

  expect(() => Memo.addValidator(memo, positiveValidator)).toThrow(MemoError)
})

// 测试 WithValidating 函数
test('WithValidating should create a validated memo', () => {
  const memo = Memo(10)
  const [ getData, setData ] = memo
  const validatedMemo = WithValidating(memo, positiveValidator);

  const [validGetData, validSetData] = validatedMemo;

  // 尝试设置一个有效值
  validSetData(15);
  expect(validGetData()).toBe(15);
  expect(getData()).toBe(validGetData())

  // 尝试设置一个无效值并捕获异常
  expect(() => validSetData(-5)).toThrow(MemoError)
  expect(validGetData()).toBe(15)
  expect(getData()).toBe(validGetData())
})

// 测试 WithValidating 的边缘情况
test('WithValidating should not allow invalid values to be set', () => {
  const memo = Memo('')
  const [getData, setData] = memo
  expect(() => {
    WithValidating(memo, nonEmptyStringValidator);
  }).toThrow(MemoError)

  setData('samevalue')

  const [validGetData, validSetData] = WithValidating(memo, nonEmptyStringValidator);

  expect(() => validSetData('')).toThrow(MemoError)
  expect(() => validSetData('  ')).toThrow(MemoError)

  expect(validGetData()).toBe('samevalue')

  expect(getData()).toBe(validGetData())

  validSetData('Valid string')
  expect(validGetData()).toBe('Valid string')

  expect(getData()).toBe(validGetData())
})

function integerValidator<T>(v: T) {
  if (!Number.isInteger(v)) {
    return 'integer required'
  }
}

test('原 memo 发生改动的时候不会影响 WithValidating 的 memo', () => {
  const m = Memo(0)
  const [sourceGet, sourceSet] = m
  const [get, set] = WithValidating(m, integerValidator)
  expect(() => set(1.1)).toThrow()
  expect(() => sourceSet(1.1)).not.toThrow()
  expect(sourceGet()).toBe(1.1)
  expect(get()).toBe(0)
})

test('WithValidating 有变动的话则会修改原Memo', () => {
  const m = Memo(0)
  const [sourceGet, sourceSet] = m
  const [get, set] = WithValidating(m, integerValidator)
  expect(() => set(1.1)).toThrow()
  set(123)
  expect(sourceGet()).toBe(123)
  expect(sourceGet()).toBe(get())
})

test('WithValidating 不会在修改原 memo 的时候进行 validating', () => {
  const m = Memo(0)
  const [sourceGet, sourceSet] = m
  const [get, set] = WithValidating(m, integerValidator)

  expect(() => set(1.1)).toThrow()
  expect(sourceGet()).toBe(0)
  expect(get()).toBe(0)

  expect(() => sourceSet(1.1)).not.toThrow()
  expect(get()).toBe(0)
  expect(sourceGet()).toBe(1.1)

  expect(() => sourceSet(5)).not.toThrow()
  expect(sourceGet()).toBe(5)
})

test('WithValidating/Memo.addValidator should prevent recursive updates', () => {
  const m = Memo(1.1)
  const [get,set] = m
  expect(() => {
    Memo.addValidator(m, () => {
      set(22233)
    })
  }).toThrow()
  expect(get()).not.toBe(22233)
  set(9)
  expect(get()).toBe(9)

  {
    let start_validating = false
    const [get, set] = WithValidating(Memo(0), () => {
      if (start_validating)
        set(233)
    })
    start_validating = true
    expect(() => {
      set(1)
    }).toThrow()
    expect(get()).toBe(0)
  }

  {
    const m = Memo(0)
    const [get,set] = m

    let start_validating = false
    Memo.addValidator(m, () => {
      if (start_validating)
        set(233)
    })
    start_validating = true

    expect(() => {
      set(1)
    }).toThrow()
    expect(get()).toBe(0)
  }
})

test('WatchMemo', () => {
  const m = Memo(0)
  const [ get, set ] = m
  expect(get()).toBe(0)

  let __watcher_is_called__ = false
  Memo.watch(m, (changed_data) => {
    __watcher_is_called__ = true
    expect(changed_data).toBe(999)
  })

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(true)
})

test('WatchMemo remove watcher', () => {
  const m = Memo(0)
  const [ get, set ] = m

  let __watcher_is_called__ = false
  const cancelWatch = Memo.watch(m, () => {
    __watcher_is_called__ = true
  })

  cancelWatch()

  set(999)

  expect(get()).toBe(999)
  expect(__watcher_is_called__).toBe(false)
})

// 测试 Memo.watch 的边缘情况
test('Memo.watch should prevent recursive updates', () => {
  const memo = Memo(0)
  const [getData, setData] = memo
  const callback = jest.fn();

  expect(() => {
    Memo.watch(memo, (newValue) => {
      callback(newValue)
      if (newValue < 10) {
        setData(newValue + 1)
      }
    })
    setData(1)
  }).toThrow(MemoError)
})

// 测试 Watcher 的多次解除绑定
test('Watcher should handle multiple removals gracefully', () => {
  const memo = Memo(10)
  const [,setData] = memo
  const callback = jest.fn()
  const unwatch = Memo.watch(memo, callback)

  unwatch()
  unwatch() // 再次调用移除不应产生问题
  setData(20)
  expect(callback).not.toHaveBeenCalled()
})

test('WithWatching/Memo.watch should prevent recursive updates', () => {
  const m = Memo(0)
  const [ get, set ] = m

  const beforeConsole = console

  let cancel: any
  expect(() => {
    cancel = Memo.watch(m, () => {
      set(10000)
    })
    set(9)
  }).toThrow(MemoError)
  expect(get()).toBe(0)

  cancel()

  set(9)
  expect(get()).toBe(9)

  {
    set(0)
    const [watchingMemo, watch] = ChangedSignal(m)
    const [,w_set] = watchingMemo
    const cancel = watch(() => {
      w_set(10)
    })
    expect(() => w_set(222)).toThrow()
    expect(() => set(2)).not.toThrow()
  }

  global.console = beforeConsole
})

// 测试 Memo.watch 与 Memo.addValidator 的结合
test('Memo.watch should work with validators', () => {
  const memo = Memo(10)
  const [getData, setData] = memo
  const callback = jest.fn()

  Memo.addValidator(memo, positiveValidator)
  Memo.watch(memo, callback)

  setData(20)
  expect(callback).toHaveBeenCalledWith(20)
  expect(() => setData(-10)).toThrow(MemoError)
  expect(callback).toHaveBeenCalledTimes(1) // 验证不应被调用
})

test('watching ValidatingMemo By ValidatingMemo(WatchMemo(Memo', () => {
  const m = Memo(0)
  const [ get, set ] = m
  let changed = 0
  Memo.watch(m, () => {
    changed +=1
  })

  Memo.addValidator(m, (v) => {
    if (v < 0) return 'failure'
  })

  expect(changed).toBe(0)

  set(2)
  expect(get()).toBe(2)
  expect(changed).toBe(1)

  expect(() => set(-222)).toThrow(MemoError)
  expect(changed).toBe(1)
})

test('watching ValidatingMemo By WatchMemo(ValidatingMemo(Memo', () => {
  const m = Memo(0)
  Memo.addValidator(m, (v) => {
    if (v < 0) return 'failure'
  })

  const [ get, set ] = m

  let changed = 0
  Memo.watch(m, () => {
    changed += 1
  })

  set(999)

  expect(changed).toBe( 1 )

  expect(() => {
    set(-999)
  }).toThrow(MemoError)
  expect(get()).toBe(999)
  expect(changed).toBe( 1 )

  set(999)
  expect(changed).toBe( 2 )
})

test.only('memo should support cancel in watch handle', () => {
  const m = Memo(2)
  let i: number = 0
  const watchHandler = () => {
    cancel()
    i += 1
  }
  const cancel = Memo.watch(m, watchHandler)

  expect(i).toBe(0)
  Memo.change(m, 1)
  expect(i).toBe(1)

  assert(m.length === 2)

  Memo.change(m, 2)
  expect(i).toBe(1)
})
