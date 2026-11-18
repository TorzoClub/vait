# 按 ID 分组：QueuePool（Legacy）

> **Legacy 模块**：`QueuePool` 的源码位于 `src/legacy/queue-pool.ts`，仍从包入口导出，但不再主动演进。
> 新代码优先使用 [`Conveyor`](../conveyor.md)。`Conveyor` 提供并发上限、积压上限、等待 / 处理超时与 `retire`；需要按 key 分组串行时，可以每个 key 建一个 `Conveyor` 实例。

`QueuePool` 为每个 ID 维护一条独立队列：**同一 ID 的任务串行，不同 ID 的任务并行**。适合“按用户 / 资源串行，全局并行”的场景。

```ts
import { QueuePool, Signal } from 'vait'

const pool = QueuePool<string>()

pool.addTask('user:A', async () => { /* A 的任务 1 */ })
pool.addTask('user:A', async () => { /* A 的任务 2，排队 */ })
pool.addTask('user:B', async () => { /* B 的任务，与 A 并行 */ })

await Signal.wait(pool.signal.ALL_DONE)
```

---

## 创建

```ts
QueuePool()              // 未提供 ID 类型；实际使用应显式传入泛型
QueuePool<ID>()          // 只有 ID，无 payload
QueuePool<ID, Payload>() // ID + payload
```

---

## API

| 成员 | 说明 |
| --- | --- |
| `addTask(id, fn)` | 加入 `id` 队列（无 payload） |
| `addTask(id, payload, fn)` | 加入 `id` 队列并记录 payload |
| `getQueue(id)` | 获取（不存在则创建）该 ID 的队列，类型为 `QueueWithPayload` |
| `hasQueue(id)` | 该 ID 当前是否还有队列 |
| `pause()` / `resume()` | 暂停 / 恢复整个池 |
| `signal.ALL_DONE` | 池中所有队列清空时触发一次 |
| `signal.ERROR` | 任一任务失败时触发，携带 `{ id, payload, error }` |

---

## 生命周期

- 一个 ID 的队列排空后会自动从池中移除（`hasQueue(id)` 变为 `false`），下次 `addTask` 会重新创建。
- 当池中最后一个队列被移除时触发 `signal.ALL_DONE`。
- 因此 `ALL_DONE` 表示“当前已知任务全部完成”，之后仍可继续 `addTask`。

```ts
const pool = QueuePool<number>()
pool.addTask(1, async () => {})

await Signal.wait(pool.signal.ALL_DONE)
console.log(pool.hasQueue(1)) // false
```

---

## 错误处理

```ts
const pool = QueuePool<number, string>()

pool.signal.ERROR.receive(({ id, payload, error }) => {
  console.error('[' + id + '] payload=' + payload + ' 失败:', error)
})

pool.addTask(1, 'job-A', async () => { throw new Error('boom') })

await Signal.wait(pool.signal.ALL_DONE)
```

---

## 暂停与恢复

```ts
import { timeout } from 'vait'

pool.addTask(1, () => timeout(50))
pool.pause()

// 暂停期间：不开始新任务（含暂停后新建的队列）
pool.addTask(2, () => timeout(50))

pool.resume()
```

**细节**

- `pause()` 会在所有已存在队列的队首插入一个暂停标记任务；该任务返回一个在 `resume()` 时完成的 Promise，从而阻塞后续任务。
- **暂停状态下新建的队列也会立即进入暂停**（同样插入暂停标记任务）。
- `resume()` 可安全地重复调用：没有处于暂停状态时是空操作。
- 同一暂停周期应只调用一次 `pause()`；连续调用会叠加多个暂停标记任务，而 `resume()` 只解除最后一次。

---

## 细节

1. `addTask` 返回 `void`；错误通过池的 `signal.ERROR` 上报。需要等待单条任务时，使用三参 `runTask(queue, payload, fn)`；无 payload 的池传 `undefined`。不要使用 `runTask(pool.getQueue(id), fn)`。
2. 每个 ID 的队列默认并发度为 1；可用 `pool.getQueue(id).setMaxConcurrent(n)` 单独调整。
3. payload 类型由泛型第二参数决定，可在 `signal.ERROR` 中直接取到。
4. 池本身没有并发上限：不同 ID 的任务可以同时执行，数量取决于活跃 ID 数量。
