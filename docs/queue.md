# 任务队列：Queue

`Queue` 是一个带并发上限的任务队列：任务入队后按顺序执行，可动态调整并发、监听生命周期、给任务附加 payload。

```ts
import { Queue, QueueSignal, WithPayload, runTask, timeout } from 'vait'
```

---

## 快速上手

```ts
const q = Queue()

// 直接投递任务，返回 void
q.task(async () => { await timeout(100); console.log('a') })
q.task(async () => { await timeout(100); console.log('b') })

// 需要结果时用 runTask
const value = await runTask(q, async () => {
  await timeout(100)
  return 'done'
})
console.log(value) // done
```

---

## Queue(signal?)

- 不传参数返回 `Queue`（其 `signal` 为 `undefined`）。
- 传入 `QueueSignal()` 返回带信号的 `QueueWithSignal`。
- 默认并发度为 **1**（串行）。
- 投递任务后**不会同步执行**，而是等到一个微任务（`nextTick`）之后开始。
- 单个任务失败不会让队列停止；错误通过 `signal.ERROR` 或 `runTask` 的 Promise 暴露。

### 成员一览

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `task(fn)` | `(fn: () => Promise<void>) => void` | 往队尾加入任务，**返回 `void`** |
| `dropTask(fn)` | `(fn) => void` | 从待执行队列中移除某个任务 |
| `getTasks()` | `() => QueueTask[]` | 当前待执行任务列表（不含正在执行的任务） |
| `setTasks(tasks)` | `(tasks) => void` | 直接替换待执行任务列表 |
| `getStatus()` | `() => 'running' \| 'pause'` | 队列是否正在处理 |
| `setMaxConcurrent(n)` | `(n) => void` | 调整并发度（非负整数或 `Infinity`） |
| `signal` | `QueueSignal \| undefined` | 见下文 |

> `runTask` 是一个独立导出函数，不是队列的方法。

---

## runTask

给队列加任务并等待其完成，是 `task` 的“可 await”版本。

```ts
const q = Queue()

const result = await runTask(q, async () => 233)
console.log(result) // 233

// 任务抛错会向调用方 reject
await runTask(q, async () => { throw new Error('boom') }).catch(e => {
  console.log(e.message) // boom
})
```

带 payload 的队列有对应重载：

```ts
const q = WithPayload<number>(Queue())

const task = async () => 'ok'
await runTask(q, 9, task)

console.log(q.getPayload(task)) // 9
```

---

## 状态与生命周期

- 初始状态为 `'pause'`；有任务入队后变为 `'running'`。
- 队列耗尽后回到 `'pause'`，并触发一次 `ALL_DONE`。
- 正在执行的任务不在 `getTasks()` 中（被取出时即从列表移除）。

```ts
const q = Queue()
q.task(() => timeout(100))

console.log(q.getStatus()) // running
await timeout(150)
console.log(q.getStatus()) // pause
```

---

## 信号：QueueSignal

```ts
const q = Queue(QueueSignal())

q.signal.WILL_PROCESS.receive(() => { /* 每次取任务前 */ })
q.signal.SUCCESS.receive(task => { /* 某任务成功 */ })
q.signal.ERROR.receive(({ task, error }) => { /* 某任务失败 */ })
q.signal.PROCESSED.receive(task => { /* 每个任务结束（无论成败） */ })
q.signal.ALL_DONE.receive(() => { /* 队列清空 */ })
```

| 信号 | payload | 触发时机 |
| --- | --- | --- |
| `WILL_PROCESS` | `void` | 每次从队头取任务之前 |
| `SUCCESS` | 任务函数 | 某任务成功完成 |
| `ERROR` | `{ task, error }` | 某任务抛出 / 拒绝 |
| `PROCESSED` | 任务函数 | 每个任务结束（成功或失败） |
| `ALL_DONE` | `void` | 队列清空、状态回到 `'pause'` 之后 |

### 等待队列排空

```ts
import { Queue, QueueSignal, Signal } from 'vait'

const q = Queue(QueueSignal())
q.task(async () => { /* ... */ })

await Signal.wait(q.signal.ALL_DONE)
```

也可以自己用 `Wait`：

```ts
const [waiting, done] = Wait()
q.signal.ALL_DONE.receive(done)
// ... 投递任务
await waiting
```

### 在取任务前动态过滤队列

`WILL_PROCESS` 在取出任务之前触发，此时修改 `setTasks` 即可过滤 / 追加任务：

```ts
import { Queue, QueueSignal, WithPayload, Signal } from 'vait'

const q = WithPayload<number>(Queue(QueueSignal()))

q.signal.WILL_PROCESS.receive(() => {
  q.setTasks(q.getTasks().filter(t => q.getPayload(t) % 2 === 0))
})

for (let i = 0; i < 20; i++) {
  q.task(i, async () => { /* ... */ })
}
await Signal.wait(q.signal.ALL_DONE)
// 只有偶数 payload 的任务被执行
```

---

## WithPayload：给任务附加数据

`WithPayload<P>(q)` 在队列上增加「任务函数 → 附加数据」的映射。

```ts
const q = WithPayload<number>(Queue())

q.task(1, async () => { /* ... */ })
q.task(2, async () => { /* ... */ })

// 在信号回调里反查某任务的 payload
q.signal // 普通 Queue 没有信号；需配合 QueueSignal
```

配合信号使用：

```ts
const q = WithPayload<number>(Queue(QueueSignal()))

q.signal.ERROR.receive(({ task, error }) => {
  console.log('任务 payload =', q.getPayload(task), '错误 =', error)
})
q.signal.PROCESSED.receive(task => {
  console.log('完成，payload =', q.getPayload(task))
})

q.task(7, async () => { throw new Error('boom') })
```

**API**

| 成员 | 说明 |
| --- | --- |
| `task(payload, fn)` | 加任务并记录 payload |
| `getPayload(fn)` | 取回 payload；任务不存在时抛 `QueueError` |
| `setPayload(fn, payload)` | 手动设置 |
| `payload_map` | 底层 `WeakMap` |

> payload 存在 `WeakMap` 中，任务函数被回收后映射也随之消失。

---

## 细节与陷阱

1. **`task` 返回 `void`**：`const p = q.task(...)` 拿到的不是 Promise。要等待结果请用 `runTask`。
2. **任务在微任务后执行**：`q.task(fn)` 之后同步读取状态已是 `'running'`，但任务函数体尚未运行。
3. **`setMaxConcurrent` 会校验**：必须是非负整数或 `Infinity`，否则抛 `RangeError` / `TypeError`；设为 `0` 可暂停派发新任务。
4. **动态改并发立即生效**：增大则补派任务，减小则等正在执行的任务自然结束后不再补派。
5. **`setTasks` 直接替换**：配合 `WILL_PROCESS` 可实现“排空前的撤销 / 过滤”。
6. **`ALL_DONE` 可能触发多次**：一次“排空”触发一次；之后继续投递任务，再次排空会再次触发。
