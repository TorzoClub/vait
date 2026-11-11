# 下一版本规划（v6 · Next）

> 状态标记：**【已定】** = 你已明确给出的方向；**【提案】** = 我基于现有代码整理的实现建议；**【待决】** = 需要你拍板的问题。本文件是规划草稿，不是已实现 API 的文档。

## 0. 一页速览

| 方向 | 内容 | 状态 |
| --- | --- | --- |
| 编程风格落地 | 去分号、无类、纯度、命名规范 | 【已定】 |
| 命名 / 导出重构 | 统一 PascalCase / camelCase，变量 snake_case，收敛入口 | 【提案】 |
| 实验模块转正 | `context`、`event`、`data`、`new_memo` 纳入正式 API | 【提案】 |
| **新特性 Conveyor** | 带缓冲的两段式异步传送带，支持 Valve | 【已定】方向 /【提案】API |
| `concurrency` 支持异步迭代器 | 让 Conveyor 可以自然建立在 `concurrency` 之上 | 【提案】 |
| 错误体系 | Error 子类 vs 错误工厂 + 类型守卫 | 【待决】 |
| 包导出与构建 | `exports` map、ESM / CJS、类型入口 | 【提案】 |

---

## 1. 编程风格规范（Style Guide）

### 1.1 避免使用分号

所有源码、示例、文档代码块统一**不写行尾分号**。通过工具强制，避免风格漂移。

```ts
// ✅
const [waiting, go] = Wait()

// ❌
const [waiting, go] = Wait();
```

### 1.2 无类编程

如无必要，避免面向对象范式：不用 `class` 建模状态与行为，改用**闭包 + 普通对象**。

```ts
// ✅ 闭包 + 对象：状态被隔离在闭包里，只暴露窄接口
function Queue() {
  const task_list: QueueTask[] = []
  return {
    task(task_func) { /* ... */ },
    getTasks: () => task_list,
  }
}

// ❌ 用 class 承载状态
class Queue {
  private task_list: QueueTask[] = []
  task(task_func) { /* ... */ }
}
```

**唯一例外：错误类型。** JS 中要保留 `instanceof` 与错误栈，最自然的做法是 `class XxxError extends Error`。你可以选择：

- **方案 A（保守）**：错误类作为唯一例外保留，但只做“数据载体”，不带方法、不带业务逻辑；
- **方案 B（彻底）**：用工厂函数 + 守卫函数代替类：

```ts
function createVaitError(from: string, message: string, options?: { cause?: unknown }) {
  const error = new Error(message, options)
  error.name = 'VaitError'
  ;(error as any).from = from
  return error
}

const isVaitError = (value: unknown): value is VaitError =>
  value instanceof Error && value.name === 'VaitError'
```

> 你给出的 `ConveyorError` 是类，说明你倾向于保留错误类；方案 A 与之一致。**此项待决。**

### 1.3 纯度与副作用隔离

原则：**能用纯函数表达的就用纯函数**；无法避免的副作用要**集中在可预期的边界内**并限制其规模。

| 类型 | 例子 | 处理方式 |
| --- | --- | --- |
| 纯函数 | `removeByItem`、`concurrentMap`、`Val` 的 `map` | 直接写，输入输出确定 |
| 受控状态 | `Memo`、`Queue`、`Conveyor` | 状态封在闭包里，对外只暴露读写接口 |
| 环境副作用 | `Timer`、`timeout`、`Signal` 触发回调 | 单独成模块，集中在一处，便于 mock / 替换 |
| 全局可变 | 模块级 `WeakMap`（如 `timeout` 的记录） | 视为全局状态，按命名规范显式标记，并限制写入路径 |

具体建议：

1. **不修改入参**：集合操作返回新数组（`removeByItem` 已是如此）。
2. **不写全局可变状态**：现有 `timeout` 的 `handlers` 属于全局副作用，建议收敛为“仅在模块内可见、只增删、不读取业务数据”的登记表，并按 1.4 命名。
3. **信号 / 队列的触发是副作用**：把它们视为“有意的副作用出口”，其余部分保持纯。

### 1.4 命名规范

