# vait

异步编程的一些实用函数。

`vait` 围绕三件事提供工具：

- **串行 / 并发调度**：`Sequence`、`Concurrent`、`Queue`、`QueuePool`、`concurrency`、`concurrentMap`
- **Promise 与等待**：`OutterPromise`、`Wait`、`Timer`、`timeout`、`nextTick`
- **响应式基础件**：`Signal`、`Memo`、`WithValidating`、`ChangedSignal`

## 文档

完整使用文档见 [docs/](./docs/README.md)：

| 文档 | 内容 |
| --- | --- |
| [安装与调用方式](./docs/getting-started.md) | 安装、引入、构建、测试、命名约定 |
| [基础异步原语](./docs/primitives.md) | `OutterPromise`、`Wait`、`nextTick`、`Timer`、`timeout` |
| [串行执行](./docs/sequence.md) | `Sequence`、`Concurrent` |
| [任务队列](./docs/queue.md) | `Queue`、`QueueSignal`、`WithPayload`、`runTask` |
| [按 ID 的任务池](./docs/queue-pool.md) | `QueuePool` |
| [并发控制](./docs/concurrency.md) | `concurrency`、`Valve`、`each`、`concurrentMap` |
| [信号](./docs/signal.md) | `Signal` |
| [可观察状态](./docs/memo.md) | `Memo` |
| [上下文与事件](./docs/context-event.md) | `CreateContext`、`Event`（未从入口导出） |
| [实验性模块](./docs/experimental.md) | `Val`、`new_memo` |
| [综合示例](./docs/examples.md) | 限流抓取、任务队列、任务池、动态并发等 |
| [下一版本规划](./docs/next.md) | v6 特性整理：风格规范、命名重构、Conveyor、待决问题 |

## 安装

```bash
yarn add vait
# or
npm install --save vait
```

## 快速开始

### 延时

```javascript
import { timeout } from 'vait'

timeout(1000).then(() => {
  console.log('hello after 1000ms')
})
```

### 串行执行

```javascript
import { Sequence, timeout } from 'vait'

const sq = Sequence()

function randomNumber(range) {
  return Math.floor(Math.random() * range)
}

sq(async () => {
  await timeout(randomNumber(100))
  console.log('step one')
})
sq(async () => {
  await timeout(randomNumber(100))
  console.log('step two')
})
sq(async () => {
  await timeout(randomNumber(100))
  console.log('step three')
})

// 永远按调用顺序输出：
//   step one
//   step two
//   step three
```

### 手动控制完成时机

```javascript
import { Wait } from 'vait'

const [wait, go] = Wait()

wait.then(str => {
  // 如果不执行 go, 此函数将永远不会执行
  console.log(str)
})

go('hello, world') // 支持一个参数传入
go() // Promise resolve 只生效一次，前面的 console.log 只会执行一次
```

```javascript
// 一个“卡”住运行时的用法
import { Wait } from 'vait'

const [waiting, go] = Wait()

;(async () => {
  const value = await waiting
  console.log('value accepted:', value)
})()

setTimeout(() => {
  // 一秒后才会出现 value accepted: 3.1415926
  go(3.1415926)
}, 1000)
```

### 任务队列

```javascript
import { Queue, QueueSignal, Signal } from 'vait'

const q = Queue(QueueSignal())

q.signal.SUCCESS.receive(() => console.log('一个任务完成了'))
q.signal.ERROR.receive(({ error }) => console.error('任务失败', error))

for (let i = 0; i < 10; i++) {
  q.task(async () => {
    // 默认串行执行；q.setMaxConcurrent(n) 可调整并发
  })
}

await Signal.wait(q.signal.ALL_DONE) // 等到队列排空
```

### 限流并发

```javascript
import { concurrentMap, timeout } from 'vait'

// 最多 3 个并发，结果顺序与输入一致
const result = await concurrentMap(3, [1, 2, 3, 4, 5], async n => {
  await timeout(100)
  return n * 2
})
console.log(result) // [2, 4, 6, 8, 10]
```

## 模块总览

| 模块 | 主要导出 | 用途 |
| --- | --- | --- |
| wait | `Wait`、`WaitingRejected` | 手动完成 / 取消一个等待 |
| outter-promise | `OutterPromise` | 暴露 resolve / reject 的 Promise |
| timer | `Timer` | 可取消的定时器 |
| timeout | `timeout`、`rejectTimeout`、`TimeoutRejected` | 延时与超时取消 |
| next-tick | `nextTick` | 微任务 tick |
| sequence | `Sequence` | 串行执行器 |
| concurrent | `Concurrent` | 带并发上限的执行器 |
| queue | `Queue`、`QueueSignal`、`WithPayload`、`runTask` | 任务队列 |
| queue-pool | `QueuePool` | 按 ID 分组、组内串行的任务池 |
| concurrency | `concurrency`（`.Valve`、`.each`） | 通用并发控制 |
| concurrent-map | `concurrentMap` | 并发 map，保持结果顺序 |
| signal | `Signal`（`.once`、`.wait`） | 发布 / 订阅信号 |
| memo | `Memo`、`WithValidating`、`ChangedSignal` | 可观察值 + 校验 + 监听 |

> `context.ts`、`event.ts`、`data.ts`、`new_memo.ts` 尚未从入口导出，详见文档。

## 开发

```bash
npm test          # 运行 Vitest 测试（含覆盖率）
npm run runtsc    # 类型检查（TypeScript 7）
npm run lint      # ESLint（当前仅检查 JS 文件）
npm run build     # 生成 types/ 与 dist/
```

源码位于 `src/`，`dist/` 与 `types/` 为构建产物。

## License

MIT © vec <vec@torzo.club>
