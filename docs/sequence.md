# 串行执行：Sequence 与 Concurrent

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
| `Sequence(q?)` | 可传入自己的 `Queue`；不传则内部创建一个并发度为 1 的队列 |
| 返回 | `(taskFunc: () => Promise<R>) => Promise<R>` |

**细节**

- 任务严格按加入顺序依次开始。
- 返回的 Promise 携带该任务的返回值 / 拒绝原因。
- **出错不阻塞后续任务**：某个任务抛错只会让它自己的 Promise 拒绝：

```ts
const sq = Sequence()

sq(async () => { throw new Error('boom') }).catch(() => {})
await sq(async () => console.log('still works')) // still works
```

- `Sequence` 可以传自定义队列，用来复用队列的信号 / payload 能力：

```ts
import { Queue, QueueSignal, Sequence } from 'vait'

const q = Queue(QueueSignal())
const sq = Sequence(q)

q.signal.ERROR.receive(({ error }) => console.error('任务失败', error))
sq(async () => { throw new Error('boom') })
```

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
run.setMaxConcurrent(5) // 运行中动态放大到 5
```

**细节**

- 返回的数组顺序对应任务加入顺序；完成顺序由并发决定，不保证。
- `Concurrent` 只是 `Queue` 的一层薄封装。需要暂停、丢弃任务、信号、payload 时，请直接使用 [任务队列](./queue.md)。