| 类别 | 规则 | 示例 |
| --- | --- | --- |
| 函数（动作，返回数据 / Promise） | 小写开头驼峰 `lowerCamelCase` | `timeout`、`rejectTimeout`、`nextTick`、`runTask`、`concurrency`、`concurrentMap` |
| 函数（工厂 / 组合子，返回对象、函数或元组） | 大写开头驼峰 `PascalCase` | `Wait`、`Queue`、`Signal`、`Memo`、`Timer`、`Sequence`、`Concurrent`、`Val`、`Conveyor` |
| 变量 / 参数 / 局部量 | 小写下划线 `lower_snake_case` | `task_list`、`new_data`、`cancel_timer` |
| 模块级全局变量 / 状态 | `__UPPER_SNAKE___`（双前导下划线 + 三尾随下划线） | `__timeout_handlers___`、`__NONE_ERROR___` |
| 仅局部作用域的“全局”状态（闭包内状态） | `__lower_snake`（双前导下划线） | `__is_running`、`__tasks_memo`、`__concurrency_valve` |
| 类型 / 接口 | `PascalCase` | `Queue`、`Conveyor`、`ConcurrencyValve` |

**关于“返回函数的函数用 PascalCase”的落地解释**：你给出的规则是「函数名 camelCase；返回函数的函数用 CamelCase」。结合现有代码（`Queue`、`Signal`、`Memo` 返回对象却是 PascalCase）与你给的 `Conveyor`（返回对象也是 PascalCase），这里归纳为：

- 返回**数据 / Promise** 的“动作” → `lowerCamelCase`；
- 返回**有行为的东西**（函数、对象、元组）的“工厂 / 组合子” → `PascalCase`。

这样 `Timer`、`Sequence`、`Concurrent`（返回函数）与 `Val`（返回可调用对象）都是 PascalCase，自洽。**若你希望严格按字面执行（对象工厂也改 camelCase，如 `wait`、`queue`、`signal`），这是一个大规模破坏性改动，需要单独确认。**

### 1.5 存量代码的命名映射（示例）

| 位置 | 现状 | 目标 |
| --- | --- | --- |
| `timeout.ts` | `const handlers = new WeakMap(...)` | `const __timeout_handlers___ = new WeakMap(...)` |
| `concurrency.ts` | `const NONE_ERROR = Symbol(...)` | `const __NONE_ERROR___ = Symbol(...)` |
| `memo.ts` | 闭包内 `let is_running`、`const arr` | `let __is_running`、`const __arr` |
| `queue.ts` | 闭包内 `const TasksMemo`、`concurrencyValve` | `const __tasks_memo`、`const __concurrency_valve` |
| `new_memo.ts` | 闭包内 `const sig_will_change` | `const __sig_will_change` |
| 各处 | 参数 `taskFunc`、局部 `cancelTimer` | `task_func`、`cancel_timer` |

### 1.6 ESLint 落地建议

```js
module.exports = {
  rules: {
    semi: ['error', 'never'],
    '@typescript-eslint/naming-convention': [
      'error',
      { selector: 'variable', format: ['snake_case'], leadingUnderscore: 'allowDouble', trailingUnderscore: 'allow' },
      { selector: 'function', format: ['camelCase', 'PascalCase'] },
      { selector: 'parameter', format: ['snake_case'], leadingUnderscore: 'allow' },
      { selector: 'typeLike', format: ['PascalCase'] },
    ],
  },
}
```

> 当前使用 ESLint 10 的 flat config（`eslint.config.mjs`）；但 TypeScript 7 暂不被 typescript-eslint 支持，ESLint 目前只检查 JavaScript 文件。上面的 TypeScript 规则需要等 typescript-eslint 支持 TypeScript 7 后再落地；变量强制 snake_case 会对存量代码产生大面积告警，建议在 v6 分支一次性格式化。

## 2. 命名与导出重构

### 2.1 入口收敛

现在 `src/index.ts` 只导出了 12 个模块，`context`、`event`、`data`、`new_memo` 游离在外。建议 v6 把**所有稳定模块都从入口导出**，并补上目前被漏掉的类型：

