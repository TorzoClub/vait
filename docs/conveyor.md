# 任务编排：Conveyor

```ts
import { Conveyor } from 'vait'
```

`Conveyor` 是一条「传送带」：你把任务 `send` 上去，它按阀门（并发上限）把任务交给唯一的 `receiver` 处理，并把每个任务的结果直接返回给你。

与遗留的 `Queue` 不同，`Conveyor` 不是一个可长期持有、自带 `pause` / payload 映射的队列，而是一个**带背压、超时、中断与结构化结果的任务编排器**：

- `send(payload)` 直接返回该任务的结果 Promise（`done` / `overflow` / `receiver_failure` / `retired` / 两种 timeout）；
- 每个任务都有独立状态、独立中断信号，可按 ID 查询或退役；
- 支持积压上限（背压）、等待超时与处理超时；
- 默认串行（阀门为 1），通过 `setValve` 放大并发。

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
  if (result.type === 'done') {
    console.log('结果:', result.return_value)
  } else if (result.type === 'overflow') {
    console.warn('积压已满，任务被丢弃')
  } else {
    console.warn('任务未成功:', result.type)
  }
}
```

---

## 默认值与配置

| 配置 | 默认值 | 设置方法 | 说明 |
| --- | --- | --- | --- |
| 阀门（并发上限） | `1` | `setValve(n)` | 同时处理的任务数；默认串行；`Infinity` 表示不限制 |
| 积压上限 | `Infinity` | `setBacklogsLimit(n)` | 排队任务数达到上限后，新的 `send` 直接返回 `overflow`；`Infinity` 表示无限积压 |
| 等待超时 | `-1`（不启用） | `setWaitingTimeout(ms)` | 任务在积压中等待超过 `ms` 后以 `timeout in waiting` 结束；`0` 表示 0ms |
| 处理超时 | `-1`（不启用） | `setProcessingTimeout(ms)` | receiver 执行超过 `ms` 后以 `timeout in processing` 结束，并触发 `timeout` 中断；`0` 表示 0ms |

- `setValve` 接受**非负整数或 `Infinity`**：负整数抛 `RangeError`；非整数（包括小数、`NaN`）抛 `TypeError`；`Infinity` 表示不限制并发。设为 `0` 会暂停派发新任务（已在执行的任务不受影响），之后再调大即可继续。
- 积压上限接受**非负整数或 `Infinity`**：负整数抛 `RangeError`；小数、`NaN` 抛 `TypeError`；`Infinity` 表示无限积压（只受内存限制）。积压上限只统计**排队中**的任务，不包含正在处理的任务；检查发生在任务入队之前（`当前积压数 >= limit` 即溢出），因此 `setBacklogsLimit(0)` 会让所有 `send` 都返回 `overflow`，即使当前有空闲工位。
- 两个超时 setter 接受**安全整数且 `>= -1`**：`-1` 表示不使用定时器，`0` 表示 0ms，正数表示毫秒；`Infinity`、小数、`NaN`、超出安全整数范围会抛 `TypeError`，小于 `-1` 的整数抛 `RangeError`。校验失败不会改变旧配置。
- 超时底层由 `PromiseTimer` 实现，时间语义详见 [定时器](./timer.md)。

---

## 工作流程

一次 `send` 的完整流程如下：

1. **入口与前置信号**：`send(payload)` 先经过销毁守卫，然后触发 `signals.sig_send_before`。
2. **背压检查**：当前积压数 `>=` 积压上限时，立即返回 `{ type: 'overflow' }`，不创建任务。
3. **创建任务**：分配 Symbol 作为 TaskID，记录 payload，创建结果通道（done signal），把任务放入积压，状态置为 `in blacklogs`。
4. **挂等待超时**：如果启用了等待超时，为这个任务挂一个定时器；超时后把它从积压移除并以 `timeout in waiting` 结算。
5. **调度**：调用内部 `startProcessing`。只要有空闲工位且有积压，就按阀值取出任务：
   - 状态置为 `in processing`；
   - 触发 `sig_receiver_will_process`；
   - 调用 `receiver(payload, { id, abort_signal })`；
   - 挂处理超时。
6. **结算**：receiver 成功、失败、处理超时、被退役或被销毁时，按对应路径结算结果，并在需要时继续调度后面的任务。

> 调度是「填满空闲工位」式的：每次任务结束、超时或阀门变大，都会重新尝试从积压中取任务。

---

## 生命周期

```
send(payload)
   │  sig_send_before
   │  积压满？ ──是──► { type: 'overflow' }
   ▼
[in blacklogs] ──等待超时──► [timeout in waiting] ──► send resolve
   │
   │  出队（有空闲工位）
   │  sig_receiver_will_process
   ▼
