# 批量执行：Executor（Stable）

```ts
import { Executor, timeout } from 'vait'
```

`Executor(options?)` 创建一个内部持有 `Conveyor` 的执行器。每次调用 `executor(taskFunc)` 都会把 async 函数作为任务提交给这个 Conveyor，并返回一个携带该函数返回值的 Promise。

```ts
const executor = Executor({ concurrency: 3 })

const results = await Promise.all([
  executor(async () => { await timeout(300); return 1 }),
  executor(async () => { await timeout(10);  return 2 }),
  executor(async () => 3),
])

console.log(results) // [1, 2, 3]
```

---

## 配置

```ts
Executor({
  concurrency: 1,
  backlogs_limit: Infinity,
  waiting_timeout: -1,
  processing_timeout: -1,
})
```

| option | 默认值 | 对应的 Conveyor 方法 |
| --- | --- | --- |
| `concurrency` | `1` | `setValve(n)` |
| `backlogs_limit` | `Infinity` | `setBacklogsLimit(n)` |
| `waiting_timeout` | `-1`（不启用） | `setWaitingTimeout(n)` |
| `processing_timeout` | `-1`（不启用） | `setProcessingTimeout(n)` |

- 默认并发为 **1**，即严格串行。
- 所有 option 都是可选的；不传时使用上表默认值。
- 非法值在创建时由对应的 Conveyor setter 抛错：`TypeError`（非整数 / 非安全整数）或 `RangeError`（负数）。
- `concurrency` 支持 `Infinity`，`backlogs_limit` 支持 `Infinity`；两个 timeout 不接受 `Infinity`。

---

## 实例 API

| 成员 | 说明 |
| --- | --- |
| `executor(taskFunc)` | 提交 `() => Promise<R>`，成功时 resolve `R`，失败时 reject |
| `executor.setConcurrency(n)` | 调整并发上限，等价于 `conveyor.setValve(n)` |
| `executor.destroy()` | 销毁内部 Conveyor；幂等 |
| `executor.conveyor` | 只读、已冻结的内部 `ConveyorInstance` |

`executor.conveyor` 可以直接使用 Conveyor 的全部能力，例如：

```ts
const executor = Executor()
executor.conveyor.setBacklogsLimit(10)
executor.conveyor.setProcessingTimeout(5_000)

console.log(executor.conveyor.getState()) // idle
```

Conveyor 实例与 `signals` 都经过 `Object.freeze`，类型为 `Readonly`；不要尝试替换实例方法或属性。内部状态仍通过方法调用变化。

---

## 错误语义

- **任务成功**：resolve task 的返回值。
- **任务 reject 或同步 throw**：以原始错误 reject，保持拒绝原因 identity；后续任务继续执行。
- **非成功结算**：当通过 `conveyor` 启用了背压、等待 / 处理超时、retire，或调用了 `destroy` 时，`send` 可能返回 `overflow`、`timeout/*`、`retired/*`、`destroyed`。这些场景会让 `executor(taskFunc)` reject 一个 `ConveyorError`，原始结算结果保存在标准的 `cause` 上：

```ts
const executor = Executor({ backlogs_limit: 0 })

try {
  await executor(async () => 1)
} catch (err) {
  if (err instanceof ConveyorError) {
    console.log(err.cause) // { scene: 'overflow' }
  }
}
```

- **destroy 后**：新的 `executor(taskFunc)` 调用会 reject `ConveyorError`，`setConcurrency()` 会同步抛 `ConveyorError`；`getState()` 仍可查询并返回 `destroyed`。

---

## 与 Sequence / Concurrent / Conveyor 的关系

- `Executor` 是 `Conveyor` 的批处理封装：每个 `Executor()` 实例对应一个 Conveyor，`executor.conveyor` 可直接访问该实例。
- `Sequence` / `Concurrent` / `concurrency` / `concurrentMap` 已归入 Legacy，文档见 [文档索引](./README.md)。
- 固定串行可直接使用 `Executor()`；固定或动态并发使用 `Executor({ concurrency: n })` 或 `executor.setConcurrency(n)`；需要更细的任务编排（背压、超时、中断、状态查询、retire）时，直接使用 [`Conveyor`](./conveyor.md) 或 `executor.conveyor`。

---

## 已知边界

- `Executor` 实例本身不冻结；只有内部 Conveyor 冻结。
- 非成功 scene 统一转成 `ConveyorError`，不单独区分 overflow / timeout 错误类型；需要区分时读取 `cause.scene`。
- `destroy()` 不会强制终止已经开始的 processor；它会按 Conveyor 的 destroy 语义结算排队与执行中任务，processor 仍可能在后台跑完。