```ts
// src/index.ts（目标形态）
export * from './wait'
export * from './outter-promise'   // 或改名后的 outer-promise
export * from './concurrent'
export * from './concurrency'
export * from './concurrent-map'
export * from './queue'
export * from './queue-pool'
export * from './sequence'
export * from './signal'           // 补出 Signal、Handler、Handlers、SignalError
export * from './timer'
export * from './timeout'
export * from './next-tick'
export * from './memo'
export * from './context'          // 新增
export * from './event'            // 新增
export * from './val'              // data.ts 转正后
export * from './conveyor'         // 新特性
```

### 2.2 命名调整清单

| 现状 | 目标 | 理由 | 兼容 |
| --- | --- | --- | --- |
| `OutterPromise` | `OuterPromise` | 拼写修正 | 保留旧名别名一版 |
| `CreateContext` | `Context` | 与 `Queue` / `Signal` / `Memo` 一致，去掉动词前缀 | 保留 `CreateContext` 别名 |
| `VaitContextError` | `ContextError` | 错误名统一去掉 `Vait` 前缀 | 保留别名 |
| `MemoSpreaded` | `MemoSpread` | 拼写/语法修正 | 保留别名 |
| `appendTypedFunc` | `AppendTypedFunc`？ | 它返回“取消函数”，按规则应为 PascalCase | 【待决】低层 API，可不改 |
| `executeHandlers` | `ExecuteHandlers` | 已是大写，保持 | — |

### 2.3 兼容策略

建议 v6 提供一层薄的“兼容别名”模块（例如 `src/compat.ts`），把旧名重新导出为新名：

```ts
// src/compat.ts
export { OuterPromise as OutterPromise } from './outter-promise'
export { Context as CreateContext } from './context'
```

同时提供 codemod 脚本或迁移表，让使用方按批替换。大版本可以移除别名。

---

## 3. 实验模块转正

### 3.1 context.ts → `Context`

现状：类型安全、键集合固定的共享容器，但未导出、错误类名为 `VaitContextError`。

**转正要点**

- 改名 `CreateContext` → `Context`，并把 `Context` 类型与工厂分开导出。
- 错误：`VaitContextError` → `ContextError`（或按 1.2 改为工厂 + 守卫）。
- 现状用闭包 + `Object.create(null)` + `Object.freeze`，已经符合“无类 + 副作用隔离”；保持。
- 明确语义：`get/set` 只允许预设键，未知键抛错；不继承原型链。

```ts
import { Context } from 'vait'

const ctx = Context({ count: 0, name: 'vait' })
ctx.set('count', ctx.get('count') + 1)
```

**可选增强（提案）**

- `update(key, fn)`：`ctx.set(key, fn(ctx.get(key)))` 的语法糖，减少手写读写。
- `snapshot()`：返回一份浅拷贝，便于调试 / 测试（纯函数）。

### 3.2 event.ts → `Event`

现状：类型化多事件发布 / 订阅，内部复用 `signal` 的 `ExecuteHandlers`，但未导出；且与 `Signal` 有重复实现。

**转正要点**

- 导出 `Event` 与 `EventSetting` 类型。
- **把 `Event` 建立在 `Signal` 之上**，消除重复的监听器数组管理与错误策略：

```ts
// 目标实现草图：一个事件名对应一个 Signal
function Event<EventSetting>() {
  const __signal_pool = new Map<keyof EventSetting, Signal<unknown>>()
  const signal_of = (evname: keyof EventSetting) => {
    let sig = __signal_pool.get(evname)
    if (!sig) { sig = Signal(); __signal_pool.set(evname, sig) }
    return sig
  }
  return {
    on: (evname, handler) => signal_of(evname).receive(handler),
    emit: (evname, payload) => signal_of(evname).trigger(payload),
    cancelReceive: (evname, handler) => signal_of(evname).cancelReceive(handler),
    isEmpty: (evname) => signal_of(evname).isEmpty(),
  }
}
```

- 与 `Signal` 的分工在文档中写清楚：`Signal` 单频道，`Event` 多命名频道。

### 3.3 data.ts → `Val`

现状：最小函子（可调用 + `get` + `map`），未导出。

**转正要点**