[in processing]
   ├── receiver resolve ──────► [done]                 ──► send resolve { done }
   ├── receiver reject ───────► [failure]              ──► send resolve { receiver_failure }
   ├── 处理超时 ──────────────► [timeout in processing] ──► send resolve { timeout in processing }
   ├── retireOne ─────────────► [retired in processing] ──► send resolve { retired }
   └── destroy ───────────────► [destroyed]            ──► send resolve { destroyed }

排队中：
  retireOne / retireOneIgnoreProcessing ──► [retired] ──► send resolve { retired }
  destroy ───────────────────────────────► send reject（ConveyorError）
```

### 任务状态

`getTaskStatus(id)` 返回以下状态之一：

| 状态 | 含义 | 何时进入 |
| --- | --- | --- |
| `in blacklogs` | 在积压中排队，尚未开始 | `send` 成功创建任务后 |
| `in processing` | receiver 正在执行 | 出队后、调用 receiver 前 |
| `done` | receiver 正常返回 | receiver resolve，且状态仍为 `in processing` |
| `failure` | receiver 抛错 / reject | receiver reject，且状态仍为 `in processing` |
| `timeout in waiting` | 排队阶段超时，已移出积压 | 等待超时触发且任务仍在积压 |
| `timeout in processing` | 执行阶段超时 | 处理超时触发 |
| `retired` | 排队阶段被主动退役 | `retireOne` / `retireOneIgnoreProcessing` 移出积压 |
| `retired in processing` | 执行中被退役，receiver 仍在运行 | 对执行中任务调用 `retireOne` |
| `destroyed` | 执行中遭遇 `destroy` | `destroy` 时仍在处理的任务 |

注意：

- `done` / `failure` 只在状态仍是 `in processing` 时写入；如果任务先被退役或销毁，最终状态会保留 `retired in processing` / `destroyed`。
- `retired in processing` 与 `destroyed` 是「最终结果已不再由 Conveyor 主动改写」的状态：receiver 后续结束也不会把它们改成 `done` / `failure`；同时 `send()` 已经在该状态写入时结算为 `retired` / `destroyed`，receiver 的最终返回/异常会被忽略。
- `destroy` 时仍在排队的任务会被拒绝，但当前实现**不会**把它们的 `getTaskStatus` 改成 `destroyed`，仍停留在 `in blacklogs`。
- `destroy` 之后仍可调用 `getTaskStatus` 查询执行中任务的 `destroyed` 状态；其他被 `WithDestroy` 包裹的方法仍会抛 `ConveyorError`。

### send 的结果

`send` 返回 `Promise<ConveyorSendResult<ReceiverReturn>>`，结果是一个可判别联合：

| `type` | 场景 | 附加字段 |
| --- | --- | --- |
| `done` | receiver 正常返回 | `return_value` |
| `overflow` | 积压已达上限，任务未入队 | 无 |
| `receiver_failure` | receiver 抛错 / reject | `error` |
| `retired` | 排队阶段或执行中被退役 | 无 |
| `destroyed` | 执行中遭遇 `destroy` | 无 |
| `timeout in waiting` | 排队超时 | `elapsed_time` |
| `timeout in processing` | 处理超时 | `elapsed_time` |

- **receiver 抛错不会让 `send()` reject**，而是以 `{ type: 'receiver_failure', error }` 返回；这样调用方可以统一用 `switch` 处理。receiver 现在是异步调用的，即使它同步抛错也会被转换成 `receiver_failure`。
- 正常使用下，`send()` 只在 Conveyor 已经销毁时 reject（拒绝值是 `ConveyorError`）。
- `overflow` 是同步判断后立即返回的结果，不会创建任务，也不会触发后续 receiver 信号。

---

## 超时机制

### 等待超时（`setWaitingTimeout`）

- 在任务进入积压时挂载，只对**排队阶段**生效。
- 触发时：把任务从积压移除，状态置为 `timeout in waiting`，`send` 以 `{ type: 'timeout in waiting', elapsed_time }` 结算。
- 如果任务在超时前已经开始处理，定时器即使之后触发也只会发现「任务已不在积压」，静默忽略，不会影响正在执行的任务。

### 处理超时（`setProcessingTimeout`）

- 在 receiver 开始执行时挂载。
- 触发时：触发 `abort_signal` 的 `'timeout'`，状态置为 `timeout in processing`，`send` 以 `{ type: 'timeout in processing', elapsed_time }` 结算，并腾出并发工位继续调度。
- 处理超时后，receiver 后续的 resolve / reject 都会被忽略，不会改写状态或再次结算。
- 当前实现保证**每个任务的处理超时只结算一次**：首次触发后会立即摘除该任务的超时 watcher，之后再调整 `setProcessingTimeout` 不会二次触发。

### 时间语义

- `elapsed_time` 是任务实际经过的时间（从挂载定时器算起），可能大于配置值。例如配置 500ms、执行 200ms 后把超时改成 100ms，会在约 200ms 处触发，`elapsed_time ≈ 200`。
- 动态修改超时是全局的，会影响该 Conveyor 上所有已挂载的定时器：按 `新时限 - 已流逝时间` 重新计算，剩余时间 `<= 0` 时立即触发。
- `-1` 表示**不使用定时器**：如果该任务已有定时器，会取消它，不再触发；之后改成正数或 `0` 仍可重新生效（从挂载时刻计算已流逝时间）。
- `0` 是合法计时值，表示 0ms 定时器（异步触发），不是「关闭」。
- `Infinity` 不是合法超时值，会抛 `TypeError`。

---

## 中断：abort_signal

receiver 的第二个参数提供 `{ id, abort_signal }`：

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

- `abort_signal` 是**通知**，不是强制取消。Conveyor 不会替你终止 receiver，也不会等待 receiver 响应；receiver 需要自己监听并尽快结束。
- 只对执行中的任务触发；排队阶段的任务被退役 / 超时时不会调用 receiver，因此也没有中断信号。
- 处理超时后，receiver 的最终结果会被忽略。销毁后，receiver 仍会继续运行，但它的最终结果不再用于结算 `send()`（此时 `send()` 已经返回 `destroyed`）。
- `abort_signal` **不会重放**。如果 `destroy()` / `retireOne()` 在 receiver 订阅之前发生（例如 `send()` 之后同步调用），receiver 可能收不到中断，但仍会启动并运行；`send()` 仍按 `destroyed` / `retired` 结算。需要确保 receiver 收到中断时，应避免在它订阅前同步触发销毁/退役。

---

## 退役与销毁

### retireOne(id)

按 TaskID 尝试退役一个任务：

| 任务位置 | 返回值 | 效果 |
| --- | --- | --- |
| 积压中 | `{ scene: 'retired' }` | 移出积压，状态 `retired`，`send` 以 `{ type: 'retired' }` 结算 |
| 执行中 | `{ scene: 'in processing' }` | 状态 `retired in processing`，触发 `'outside'` 中断，`send` 立即以 `{ type: 'retired' }` 结算 |
| 不存在 | `{ scene: 'not found' }` | 无效果 |

**执行中退役的注意点**：`retireOne` 会立即把 `send()` 结算成 `retired`，但 receiver 仍会继续运行；之后 receiver 的返回或异常会被忽略，不会触发 `sig_receiver_done` / `sig_receiver_failure`，只在 receiver 真正结束时触发 `sig_receiver_processed`。`retireOne` **不会取消处理超时定时器**：如果 receiver 超过处理超时，状态会被改写为 `timeout in processing`，但 `send()` 已经是 `retired`（详见「已知边界」）。

### retireOneIgnoreProcessing(id)

只退役积压中的任务；对执行中的任务返回 `{ scene: 'not found' }`，不会发中断、不会改状态。

### destroy()

销毁整个 Conveyor：

- 排队中的任务：`send()` 以 `ConveyorError` 拒绝，任务不会执行；这些任务的状态仍可能停留在 `in blacklogs`。
- 执行中的任务：收到 `'destroy'` 中断，处理超时定时器会被取消，状态置为 `destroyed`；`send()` 立即以 `{ type: 'destroyed' }` 结算，但 receiver 会继续运行到结束，其最终结果被忽略。
- 销毁后：`send` 返回 rejected Promise；`setValve` / `setBacklogsLimit` / 两个超时 setter / `getBlacklogs` / `retireOne*` 都会同步抛出 `ConveyorError`；`getTaskStatus` 仍可调用，用于查询 `destroyed` 状态；`signals` 仍可访问。
- 销毁不可逆。若还需要继续投递任务，请新建一个 Conveyor。

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
| `sig_receiver_will_process` | `TaskID` | 任务出队、调用 receiver 前 |
| `sig_receiver_done` | `TaskID` | receiver 正常 resolve，且任务没有被退役、销毁或处理超时 |
| `sig_receiver_failure` | `{ task_id, error }` | receiver 抛错 / reject，且任务没有被退役、销毁或处理超时 |
| `sig_receiver_processed` | `TaskID` | 任务结束后的 `finally` 中，且**不是处理超时**路径 |

不在上述时机的场景：

- 排队退役、等待超时、`destroy` 掉排队任务：只结算 `send()`（前两者 resolve，`destroy` 为 reject），不会触发 `sig_receiver_processed`。
- 处理超时：不会触发 `sig_receiver_processed`，也不会触发 `sig_receiver_failure`（即使 receiver 之后抛错）。
- 执行中退役 / 销毁：`send()` 已在退役/销毁时结算；receiver 后续的 resolve / reject 会被忽略，不会触发 `sig_receiver_done` / `sig_receiver_failure`，但 receiver 真正结束时仍会触发 `sig_receiver_processed`。

> `Signal` 的通用语义：同步触发、按注册顺序执行；`trigger` 会吞掉监听器异常并 `console.warn`，需要抛出时用 `triggerCareError`。详见 [信号](./signal.md)。

---

## 查询与静态工具

### getBlacklogs()

返回当前积压中的任务数组（不包含正在处理的任务）。元素带有内部字段，**只读使用**，不要修改数组或任务对象；返回的是内部数组引用，直接 `push` / `splice` 会破坏内部状态。

### getTaskStatus(id)

返回任务状态；未知 ID 抛 `ConveyorError`。任务结束后仍可查询，用于确认最终状态；`destroy` 之后也可以调用，用于查询执行中任务的 `destroyed` 状态。

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
- 请在 `await` 之前取 ID；拿到 ID 后可以配合 `retireOne` / `getTaskStatus` 使用。

---

## 已知边界

- `setValve(Infinity)` 合法，表示不限制并发；`setBacklogsLimit(Infinity)` 合法，表示无限积压。
- `setWaitingTimeout(Infinity)` / `setProcessingTimeout(Infinity)` 会抛 `TypeError`；超时只接受安全整数（`-1` 或 `>= 0`）。
- `setBacklogsLimit(0)` 会让所有 `send` 溢出，即使当前没有任务在执行。
- `getBlacklogs()` 返回内部数组引用，外部修改会破坏队列；需要快照请自行 `[...con.getBlacklogs()]`。
- `destroy` 后，排队任务的状态仍可能显示为 `in blacklogs`（当前实现不会改写为 `destroyed`）。
- 执行中 `retireOne` 会立即把 `send()` 结算为 `retired`，但不会取消处理超时定时器；如果 receiver 超过处理超时，`getTaskStatus` 会变成 `timeout in processing`，而 `send()` 仍是 `retired`。
- `abort_signal` 不会重放；在 receiver 订阅之前同步调用 `destroy` / `retireOne`，receiver 可能错过中断（但仍会启动）。
- 超时配置是 Conveyor 级别的，会同时影响该实例上所有已挂载的定时器。

---

## 与 Queue / QueuePool 的取舍

| 需求 | 推荐 |
| --- | --- |
| 需要长期持有、随时投递、`pause` / `resume`、payload 映射、`ALL_DONE` | `Queue`（遗留） |
| 需要按 key 分组、组内串行 | `QueuePool`（遗留），或每个 key 建一个 `Conveyor` |
| 需要背压、等待 / 处理超时、单任务中断、结构化结果 | `Conveyor` |
| 只是批量并发 map | `concurrentMap` |

`Conveyor` 没有 `pause` / `resume`，需要暂停派发时把阀门设为 `0`；它也没有 payload 映射表，因为 `send` 的 payload 会直接传给 receiver。

---

## 示例

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
  result.type === 'done' ? [result.return_value] : []
))
```

### 背压 + 等待超时

```ts
const con = Conveyor(async (job: Job) => {
  await runJob(job)
})

con.setValve(2)
con.setBacklogsLimit(10)
con.setWaitingTimeout(5_000)

for (const job of jobs) {
  con.send(job).then(result => {
    switch (result.type) {
      case 'done':
        break
      case 'overflow':
        console.warn('排队已满，丢弃任务')
        break
      case 'timeout in waiting':
        console.warn(`排队 ${result.elapsed_time}ms 后超时`)
        break
      case 'receiver_failure':
        console.error('任务失败', result.error)
        break
      default:
        console.warn('任务未完成:', result.type)
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
if (result.type === 'timeout in processing') {
  console.warn(`处理超过 ${result.elapsed_time}ms，已中断`)
}
```

### 查询状态与退役

```ts
const con = Conveyor(async (task: Task) => {
  await task.run()
})

con.setValve(1)

const first = con.send(taskA)
const second = con.send(taskB)

const secondId = Conveyor.getTaskIDByPromise(second)
if (secondId !== undefined) {
  console.log(con.getTaskStatus(secondId)) // in blacklogs
  console.log(con.retireOne(secondId))     // { scene: 'retired' }
}

console.log(await second) // { type: 'retired' }
await first
```
