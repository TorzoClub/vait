# vait 使用文档

`vait` 是一组面向异步编程的实用工具函数，核心围绕三件事：

- **串行 / 并发调度**：让任务按顺序执行，或限制同时执行的任务数量。
- **Promise 与等待**：手动控制 Promise 的完成时机（`OutterPromise`、`Wait`）、延时与超时（`Timer`、`timeout`）。
- **响应式基础件**：可观察的值（`Memo`）、事件信号（`Signal`）、类型化上下文（`CreateContext`）。

> 本目录文档基于仓库当前源码（分支 `v5`）编写，而不是已发布到 npm 的旧版 `dist`。若要发布，请先执行 `npm run build` 重新生成 `dist/` 与 `types/`。

## 目录

| 文档 | 内容 |
| --- | --- |
| [安装与调用方式](./getting-started.md) | 安装、引入、构建、测试、命名约定 |
| [基础异步原语](./primitives.md) | `OutterPromise`、`Wait`、`nextTick`、`Timer`、`timeout`、`rejectTimeout` |
| [串行执行](./sequence.md) | `Sequence`、`Concurrent` |
| [任务队列](./queue.md) | `Queue`、`QueueSignal`、`WithPayload`、`runTask` |
| [按 ID 的任务池](./queue-pool.md) | `QueuePool` |
| [并发控制](./concurrency.md) | `concurrency`、`concurrency.Valve`、`concurrency.each`、`concurrentMap` |
| [信号](./signal.md) | `Signal`、`Signal.once`、`Signal.wait` |
| [可观察状态](./memo.md) | `Memo`、`WithValidating`、`ChangedSignal` |
| [上下文与事件](./context-event.md) | `CreateContext`、`Event`（未从入口导出） |
| [实验性模块](./experimental.md) | `Val`（data.ts）、`new_memo.ts` |
| [综合示例](./examples.md) | 限流抓取、任务队列、任务池、动态并发等 |
| [下一版本规划](./next.md) | v6 特性整理：风格规范、命名重构、Conveyor、待决问题 |

## 从包入口可以导入什么

`src/index.ts` 对外导出如下内容（即 `import { ... } from 'vait'` 可用的名字）：

| 导出 | 来源模块 | 说明 |
| --- | --- | --- |
| `Wait`、`WaitingRejected` | wait | 手动控制完成时机的等待对象 |
| `OutterPromise` | outter-promise | 暴露 `resolve/reject` 的 Promise 三元组 |
| `Timer` | timer | 可取消的 `setTimeout` |
| `timeout`、`rejectTimeout`、`TimeoutRejected` | timeout | 延时等待，可被外部取消 |
| `nextTick` | next-tick | 一个微任务 tick |
| `Sequence` | sequence | 串行执行器 |
| `Concurrent` | concurrent | 带并发上限的串行执行器 |
| `Queue`、`QueueSignal`、`WithPayload`、`runTask`、`QueueError` | queue | 任务队列 |
| `QueuePool` | queue-pool | 按 ID 分组、组内串行的任务池 |
| `concurrency`（含 `.Valve`、`.each`）、`concurrentMap` | concurrency / concurrent-map | 通用并发控制与并发 map |
| `Signal`（含 `Signal.once`、`Signal.wait`） | signal | 事件信号 |
| `Memo`、`MemoError`、`appendTypedFunc`、`WithValidating`、`ChangedSignal` | memo | 可观察值 |

> `context.ts`、`event.ts`、`data.ts`、`new_memo.ts` 目前**没有**从 `src/index.ts` 导出，需要以源码路径引入，详见对应文档。

## 一分钟速览

```ts
import { Sequence, Queue, concurrentMap, timeout } from 'vait'

// 1. 串行执行
const sq = Sequence()
await sq(async () => {
  await timeout(100)
  return 'step 1'
})
await sq(async () => 'step 2')

// 2. 队列：默认串行，可调并发、可监听
const q = Queue()
q.task(async () => { await timeout(100) })

// 3. 并发 map：最多 5 个同时进行，结果顺序不变
const list = await concurrentMap(5, [1, 2, 3], async (n) => {
  await timeout(10)
  return n * 2
})
console.log(list) // [2, 4, 6]
```
