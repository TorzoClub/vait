# 任务编排：Conveyor（Stable）

```ts
import { Conveyor } from 'vait'
```

`Conveyor` 是任务编排器：`send(payload)` 提交任务，由构造时传入的 `processor` 在并发上限内处理，并把该任务的结算结果返回给调用方。

`Conveyor` 与 `Queue` 是独立实现。`Queue` 提供长期队列、payload 映射和队列信号，但已归入 Legacy；`Conveyor` 面向带背压、超时、中断与结构化结果的任务编排：

- `send(payload)` 返回该任务的结算 Promise（`done` / `overflow` / `processor_failure` / `retired/in_waiting` / `retired/in_processing` / 两种 timeout）；
- 每个任务都有独立状态和独立中断信号，可按 ID 查询或退役；
- 支持积压上限（背压）、等待超时与处理超时；
- 默认并发上限为 `1`（串行），通过 `setValve` 提高并发上限。

---

## 快速开始

```ts
import { Conveyor } from 'vait'

const con = Conveyor(async (n: number) => {
  await new Promise(resolve => setTimeout(resolve, 100))
  return n * 2
})

con.setValve(3) // 最多 3 个任务同时处理

const results = await Promise.all([1, 2, 3, 4].map(n => con.send(n)))

for (const result of results) {
  if (result.scene === 'done') {
    console.log('结果:', result.return_value)
  } else if (result.scene === 'overflow') {
    console.warn('积压已满，任务被丢弃')
  } else {
    console.warn('任务未成功:', result.scene)
  }
}
```

---

## 默认值与配置

| 配置 | 默认值 | 设置方法 | 说明 |
| --- | --- | --- | --- |
| 并发上限 | `1` | `setValve(n)` | 同时处理的任务数；默认串行；`Infinity` 表示不限制 |
| 积压上限 | `Infinity` | `setBacklogsLimit(n)` | 排队任务数达到上限后，新的 `send` 直接返回 `overflow`；`Infinity` 表示无限积压 |
| 等待超时 | `-1`（不启用） | `setWaitingTimeout(ms)` | 任务在积压中等待超过 `ms` 后以 `timeout/in_waiting` 结束；`0` 表示 0ms |
| 处理超时 | `-1`（不启用） | `setProcessingTimeout(ms)` | processor 执行超过 `ms` 后以 `timeout/in_processing` 结束，并触发 `timeout` 中断；`0` 表示 0ms |

- `setValve` 接受**非负整数或 `Infinity`**：负整数抛 `RangeError`；非整数（包括小数、`NaN`）抛 `TypeError`；`Infinity` 表示不限制并发。设为 `0` 会暂停派发新任务（已在执行的任务不受影响），之后再提高即可继续派发。
- 积压上限接受**非负整数或 `Infinity`**：负整数抛 `RangeError`；小数、`NaN` 抛 `TypeError`；`Infinity` 表示无限积压（只受内存限制）。积压上限只统计**排队中**的任务，不包含正在处理的任务；检查发生在任务入队之前（`当前积压数 >= limit` 即溢出），因此 `setBacklogsLimit(0)` 会让所有 `send` 都返回 `overflow`，即使当前并发上限仍有余量。
- 两个超时 setter 接受**安全整数且 `>= -1`**：`-1` 表示不使用定时器，`0` 表示 0ms，正数表示毫秒；`Infinity`、小数、`NaN`、超出安全整数范围会抛 `TypeError`，小于 `-1` 的整数抛 `RangeError`。校验失败不会改变旧配置。
- 超时底层由 `Timer` 实现，时间语义详见 [定时器](./timer.md)。

---

## 工作流程

一次 `send` 的完整流程如下：

1. **入口与前置信号**：`send(payload)` 先经过销毁守卫，然后触发 `signals.sig_send_before`。
2. **背压检查**：当前积压数 `>=` 积压上限时，立即返回 `{ scene: 'overflow' }`，不创建任务。
3. **创建任务**：分配 Symbol 作为 TaskID，记录 payload，创建结果通道（done signal），把任务放入积压，状态置为 `waiting`。
4. **挂等待超时**：如果启用了等待超时，为这个任务挂一个定时器；超时后把它从积压移除并以 `timeout/in_waiting` 结算。
5. **调度**：调用内部 `startProcessing`。只要正在处理的任务数小于并发上限且有积压，就按并发上限取出任务：
   - 状态置为 `processing`；
   - 触发 `sig_processor_will_process`；
   - 调用 `processor(payload, { id, abort_signal })`；
   - 挂处理超时。