- 导出 `Val`；它返回可调用对象，PascalCase 合规。
- 补充 `ap`（应用函子）与可选的 `flatMap`，与 `new_memo` 的 `map/ap` 对齐：

```ts
import { Val } from 'vait'

const v = Val(2)
v()                          // 2
v.map(n => n + 1)()          // 3
v.ap(Val((n: number) => n * 10))() // 20
```

- 保持 `Object.freeze` 与不可变语义（每步 `map/ap` 返回新值）。
- 定位：`Val` 是**纯**的只读函子；需要可变状态时用 `Memo` / `ReactiveMemo`。

### 3.4 new_memo.ts → 与 memo.ts 合并

现状：两套 `Memo` API 并存，名称冲突、错误类重复（`MemoError` 各定义一份）。

**提案：把“纯函子 / 可变容器 / 响应式”三层拆清楚**

| 层 | 名称 | 说明 |
| --- | --- | --- |
| 纯函子 | `Val` | 只读、`map/ap`，来自 data.ts |
| 可变容器 | `Memo` | 对象式 API：`value / change / map / ap`，来自 new_memo.ts |
| 响应式容器 | `ReactiveMemo` | 在 `Memo` 上加 `willChange / changed` 两条 Signal |

- `MemoSpreaded` → `MemoSpread`，返回 `[value, change, memo]`。
- `LifeCycleMemo` 作为内部函数，不需要导出。
- 合并错误类：只保留一个 `MemoError`（或统一的错误工厂），删除 `ValidatorError` / `MemoValidationError` 的重复定义。
- 响应式算子命名已符合 PascalCase（返回取消函数）：`WatchReactiveMemo`、`ForwardReactiveMemo`、`ValidateReactiveMemo`。

**最大的待决点：旧的数组式 `Memo` 怎么办？**（见第 7 节）

- 【方案 1】新对象式 API 占用 `Memo`，旧数组 API 更名 `MemoTuple` / `MemoStore`，标记 deprecated，保留一版兼容别名。
- 【方案 2】旧 API 保持 `Memo`，新对象式命名为 `State` 或 `Box`，用不同名词避免冲突。
- 【方案 3】只保留一套，直接破坏性升级，不做兼容。

> 方案 1 最贴近“把实验转正”的意图，但迁移面最大；方案 3 最干净。

## 4. 新特性：Conveyor（传送带）

### 4.1 动机

现有的调度工具各有侧重：

- `Sequence` / `Concurrent`：控制**任务整体**的并发；
- `Queue`：可长期投递的任务队列，任务内部自己处理“生产”和“消费”；
- `concurrency` / `concurrentMap`：一次性消费一个迭代器。

但缺少一种“**生产者与消费者解耦、允许中间囤积**”的机制：生产端（sender）很快，消费端（receiver）很慢时，希望生产端继续跑、结果先排队，而不是把生产端也拖慢。这就是 `Conveyor`。

### 4.2 用法（已定）

你给出的用法：

```ts
type A = string & { readonly __brand: unique symbol }
type B = string & { readonly __brand: unique symbol }
type C = string & { readonly __brand: unique symbol }

import { Conveyor } from 'vait'

const con = Conveyor([
  async function sender(arg_a: A, arg_b: B): Promise<C> {
    // do something
    return c
  },
  async function receiver(receive_value: C) {
    // process receive_value
  },
])

con.push(a, b) // 先执行 sender，拿到返回值后再传给 receiver
// con.push 本身返回 Promise，receiver 执行完才 resolve / reject
// resolve 值是 receiver 的返回值
```

- 数组第一项是 **sender**：接收 `push` 的全部参数，产出中间值；
- 数组第二项是 **receiver**：消费中间值，其返回值就是 `push` 的 resolve 值；
- 出错抛 `ConveyorError`，带 `from: 'sender' | 'receiver'`；
- **会囤积、不阻塞**：sender 可以先跑完，中间值排队等 receiver。

### 4.3 错误类型（已定，附修正）

你给的 `ConveyorError` 有两处笔误（`construct` 应为 `constructor`；未声明 `from` 字段），修正后：

