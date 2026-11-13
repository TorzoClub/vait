# 实验性 / 未导出模块

下面这些模块存在于 `src/`，但**没有从 `src/index.ts` 导出**，也缺少完整测试，属于实验或内部工具，API 可能变化。引用时请使用源码路径。

---

## data.ts：Val

把值包装成“可直接调用 + 可 map”的函子。

```ts
import { Val } from './data'

const v = Val(2)

v()          // 2   —— 直接调用取值
v.get()      // 2
v.map(n => n * 2)() // 4
```

**API**

| 成员 | 说明 |
| --- | --- |
| 调用 `v()` | 等价于 `v.get()`，返回内部值 |
| `v.get()` | 取值 |
| `v.map(fn)` | 返回一个新的 `Val`，值为 `fn(v())` |

**细节**

- `Val(data)` 返回一个被 `Object.freeze` 的函数对象。
- `map` 不会修改原值。

---

## new_memo.ts：新一代 Memo（实验）

与 [memo.ts](./memo.md) 同名但 API 完全不同，仍处于实验阶段。该模块与 `memo.ts` 存在命名冲突，且未导出，不建议在生产代码中使用。

### Memo

```ts
import { Memo, MemoSpreaded } from './new_memo'

const m = Memo(1)
m.value()  // 1
m.change(2)
m.value()  // 2

m.map(n => n + 1).value()                        // 3
m.ap(Memo((n: number) => n * 10)).value()        // 20
```

| 成员 | 说明 |
| --- | --- |
| `value()` | 取值 |
| `change(newData)` | 设值 |
| `map(fn)` | 返回映射后的新 `Memo` |
| `ap(mfn)` | 用 `Memo<函数>` 应用到当前值 |

`MemoSpreaded<D>(data)` 返回 `[value, change, memo]`，便于解构：

```ts
const [get, set, memo] = MemoSpreaded(0)
set(9)
get() // 9
```

### ReactiveMemo

```ts
import {
  Memo, ReactiveMemo, ForwardReactiveMemo,
  WatchReactiveMemo, ValidateReactiveMemo,
} from './new_memo'

const source = Memo(0)
const [get, set, willChange, changed] = ReactiveMemo(source)

const cancelWatch = WatchReactiveMemo([get, set, willChange, changed], v => {
  console.log('changed', v)
})

set(5) // 打印 changed 5
```

| API | 说明 |
| --- | --- |
| `ReactiveMemo(memo)` | 返回 `[get, set, sigWillChange, sigChanged]` |
| `ForwardReactiveMemo(from, to)` | 把响应式 memo 的变更单向转发到普通 `Memo` |
| `WatchReactiveMemo(m, cb)` | 监听变更，返回取消函数 |
| `ValidateReactiveMemo(m, validator)` | 注册（可异步的）校验器，返回字符串即视为失败 |

**细节**

- `ReactiveMemo` 的写入会依次触发 `willChange`（校验）与 `changed`（通知）。
- `ValidateReactiveMemo` 的校验器支持返回 Promise，但通知是异步的，需要自行处理竞态。
- 递归设值（在钩子里再 set）会抛 `MemoError`。
