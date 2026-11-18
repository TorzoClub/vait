# 串行执行：Sequence 与 Concurrent（Stable）

```ts
import { Sequence, Concurrent, timeout } from 'vait'
```

---

## Sequence

把多个异步任务按**调用顺序**串行执行（前一个完成后再执行下一个）。

```ts
const sq = Sequence()

const results = await Promise.all([
  sq(async () => { await timeout(300); return 1 }),
  sq(async () => { await timeout(10);  return 2 }),
  sq(async () => 3),
])

console.log(results) // [1, 2, 3]
```

**API**

| 项 | 说明 |
| --- | --- |
| `Sequence(q?)` | 可传入一个普通 `Queue`；不传则内部创建一个并发度为 1 的队列 |
| 返回 | `(taskFunc: () => Promise<R>) => Promise<R>` |

**细节**

- 任务严格按加入顺序依次开始。
- 返回的 Promise 携带该任务的返回值；任务返回的 Promise reject 时携带拒绝原因。
- **出错不阻塞后续任务**：某个任务返回的 Promise reject 只会让它自己的 Promise 拒绝：

```ts
const sq = Sequence()

sq(async () => { throw new Error('boom') }).catch(() => {})
await sq(async () => console.log('still works')) // still works
```

- `Sequence(q?)` 的 `q` 是普通 `Queue`，与 [src/sequence.ts](../src/sequence.ts) 的签名一致；不传时内部创建一个并发度为 1 的队列。
- 公开签名只接受普通 `Queue`：`QueueWithSignal` 需要自行处理类型兼容，`QueueWithPayload` 没有对应的 payload 参数；`Sequence` 本身不额外转发队列信号。需要 payload 映射或队列信号时，应直接使用 `Queue` / `WithPayload` 对应的 API。
- 任务错误通过 `Sequence` 返回的 Promise 暴露；后续任务不会因前一个任务失败而停止。

---

## Concurrent

`Sequence` 的并发版本：最多 `n` 个任务同时执行，其余排队。

```ts
const run = Concurrent(3) // 最多 3 个任务同时执行

const tasks = Array.from({ length: 10 }, (_, i) =>
  run(async () => {
    await timeout(100)
    return i
  })
)

const list = await Promise.all(tasks)
console.log(list) // [0, 1, ..., 9]
```

**API**

| 项 | 说明 |
| --- | --- |
| `Concurrent(n)` | 创建并发上限为 `n` 的执行器 |
| 返回 | 与 `Sequence` 相同的函数，额外挂载 `.setMaxConcurrent(n)` |

```ts
const run = Concurrent(1)
run.setMaxConcurrent(5) // 运行中提高并发上限到 5
```

**细节**

- 返回的数组顺序对应任务加入顺序；完成顺序由并发决定，不保证。
- `Concurrent` 基于 `Queue` 实现。`Queue` 已归入 Legacy；`Sequence` 和 `Concurrent` 的公开接口仍按 Stable 维护。需要队列信号、payload 映射或更细的队列控制时，应直接使用 [任务队列](./legacy/queue.md)。