```ts
type ConveyorFrom = 'sender' | 'receiver'

class ConveyorError extends Error {
  readonly from: ConveyorFrom

  constructor(from: ConveyorFrom, message?: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConveyorError'
    this.from = from
  }
}
```

> 若第 1.2 节选择“方案 B（错误工厂）”，则改为 `createConveyorError(from, message, options)` + `isConveyorError(value)` 守卫。**待决。**

### 4.4 API 与类型设计（提案）

```ts
type Conveyor<Args extends readonly unknown[], C, R> = {
  push(...args: Args): Promise<R>
  flush(): Promise<void>
  close(): void
  signal: {
    ALL_DONE: Signal<void>
    ERROR: Signal<{ from: ConveyorFrom, error: unknown }>
  }
}

function Conveyor<Args extends readonly unknown[], C, R>(
  stages: readonly [
    sender: (...args: Args) => C | PromiseLike<C>,
    receiver: (value: C) => R | PromiseLike<R>,
  ],
  valve?: ConcurrencyValve | number,
): Conveyor<Args, C, R>
```

| 成员 | 说明 |
| --- | --- |
| `push(...args)` | 投递一个条目，返回该条目 receiver 完成后的 `Promise<R>` |
| `flush()` | 等待当前已接收的条目全部处理完 |
| `close()` | 关闭后拒绝新的 `push`（已接收的继续处理） |
| `signal.ALL_DONE` | 传送带排空时触发 |
| `signal.ERROR` | 某个条目失败时触发，避免 fire-and-forget 造成的未处理拒绝 |

**类型推断注意**：从 `[sender, receiver]` 反推变参 `Args` 在 TS 里不够稳定，可能需要调用处显式标注，或提供 `Conveyor.of` 之类的辅助。**待决**（是否接受调用时写泛型）。

### 4.5 执行模型：两段式 + 缓冲

```txt
push(a, b) ─┐
push(a, b) ─┼─▶ [ sender 阶段 ]  ──C──▶  FIFO 缓冲（囤积点）  ──▶  [ receiver 阶段 ]  ──R──▶ resolve
push(a, b) ─┘        (快，可并发)                                   (慢，默认串行)
```

语义（提案）：

1. **push 不阻塞**：调用 `push` 立即返回 Promise，sender 异步启动；即使不 await，后续 push 也会继续。
2. **sender 先行**：sender 完成即把中间值放入缓冲；sender 的速度不受 receiver 拖累。
3. **receiver 消费缓冲**：默认串行（并发 1），保证处理顺序与 push 顺序一致。
4. **push 的 Promise 绑定自己那个条目的 receiver**：resolve 值是 receiver 的返回值；sender 失败则不会进入 receiver。
5. **顺序**：默认按 push 顺序 FIFO；若 receiver 并发 > 1，完成顺序可能乱，但每条 push 的 Promise 语义不变。
6. **默认无背压**：缓冲无上限，可以无限囤积（符合“不阻塞”的诉求）；需要限流时用 Valve / 缓冲上限。
7. **纯度**：`Conveyor` 必然有状态（缓冲），状态封在闭包里，对外只暴露窄接口；这是“副作用隔离”的典型场景。

### 4.6 Valve 与背压（提案）

Valve 即 `concurrency.Valve`，可直接复用：

```ts
import { Conveyor, concurrency } from 'vait'

const valve = concurrency.Valve(1)
const con = Conveyor([sender, receiver], valve)

valve.set(4) // receiver 最多 4 个并发
valve.set(0) // 暂停消费，中间值继续囤积（不阻塞 push）
valve.set(1) // 恢复
```

| 阀门控谁 | 效果 | 建议 |
| --- | --- | --- |
| receiver 并发（默认） | 控制消费吞吐，`0` 时暂停消费并囤积 | 与你的描述一致，推荐 |
| sender 并发 | 控制生产速度，防止瞬间打出海量 sender | 可选，第二参数 |
| 缓冲上限 | 满时对 sender 施加背压 | 可选；与“不阻塞”冲突，默认 `Infinity` |

**待决**：`Conveyor(stages, valve)` 的第二个参数到底控制 sender、receiver，还是整体？还是改成选项对象 `Conveyor(stages, { valve, buffer_limit })`？