6. **结算**：processor 成功、失败、处理超时、被退役或被销毁时，按对应路径结算结果，并在需要时继续调度后面的任务。

> 调度会在任务结束、`retire`、超时或并发上限提高时重新从积压中取任务，使正在处理的任务数不超过并发上限。

---

## 生命周期

```
send(payload)
   │  sig_send_before
   │  积压满？ ──是──► { scene: 'overflow' }
   ▼
[waiting] ──等待超时──► [timeout/in_waiting] ──► send resolve
   │
   │  出队（并发上限仍有余额）
   │  sig_processor_will_process
   ▼
[processing]
   ├── processor resolve ──────► [done]                 ──► send resolve { done }
   ├── processor reject ───────► [failure]              ──► send resolve { processor_failure }
   ├── 处理超时 ──────────────► [timeout/in_processing] ──► send resolve { timeout/in_processing }
   ├── retireOne ─────────────► [retired/in_processing] ──► send resolve { retired/in_processing }
   └── destroy ───────────────► [destroyed]            ──► send resolve { destroyed }

排队中：
  retireOne / retireOneIgnoreProcessing ──► [retired/in_waiting] ──► send resolve { retired/in_waiting }
  destroy ───────────────────────────────► send reject（ConveyorError）
```

### 任务状态

`getTaskStatus(id)` 返回以下状态之一：

| 状态 | 含义 | 何时进入 |
| --- | --- | --- |
| `waiting` | 在积压中排队，尚未开始 | `send` 成功创建任务后 |
| `processing` | processor 正在执行 | 出队后、调用 processor 前 |
| `done` | processor 正常返回 | processor resolve，且状态仍为 `processing` |
| `failure` | processor 抛错 / reject | processor reject，且状态仍为 `processing` |
| `timeout/in_waiting` | 排队阶段超时，已移出积压 | 等待超时触发且任务仍在积压 |
| `timeout/in_processing` | 执行阶段超时 | 处理超时触发 |
| `retired/in_waiting` | 排队阶段被主动退役 | `retireOne` / `retireOneIgnoreProcessing` 移出积压 |
| `retired/in_processing` | 执行中被退役，processor 仍在运行 | 对执行中任务调用 `retireOne` |
| `destroyed` | 排队中或执行中遭遇 `destroy` | `destroy` 时仍在排队或处理的任务 |

注意：

- 终态集合：`failure`、`done`、`retired/in_processing`、`retired/in_waiting`、`timeout/in_waiting`、`timeout/in_processing`、`destroyed`。一旦进入终态，**状态不会再被任何路径改写**。
- `retired/in_processing` 与 `destroyed` 是终态，但 processor 可能仍在运行；processor 后续的返回/异常会被忽略，不会再改状态或触发 `sig_processor_done` / `sig_processor_failure`。
- `destroy` 时仍在排队的任务会被拒绝，状态置为 `destroyed`，并清空 backlog。
- `destroy` 之后仍可调用 `getTaskStatus` 查询终态；其他被 `WithDestroy` 包裹的方法仍会抛 `ConveyorError`。

### send 的结果

`send` 返回 `Promise<ConveyorSendResult<ProcessorReturn>>`，结果是一个可判别联合：

| `scene` | 场景 | 附加字段 |
| --- | --- | --- |
| `done` | processor 正常返回 | `return_value` |
| `overflow` | 积压已达上限，任务未入队 | 无 |
| `processor_failure` | processor 抛错 / reject | `error` |
| `retired/in_waiting` | 排队阶段被退役 | 无 |
| `retired/in_processing` | 执行中被退役 | 无 |
| `destroyed` | 执行中遭遇 `destroy` | 无 |
| `timeout/in_waiting` | 排队超时 | `elapsed_time` |
| `timeout/in_processing` | 处理超时 | `elapsed_time` |

