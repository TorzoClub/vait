# 可观察状态：Memo

`Memo` 是一个「取值 / 设值 + 校验器 + 监听器」的最小状态容器。

```ts
import { Memo, MemoError, WithValidating, ChangedSignal } from 'vait'
```

---

## 基本用法

```ts
const m = Memo(0)
const [get, set] = m

get() // 0
set(9)
get() // 9
```

也可以使用静态方法：

```ts
Memo.value(m)      // 取值
Memo.change(m, 9)  // 设值
Memo.getGetter(m)  // 取出 getter
Memo.getSetter(m)  // 取出 setter
```

**返回结构**：`Memo(data)` 返回一个数组 `[getter, setter, ...hooks]`，其中 `hooks` 分为两类：

- `before`：设值**前**执行（校验器），抛错则回滚、值不变；
- `after`：设值**成功后**执行（监听器）。

设值流程：运行所有 `before` → 更新内部值 → 运行所有 `after`。任一步抛出，内部值都会回滚到旧值并向外抛出。

---

## 监听与校验

```ts
const m = Memo(0)

Memo.watch(m, v => console.log('changed to', v))                  // after
Memo.addValidator(m, v => v < 0 ? 'must >= 0' : undefined)        // before

Memo.change(m, 5)  // 打印 changed to 5
Memo.change(m, -1) // 抛 MemoError，值仍为 5
```

### Memo.watch

```ts
const cancel = Memo.watch(m, newValue => { /* ... */ })
cancel() // 取消监听
```

- 返回取消函数。
- **可以在监听器内部调用取消函数**，用于“只响应一次”。

```ts
const m = Memo(2)
let count = 0
const cancel = Memo.watch(m, () => {
  cancel()
  count += 1
})

Memo.change(m, 1) // count = 1
Memo.change(m, 2) // count 仍为 1
```

### Memo.addValidator

```ts
const remove = Memo.addValidator(m, value => {
  return value < 0 ? '必须为非负数' : undefined // 返回字符串 = 校验失败
})
```

- 校验器返回 `undefined` 视为通过，返回字符串视为失败（抛 `MemoError`，消息为 `validating failure: <字符串>`）。
- 添加时会**立即用当前值校验一次**；不通过则抛错且不会注册。
- 可叠加多个校验器，按注册顺序执行。

### Memo.forward

```ts
Memo.forward(from, to) // 立即把 from 的值同步给 to，并持续单向转发
```

- 单向：`from` 变 → `to` 变。
- 返回取消转发函数。

---

## WithValidating

在既有 Memo 之上包一层“带校验的视图”。

```ts
const base = Memo(0)
const validated = WithValidating(base, v => v < 0 ? 'must >= 0' : undefined)

validated[1](10)   // 通过，base 同步变为 10
validated[1](-1)   // 抛 MemoError，base 不变
```

**方向性（重要）**

- 通过 `validated` 设值 → 会同步到原 `base`；
- 直接改 `base` → **不会**同步回 `validated`（validated 保持自己的值）。

```ts
const base = Memo(0)
const [getBase, setBase] = base
const [getValidated, setValidated] = WithValidating(base, v => v < 0 ? 'fail' : undefined)

setValidated(10)
getBase()      // 10
getValidated() // 10

setBase(99)
getBase()      // 99
getValidated() // 10（不跟随）
```

这是有意设计：校验层只保证“经过它的写入”合法，不拦截绕过它的写入。

- `WithValidating` 会先用当前值校验一次；不通过直接抛错。
- 校验失败时原值不变，`validated` 的值也不变。

---

## ChangedSignal

把一个 Memo 变成“可写入并发出信号”的源。

```ts
const source = Memo(0)
const [watching, receive] = ChangedSignal(source)

const cancel = receive(v => console.log('changed', v))

watching[1](5)         // 打印 changed 5；同时 source 也变为 5
Memo.change(source, 7) // source 变为 7，但 watching 仍是 5，信号不触发
```

**语义**

- 返回 `[watchingMemo, receive]`。
- 通过 `watchingMemo` 写入：既更新 `source`，也触发信号。
- 直接改 `source`：不会反映到 `watchingMemo`，也不触发信号（单向转发 `watching → source`）。
- 在信号回调里再次写 `watchingMemo` 会因递归设值抛 `MemoError`。

> 换句话说，`ChangedSignal` 更适合“作为可观察的写入代理”，而不是“监听外部对 Memo 的改动”。想监听任意改动请直接用 `Memo.watch`。

---

## 细节汇总

| 行为 | 说明 |
| --- | --- |
| 值相等也会触发 | 即使新旧值相同，`after` 监听器仍会被调用 |
| 钩子顺序 | 多个 `before` / `after` 按注册顺序执行 |
| 递归设值 | 在 `before` / `after` 内再次设值会抛 `MemoError("can't setData in hooks")` |
| 失败回滚 | `before` 或 `after` 抛错时，值回滚到本次设值前的旧值 |
| 底层 API | `appendTypedFunc(memo, typedFunc)` 可手动挂载带 `type`（`'before'` / `'after'`）标记的钩子 |
| 类型标记 | getter 带 `.type === 'getter'`，setter 带 `.type === 'setter'`，便于框架识别 |