### 4.7 错误模型（提案）

| 阶段 | 行为 |
| --- | --- |
| sender 抛错 | push 以 `ConveyorError('sender', ..., { cause })` 拒绝；该条目不进入 receiver |
| receiver 抛错 | push 以 `ConveyorError('receiver', ..., { cause })` 拒绝 |
| 单条失败 | **不影响其它条目**（与 `Queue` 一致，默认隔离） |
| 集中处理 | `signal.ERROR` 上报 `{ from, error }`，供不持有 push Promise 的场景 |

```ts
con.signal.ERROR.receive(({ from, error }) => {
  console.error('[' + from + '] 失败', error)
})
```

> 注意：`push` 返回的 Promise 如果既不 await 也不 catch，仍会触发未处理拒绝；`signal.ERROR` 是补充通道，不替代 Promise 的错误处理。

### 4.8 实现草图（基于现有原语）

核心思路：**sender 直接跑（可选加 sender 队列限流），结果投递进一个 receiver 队列；用队列把两段解耦**。

```ts
// 实现草图（非最终代码）
function Conveyor(stages, valve) {
  const [sender, receiver] = stages

  // 囤积点：receiver 队列，默认并发 1；valve 控制其并发
  const __receiver_queue = Queue(QueueSignal())

  if (valve !== undefined) {
    const valve_obj = typeof valve === 'number' ? concurrency.Valve(valve) : valve
    __receiver_queue.setMaxConcurrent(valve_obj.get())
    Memo.watch(valve_obj.memo, n => __receiver_queue.setMaxConcurrent(n))
  }

  function push(...args) {
    const [resolve, reject, promise] = OutterPromise()

    // sender 阶段：异步启动，不阻塞 push
    Promise.resolve()
      .then(() => sender(...args))
      .then(
        value => {
          // 中间值进入 receiver 队列；value / resolve / reject 由闭包捕获
          const __receiver_task = async () => {
            try {
              resolve(await receiver(value))
            } catch (cause) {
              reject(new ConveyorError('receiver', 'receiver failed', { cause }))
            }
          }
          __receiver_queue.task(__receiver_task)
        },
        cause => reject(new ConveyorError('sender', 'sender failed', { cause })),
      )

    return promise
  }

  return { push, /* flush / close / signal */ }
}
```

用到的现有原语：`OutterPromise`、`Queue` + `QueueSignal`、`concurrency.Valve`、`Memo.watch`。中间值通过闭包绑定到 receiver 任务，`value / resolve / reject` 一一对应，因此同一条 push 的返回值不会串号。这也印证了你的判断：**Conveyor 完全可以用 Concurrency / Queue 搭出来**。

若要给 sender 也加并发限制，把 sender 阶段换成一个独立的 `Queue`；若要让序列“先生产后消费”共享一个阀门，则可让两个队列共用一个 Valve。

### 4.9 与 `concurrency` 异步迭代器的关系（提案）

你提到“`concurrency` 本身就支持接收迭代器”。目前它接受的是**同步** `IterableIterator`，而 Conveyor 的缓冲是“边推边消费”，需要一个**可推入的异步迭代器**。建议 v6 一并支持：

```ts
// 1) concurrency 支持异步迭代器
function concurrency<T>(
  valve_or_num: ConcurrencyValve | number,
  iterator: IterableIterator<T> | AsyncIterableIterator<T>,
  async_fn: (item: T, idx: number) => Promise<void>,
): Promise<void>

// 2) 一个由 Wait 驱动的可推入异步迭代器
function BufferedAsyncIterator<T>() {
  const __buffer: T[] = []
  let __waiting: Wait<void> | null = null

  return {
    push(value: T) {
      __buffer.push(value)
      __waiting?.go()
      __waiting = null
    },
    async next() {
      while (__buffer.length === 0) {
        __waiting = Wait()
        await __waiting[0]
      }
      return { value: __buffer.shift() as T, done: false }
    },
    [Symbol.asyncIterator]() { return this },
  }
}
```

这样 Conveyor 的 receiver 阶段就能表达为：

```ts
concurrency(receiver_valve, buffered_iterator, async (job) => {
  /* receiver(job.value) ... */
})
```