- **processor 抛错不会让 `send()` reject**，而是以 `{ scene: 'processor_failure', error }` 返回；这样调用方可以统一用 `switch` 处理。processor 是同步调用的，即使它同步抛错也会被转换成 `processor_failure`。
- 正常使用下，`send()` 只在 Conveyor 已经销毁时 reject（拒绝值是 `ConveyorError`）。
- `overflow` 是同步判断后立即返回的结果，不会创建任务，也不会触发后续 processor 信号。

---

## 超时机制

### 等待超时（`setWaitingTimeout`）

- 任务在积压中等待超过配置时长后，移除 backlog，状态置为 `timeout/in_waiting`，`send` 以 `{ scene: 'timeout/in_waiting', elapsed_time }` 结算。
- 超时为 `-1` 时**不创建 Timer**；之后改成正数或 `0`，会为已存在的排队任务补建 Timer，并从启用时刻开始计时。
- 任务开始处理时，waiting Timer 会被取消并删除。

### 处理超时（`setProcessingTimeout`）

- 任务开始处理时，如果处理超时 `>= 0`，创建 Timer；触发时触发 `abort_signal` 的 `'timeout'`，状态置为 `timeout/in_processing`，`send` 以 `{ scene: 'timeout/in_processing', elapsed_time }` 结算，并让该任务不再计入并发上限，以便继续调度。
- 超时为 `-1` 时**不创建 Timer**；之后改成正数或 `0`，会为正在处理的任务补建 Timer，并从启用时刻开始计时。
- 处理超时后，processor 后续的 resolve / reject 都会被忽略，不会改写状态或再次结算。
- Timer 只触发一次；触发后会进入 `fired` 状态，不能再次 `set`。

### 时间语义

- `elapsed_time` 来自对应 Timer 的 `elapsedTime()`：一般是任务入队（等待超时）或开始处理（处理超时）到触发的时间；对于 `-1` 之后补建 Timer 的任务，则从补建时刻开始计算。
- 正数改正数时，已存在的 Timer 调用 `set(n)`，**保留原起点**，按 `新时限 - 已流逝时间` 计算剩余；剩余 `<= 0` 时立即触发。
- `-1` 表示取消并移除当前 Timer；之后再改成正数或 `0` 会重新创建 Timer，从启用时刻开始计时。
- `0` 是合法计时值，表示 0ms 定时器（异步触发）。
- `Infinity` 不是合法超时值，会抛 `TypeError`。
- 所有 Timer 在任务进入终态、retire 或 destroy 时都会被取消。

## 中断：abort_signal

processor 的第二个参数提供 `{ id, abort_signal }`：

```ts
const con = Conveyor(async (url: string, { id, abort_signal }) => {
  const controller = new AbortController()

  abort_signal.receive(reason => {
    // reason: 'timeout' | 'outside' | 'destroy'
    controller.abort(reason)
  })

  const response = await fetch(url, { signal: controller.signal })
  return response.text()
})
```

| 中断来源 | 触发时机 |
| --- | --- |
| `'timeout'` | 处理超时 |
| `'outside'` | 对执行中的任务调用 `retireOne` |
| `'destroy'` | Conveyor 被销毁时，该任务正在处理 |

要点：

- `abort_signal` 是**通知**，不是强制取消。Conveyor 不会代替 processor 终止任务，也不会等待 processor 响应；processor 需要自行监听并尽快结束。
- 只对执行中的任务触发；排队阶段的任务被退役 / 超时时不会调用 processor，因此也没有中断信号。
- 处理超时后，processor 的最终结果会被忽略。销毁后，processor 仍会继续运行，但它的最终结果不再用于结算 `send()`（此时 `send()` 已经返回 `destroyed`）。
- processor 是同步调用的：如果它在调用过程中同步订阅了 `abort_signal`，`send()` 返回后再调用 `destroy` / `retireOne` 能正常收到中断。
- `abort_signal` **不会重放**。如果 processor 在 `await` 之后才订阅，或在 `sig_processor_will_process` 监听器里提前销毁/退役，processor 仍可能错过中断；此时它仍会启动并运行。

---

## 退役与销毁

### retireOne(id)

