# 综合示例

以下示例只展示 API 用法，省略业务函数、错误处理和完整上下文，不保证可直接运行。

## 稳定 API 示例

### 任务编排与结构化结果（Conveyor）

```ts
import { Conveyor } from 'vait'

const conveyor = Conveyor(async (id: number) => {
  const response = await fetch(`https://example.com/items/${id}`)
  return response.json()
})

conveyor.setValve(4)        // 最多 4 个任务同时处理
conveyor.setBacklogsLimit(20)

const results = await Promise.all(
  [1, 2, 3, 4].map(id => conveyor.send(id))
)

const data = results.flatMap(result => (
  result.scene === 'done' ? [result.return_value] : []
))
```

`send` 返回结构化结果；`overflow`、`timeout/*`、`processor_failure` 等场景可以在同一个 `switch` 中处理。

### 限流并发抓取（concurrentMap）

最多 5 个请求同时进行，结果顺序与输入一致。

```ts
import { concurrentMap, timeout } from 'vait'

async function fetchOne(url: string) {
  await timeout(100) // 模拟网络请求
  return 'data:' + url
}

const urls = Array.from({ length: 20 }, (_, i) => 'https://example.com/' + i)

const results = await concurrentMap(5, urls, (url) => fetchOne(url))
console.log(results.length) // 20
```

### 动态调整并发上限（concurrency.Valve）

```ts
import { concurrency, timeout } from 'vait'

const valve = concurrency.Valve(2)

const running = concurrency.each(valve, [1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
  await timeout(50)
  console.log('done', n)
})

setTimeout(() => valve.set(8), 100) // 运行中提高并发上限

await running
```

### 可取消的等待与超时保护（Wait / timeout）

```ts
import { Wait, timeout, rejectTimeout } from 'vait'

// 把 Promise 的完成权交给外部回调
function waitForMessage(): Promise<string> {
  const [waiting, done, cancel] = Wait<string>()
  // socket 为外部对象占位
  socket.on('message', done)
  socket.on('close', () => cancel(new Error('socket closed')))
  return waiting
}

// 超时保护：无论哪一方先完成，都清理定时器
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const t = timeout(ms)
  const timed = t.then(() => { throw new Error('timeout') })
  return Promise.race([promise, timed]).finally(() => rejectTimeout(t))
}

const message = await withTimeout(waitForMessage(), 3000)
```

### 带校验的状态与变更通知（Memo）

```ts
import { Memo } from 'vait'

const count = Memo(0)

Memo.addValidator(count, v => {
  return Number.isInteger(v) && v >= 0 ? undefined : 'count 必须是非负整数'
})

const cancel = Memo.watch(count, v => console.log('count changed:', v))

Memo.change(count, 5) // 打印 count changed: 5

try {
  Memo.change(count, 1.5) // 抛 MemoError
} catch (err) {
  console.log('被拒绝:', (err as Error).message)
}

console.log(Memo.value(count)) // 5，校验失败不会写入
cancel()
```

### 串行 + 并发组合（Sequence + concurrentMap）

用 `Sequence` 保证本地写入顺序，用 `concurrentMap` 做远端请求限流。

```ts
import { Sequence, concurrentMap, timeout } from 'vait'

const write = Sequence()

async function download(id: number) {
  await timeout(50)
  return 'content-' + id
}

const ids = [1, 2, 3, 4, 5]

// 最多 2 个并发下载
const contents = await concurrentMap(2, ids, download)

// 逐个串行写入
for (const content of contents) {
  await write(async () => {
    await timeout(10)
    console.log('saved', content)
  })
}
```

## Legacy 示例

以下示例使用 Legacy 模块，仅用于维护现有代码；新代码优先使用 `Conveyor`、`concurrentMap` 或 `concurrency`。

### 带进度与错误上报的队列（Queue）

```ts
import { Queue, QueueSignal, Signal } from 'vait'

const q = Queue(QueueSignal())
const total = 100
let done = 0

q.signal.SUCCESS.receive(() => {
  done += 1
  console.log(done + '/' + total)
})
q.signal.ERROR.receive(({ error }) => console.error('任务失败', error))

for (let i = 0; i < total; i++) {
  q.task(async () => {
    if (i === 42) throw new Error('第 42 个任务失败')
    await Promise.resolve()
  })
}

await Signal.wait(q.signal.ALL_DONE)
console.log('完成，成功', done, '个')
```

> 单个任务失败不会中断队列，失败通过 `ERROR` 信号上报。

### 同一用户串行、不同用户并行（QueuePool）

```ts
import { QueuePool, Signal } from 'vait'

const pool = QueuePool<string, { action: string }>()

pool.signal.ERROR.receive(({ id, payload, error }) => {
  console.error('用户 ' + id + ' 的任务 ' + payload.action + ' 失败', error)
})

pool.addTask('user:1', { action: 'read' },  async () => { /* ... */ })
pool.addTask('user:1', { action: 'write' }, async () => { /* ... */ }) // 与 read 串行
pool.addTask('user:2', { action: 'read' },  async () => { /* ... */ }) // 与 user:1 并行

await Signal.wait(pool.signal.ALL_DONE)
```

### 任务排空前动态过滤（Queue + WithPayload）

```ts
import { Queue, QueueSignal, WithPayload, Signal } from 'vait'

const q = WithPayload<number>(Queue(QueueSignal()))

q.signal.WILL_PROCESS.receive(() => {
  q.setTasks(q.getTasks().filter(t => q.getPayload(t) % 2 === 0))
})

for (let i = 0; i < 20; i++) {
  q.task(i, async () => { /* 只执行偶数 payload */ })
}

await Signal.wait(q.signal.ALL_DONE)
```