**收益**：`concurrency` 与 `Conveyor` 共享同一套并发/阀门语义，避免两套调度实现。
**成本**：`concurrency` 当前的派发循环是同步的（`iterator.next()` 立即返回），要支持 `await next()` 需要改造循环与完成判定。**待决**是否在 v6 做。

## 5. 配套特性（提案）

### 5.1 `concurrency` 支持异步迭代器

见 4.9。这是 Conveyor 的“地基”，也能独立使用（消费异步生成器、流式数据源）。向后兼容：同步迭代器行为不变。

### 5.2 `Pipeline`：纯管道组合器

与 Conveyor 互补的一对：`Pipeline` 是**无状态、无缓冲**的纯函数组合，Conveyor 是**有状态、有缓冲**的传送带。

```ts
import { Pipeline } from 'vait'

const run = Pipeline([
  async (n: number) => n + 1,
  async (n: number) => n * 2,
  async (n: number) => String(n),
])

await run(1) // '4'
```

- 返回函数 ⇒ PascalCase，符合命名规则。
- 无内部状态、无副作用（除了各阶段自身），是最“纯”的调度原语。
- 与 Conveyor 的取舍写进文档：**要背压/囤积用 Conveyor，只要顺序组合用 Pipeline。**

### 5.3 `Event` 与 `Signal` 统一

`Event` 复用 `Signal` 实现（见 3.2），共享同一套错误策略、`once` / `wait` 语义，减少重复代码。

### 5.4 三层状态模型

`Val`（纯只读）→ `Memo`（可变）→ `ReactiveMemo`（可变 + 信号），定位清晰，避免现在两套 `Memo` 打架。

### 5.5 品牌类型助手（可选）

你的 Conveyor 示例里手写了 `unique symbol` 品牌类型。可以把 `utils.ts` 里的 `ID` 升级为真正的名义类型助手：

```ts
declare const __brand: unique symbol

type Brand<T, Name extends string> = T & { readonly [__brand]: Name }

const brand = <T, Name extends string>(value: T): Brand<T, Name> =>
  value as Brand<T, Name>

type A = Brand<string, 'A'>
```

> 现有的 `ID<T, DistinctName> = T & { __TYPE__: DistinctName }` 并非真正名义类型（同结构可互相赋值），升级后更安全。**待决**是否要做。

### 5.6 错误体系统一

把所有错误类 / 工厂集中到一个 `error.ts`，统一：
- 命名：`QueueError`、`SignalError`、`MemoError`、`ContextError`、`ConveyorError`、`TimeoutRejected`、`WaitingRejected`；
- 结构：继承 `Error`，可选 `cause`、`from` 字段；
- 守卫：`isVaitError` / `isConveyorError` 等（若走工厂方案）。

### 5.7 包导出与构建

```json
{
  "exports": {
    ".": {
      "types": "./types/index.d.ts",
      "import": "./dist/vait.esm.js",
      "require": "./dist/vait.common.js"
    }
  },
  "sideEffects": false
}
```

- 现在 `.npmignore` 忽略 `dist/*` 与 `types/*`，但 `package.json` 的 `files` 又包含它们，二者矛盾，需要统一。
- `sideEffects: false` 便于使用方 tree-shaking（前提是模块顶层无副作用，这与“纯度”目标一致）。

---

## 6. 迁移与版本策略

### 6.1 v5 → v6 变更清单

| 变更 | 类别 | 破坏性 | 兼容策略 |
| --- | --- | --- | --- |
| 去掉分号、变量改 snake_case、全局状态加 `__` 前缀 | 源码风格 | 否（不改变行为） | 一次性格式化 |
| 无类化（错误除外） | 源码风格 | 否 | 逐模块重构 |
| `context` / `event` / `data` / `new_memo` 转正导出 | 新增 | 否 | — |
| `OutterPromise` → `OuterPromise` | 命名 | 是 | 别名一版 |
| `CreateContext` → `Context` | 命名 | 是 | 别名一版 |
| `VaitContextError` → `ContextError` | 命名 | 是 | 别名一版 |
| 新 `Memo` 取代旧数组式 `Memo` | API | 是 | 见第 7 节待决 |
| 错误类 → 工厂（若选择方案 B） | API | 是（`instanceof` 失效） | 守卫函数 |
| `concurrency` 支持异步迭代器 | 增强 | 否 | — |
| `Conveyor` | 新增 | 否 | — |
| `exports` map / `sideEffects` | 打包 | 可能影响深路径引用 | 文档提示 |