按 TaskID 尝试退役一个任务：

| 任务位置 | 返回值 | 效果 |
| --- | --- | --- |
| 积压中 | `{ scene: 'retired' }` | 移出积压，状态 `retired/in_waiting`，`send` 以 `{ scene: 'retired/in_waiting' }` 结算 |
| 执行中 | `{ scene: 'in_processing' }` | 状态 `retired/in_processing`，触发 `'outside'` 中断，`send` 立即以 `{ scene: 'retired/in_processing' }` 结算，并立即使该任务不再计入并发上限 |
| 不存在 | `{ scene: 'not_found' }` | 无效果 |

**执行中退役的注意点**：

- `retireOne` 会取消该任务的 waiting 与 processing Timer，立即把 `send()` 结算成 `retired/in_processing`，状态写为 `retired/in_processing`（终态）。
- 该任务会立即从正在处理集合中移除；processor 仍可在后台继续运行，但不再计入并发上限，调度器会继续派发下一个任务。
- 被退役但尚未结束的 processor 不再计入并发上限，因此实际同时运行的 processor 数量可能短暂超过 `valve`。
- processor 之后的返回或异常会被忽略，不会触发 `sig_processor_done` / `sig_processor_failure`，只在 processor 真正结束时触发 `sig_processor_processed`。
- Timer 已取消，处理超时不会再触发或覆盖状态；即使 processor 永不结束，也不会阻止后续任务派发。

### retireOneIgnoreProcessing(id)

只退役积压中的任务；对执行中的任务返回 `{ scene: 'not_found' }`，不会发中断、不会改状态。

### destroy()

销毁整个 Conveyor：

- 排队中的任务：取消 waiting Timer，状态置为 `destroyed`，从 backlog 移除；`send()` 以 `ConveyorError` 拒绝。
- 执行中的任务：取消 processing / waiting Timer，收到 `'destroy'` 中断，状态置为 `destroyed`；`send()` 立即以 `{ scene: 'destroyed' }` 结算，但 processor 会继续运行到结束，其最终结果被忽略。
- 销毁后：`send` 返回 rejected Promise；`setValve` / `setBacklogsLimit` / 两个超时 setter / `getBacklogs` / `retireOne*` 都会同步抛出 `ConveyorError`；`getTaskStatus` 仍可调用，用于查询 `destroyed` 状态；`signals` 仍可访问。
- 销毁不可逆。需要继续投递任务时，应新建一个 Conveyor。

```ts
con.destroy()
await con.send(1).catch(err => {
  console.log(err instanceof ConveyorError) // true
})
```

---

## 信号

`signals` 上是五个 `Signal`，`receive` 返回取消函数：

| 信号 | payload | 触发时机 |
| --- | --- | --- |
| `sig_send_before` | `payload` | 每次 `send` 进入内部流程后、积压检查前；溢出时也会触发 |
| `sig_processor_will_process` | `TaskID` | 任务出队、调用 processor 前 |
| `sig_processor_done` | `TaskID` | processor 正常 resolve，且任务没有被退役、销毁或处理超时 |
| `sig_processor_failure` | `{ task_id, error }` | processor 抛错 / reject，且任务没有被退役、销毁或处理超时 |
| `sig_processor_processed` | `TaskID` | 任务结束后的 `finally` 中，且**不是处理超时**路径 |

不在上述时机的场景：

- 排队退役、等待超时、`destroy` 掉排队任务：只结算 `send()`（前两者 resolve，`destroy` 为 reject），不会触发 `sig_processor_processed`。
- 处理超时：不会触发 `sig_processor_processed`，也不会触发 `sig_processor_failure`（即使 processor 之后抛错）。
- 执行中退役 / 销毁：`send()` 已在退役/销毁时结算；processor 后续的 resolve / reject 会被忽略，不会触发 `sig_processor_done` / `sig_processor_failure`，但 processor 真正结束时仍会触发 `sig_processor_processed`。

> `Signal` 的通用语义：同步触发、按注册顺序执行；`trigger` 会忽略监听器异常并 `console.warn`，需要抛出时使用 `triggerCareError`。详见 [信号](./signal.md)。

---

## 查询与静态工具

### getState()

返回当前 `ConveyorState`。`getState()` 不会被 `WithDestroy` 包装，destroy 之后仍可调用并返回 `destroyed`。

| 状态 | 条件 |
| --- | --- |
| `destroyed` | 已调用 `destroy()` |
| `working/in_paused` | Valve 为 `0`，且仍有 processing 任务 |
| `paused` | Valve 为 `0`，且没有 processing 任务 |
| `working/swamped` | Valve > 0，有 processing 任务，且 backlog 已达上限 |
| `working/controlled` | Valve > 0，有 processing 任务，且 backlog 未满 |
| `idle` | Valve > 0，且没有 processing 任务 |

状态判断优先级依次为：`destroyed` → `working/in_paused` → `paused` → `working/swamped` → `working/controlled` → `idle`。

```ts
const state = con.getState()

if (state === 'destroyed') {
  // 已销毁
}
```

### getProcessing()

返回当前占用 `processing` 状态的任务快照：

```ts
const processing = con.getProcessing()
```

- 不包含排队任务。
- 不包含 `retired/in_processing`：`retireOne` 会立即将该任务从正在处理集合中移除，processor 可能仍在后台运行。
- 处理超时后立即移除（processor 之后结束不会重新加入）。
- 返回的是数组快照，不是内部 Set。
- 与 `getBacklogs()` 一样被 `WithDestroy` 包装；destroy 后调用会抛 `ConveyorError`。

### getBacklogs()

返回当前积压中的任务数组（不包含正在处理的任务）。元素带有内部字段，**只读使用**，不要修改数组或任务对象；返回的是内部数组引用，直接 `push` / `splice` 会破坏内部状态。

### getTaskStatus(id)

返回任务状态；未知 ID 抛 `ConveyorError`。任务进入终态后仍可查询，用于确认最终状态；`destroy` 之后也可以调用。

### Conveyor.getTaskIDByPromise(promise)

把 `send()` 返回的 Promise 映射回 TaskID：

```ts
const promise = con.send(payload)
const id = Conveyor.getTaskIDByPromise(promise)

if (id !== undefined) {
  console.log(con.getTaskStatus(id))
  con.retireOne(id)
}

const result = await promise
```

- 只有在任务被创建时才会记录映射；`overflow`、销毁后 `send` 的拒绝 Promise 都返回 `undefined`。
- 映射在任务创建时记录；如果需要在任务完成前退役或查询状态，应在 `await` 之前取 ID。任务完成后该映射仍可查询。

---

## 类型与导出

从包入口可导入以下与 Conveyor 相关的导出：

`Conveyor`、`ConveyorInstance`、`ConveyorSendResult`、`ConveyorState`、`ConveyorError`、`AbortCause`、`TaskStatus`、`RetireResult`。

`ConveyorInstance` 是 `Readonly` 类型，对应的运行时实例也已 `Object.freeze`；不要尝试替换实例方法或属性。

`TaskID` 与 `Task` 是内部类型，没有从包入口导出；信号回调中的 `TaskID` 以 Symbol 形式传递，通常不需要显式标注类型。

---

## 已知边界

- `setValve(Infinity)` 合法，表示不限制并发；`setBacklogsLimit(Infinity)` 合法，表示无限积压。
- `setWaitingTimeout(Infinity)` / `setProcessingTimeout(Infinity)` 会抛 `TypeError`；超时只接受安全整数（`-1` 或 `>= 0`）。
- `setBacklogsLimit(0)` 会让所有 `send` 溢出，即使当前没有任务在执行。
- `getBacklogs()` 返回内部数组引用，外部修改会破坏队列；需要快照时应使用 `[...con.getBacklogs()]`。
- `destroy` 后，排队任务状态为 `destroyed`；`getTaskStatus` 仍可查询。
- 执行中 `retireOne` / `destroy` 会取消 Timer，但不会强制停止 processor；两者都会立即将该任务从正在处理集合中移除（`retireOne` 之后调度器继续派发下一个任务，`destroy` 则清空处理中的任务集合），不会等 processor 的 `.finally`。processor 永不结束也不会继续计入并发上限。
- `Conveyor()` 返回的实例与 `signals` 对象都已 `Object.freeze`，类型为 `Readonly`；运行时给实例属性赋值会抛出 `TypeError`。内部状态仍通过 `setValve` / `send` / `destroy` 等方法变化。
- `abort_signal` 不会重放；processor 延迟订阅时仍可能错过中断。
- `setWaitingTimeout(-1)` / `setProcessingTimeout(-1)` 会取消并移除当前 Timer；之后再改成正数或 `0` 会为已存在任务重新创建 Timer，从启用时刻开始计时。
- 超时配置是 Conveyor 级别的，会同时影响该实例上所有已存在的 Timer（正数改正数保留各自起点）。