### 6.2 建议的落地顺序（里程碑）

1. **M1 · 风格与地基**：ESLint 规则、去分号、变量命名、无类化重构；行为不变，全量测试必须绿。
2. **M2 · 入口收敛**：导出全部稳定模块 + 兼容别名；补类型。
3. **M3 · 异步迭代器**：扩展 `concurrency`，新增 `BufferedAsyncIterator`（内部）。
4. **M4 · Conveyor**：在 M3 之上实现，补齐囤积 / Valve / 错误 / flush 的测试。
5. **M5 · 状态层合并**：`Val` / `Memo` / `ReactiveMemo` 定稿，处理旧 `Memo` 迁移。
6. **M6 · 打包与发布**：`exports`、类型、文档、迁移指南。

### 6.3 测试计划（新增）

- Conveyor：囤积（sender 快 / receiver 慢）、顺序、Valve 动态调整、`valve.set(0)` 暂停、sender / receiver 各自的错误、`flush`、大量 push 的内存与不阻塞行为。
- 异步迭代器：空迭代器、并发中途变化、错误中断、`Infinity`。
- 兼容别名：旧名可用且指向同一实现。

---

## 7. 待决问题清单

按重要性排序，建议先回答前 6 个：

1. **命名规则的边界**：对象工厂（`Wait` / `Queue` / `Signal` / `Memo` / `Conveyor`）保持 PascalCase，还是严格按“只有返回函数的函数才 PascalCase”而把对象工厂改为 camelCase？（第 1.4 节）
2. **错误体系**：保留 `class XxxError extends Error` 作为唯一例外（方案 A），还是全面改为错误工厂 + 守卫（方案 B）？（第 1.2 / 4.3 节）
3. **旧数组式 `Memo` 的归宿**：方案 1 更名 deprecated / 方案 2 新 API 换名词 / 方案 3 破坏性升级？（第 3.4 节）
4. **Conveyor 的 Valve 控制谁**：receiver 并发（推荐）、sender 并发，还是缓冲上限？第二参数用 Valve 还是选项对象 `{ valve, buffer_limit }`？（第 4.6 节）
5. **Conveyor 的顺序语义**：严格按 push 顺序 FIFO（推荐），还是“sender 谁先完成谁先传给 receiver”？
6. **Conveyor 是否支持超过 2 个阶段**：现在固定 `[sender, receiver]`，而 `ConveyorError.from` 只有两个取值。要不要支持 `[sender, ...middlewares, receiver]`，并把 `from` 扩展为阶段名或索引？
7. **缓冲上限与背压**：默认无限囤积（符合“不阻塞”）是否可接受？是否需要可选的 `buffer_limit`，满时阻塞 sender？
8. **push 的 fire-and-forget 约定**：不 await 的 `push` 是否应默认吞掉错误并只走 `signal.ERROR`，还是保持标准 Promise（会产生未处理拒绝）？
9. **`concurrency` 异步迭代器**是否列入 v6？（M3 的前置）
10. **`Pipeline`** 是否需要，还是认为 Conveyor 已覆盖？
11. **品牌类型助手** 是否引入，以及是否替换现有 `ID`？
12. **兼容层保留多久**：v6 保留别名，v7 移除？
13. **`appendTypedFunc` 等低层 API 是否公开、是否改名**（返回函数但为 camelCase）？
14. **包名 / 版本**：继续 `vait@6.0.0`，还是借重大变更调整包结构（如 `@vait/core`）？

---

## 8. 一句话总结

v6 = **风格规范化（去分号 / 无类 / 纯度 / 命名）+ 实验模块转正（Context / Event / Val / 新 Memo）+ 新调度原语（Conveyor，建立在 concurrency 异步迭代器之上）**，并用兼容别名把破坏性控制在可迁移范围内。