---

## 与 Legacy 模块的关系

`Queue` / `QueuePool` / `Sequence` / `Concurrent` / `concurrency` / `concurrentMap` 已归入 Legacy；完整选择见 [文档索引](./README.md) 的 API 选择表。

- `Executor` 是 Conveyor 的批处理封装：`Executor()` 内部就是一个并发上限为 1 的 Conveyor，可通过 `setConcurrency`、`destroy` 和只读 `conveyor` 操作；详见 [`Executor`](./executor.md)。
- `Queue` 提供长期队列、payload 映射和队列信号；没有 `pause()` / `resume()` 方法，暂停派发通过 `setMaxConcurrent(0)`。
- `QueuePool` 提供按 ID 分组、组内串行和 `pause()` / `resume()`。
- `Sequence` / `Concurrent` / `concurrency` / `concurrentMap` 的文档位于 `docs/legacy/`。
- 需要按 key 分组串行时，也可以为每个 key 建一个 `Conveyor`。
- `Conveyor` 自身没有 `pause` / `resume`，需要暂停派发时把并发上限设为 `0`；它没有 payload 映射表，`send` 的 payload 会直接传给 processor。

---

## 示例

> 示例只展示 API 用法，省略业务函数、错误处理和完整上下文，不保证可直接运行。

### 限流处理

```ts
import { Conveyor } from 'vait'

const con = Conveyor(async (id: number) => {
  const response = await fetch(`https://example.com/item/${id}`)
  return response.json()
})

con.setValve(4) // 最多 4 个并发请求

const results = await Promise.all(
  [1, 2, 3, 4, 5, 6].map(id => con.send(id))
)

const data = results.flatMap(result => (
  result.scene === 'done' ? [result.return_value] : []
))
```

### 背压 + 等待超时

```ts
// Job、runJob、jobs 为业务对象占位
const con = Conveyor(async (job: Job) => {
  await runJob(job)
})

con.setValve(2)
con.setBacklogsLimit(10)
con.setWaitingTimeout(5_000)

for (const job of jobs) {
  con.send(job).then(result => {
    switch (result.scene) {
      case 'done':
        break
      case 'overflow':
        console.warn('排队已满，丢弃任务')
        break
      case 'timeout/in_waiting':
        console.warn(`排队 ${result.elapsed_time}ms 后超时`)
        break
      case 'processor_failure':
        console.error('任务失败', result.error)
        break
      default:
        console.warn('任务未完成:', result.scene)
    }
  })
}
```

### 处理超时 + 中断

```ts
const con = Conveyor(async (url: string, { abort_signal }) => {
  const controller = new AbortController()
  abort_signal.receive(() => controller.abort())

  const response = await fetch(url, { signal: controller.signal })
  return response.text()
})

con.setValve(3)
con.setProcessingTimeout(3_000)

const result = await con.send('https://example.com/slow')
if (result.scene === 'timeout/in_processing') {
  console.warn(`处理超过 ${result.elapsed_time}ms，已中断`)
}
```

### 查询状态与退役

```ts
// Task、taskA、taskB 为业务对象占位
const con = Conveyor(async (task: Task) => {
  await task.run()
})

con.setValve(1)

const first = con.send(taskA)
const second = con.send(taskB)

const secondId = Conveyor.getTaskIDByPromise(second)
if (secondId !== undefined) {
  console.log(con.getTaskStatus(secondId)) // waiting
  console.log(con.retireOne(secondId))     // { scene: 'retired' }
}

console.log(await second) // { scene: 'retired/in_waiting' }
await first
```
