# 基础异步原语

```ts
import {
  OutterPromise,
  Wait, WaitingRejected,
  nextTick,
  Timer,
  timeout, rejectTimeout, TimeoutRejected,
} from 'vait'
```

---

## OutterPromise

把 Promise 的 `resolve` / `reject` 暴露到外部，适合做回调桥接。

```ts
const [resolve, reject, promise] = OutterPromise<number>()

resolve(42)
await promise // 42
```

不传类型参数时类型为 `void`：

```ts
const [ok, fail, p] = OutterPromise()
fail(new Error('nope'))
await p.catch(e => console.log(e.message)) // nope
```

**API**

| 项 | 说明 |
| --- | --- |
| 返回 | `readonly [resolve, reject, promise]` |
| 泛型 | `OutterPromise<T>()`；默认 `T = void` |

---

## Wait

`OutterPromise` 的语义化封装：`Wait()` 返回 `[waiting, go, cancel]`。

```ts
const [waiting, go, cancel] = Wait<string>()

setTimeout(() => go('done'), 1000)
console.log(await waiting) // 1 秒后输出 done
```

**API**

| 项 | 说明 |
| --- | --- |
| `waiting` | `Promise<T>`，等待被完成 |
| `go(value)` | 完成 `waiting`；**只生效一次**，后续调用被忽略 |
| `cancel(cause?)` | 让 `waiting` 以 `WaitingRejected` 拒绝，`cause` 即传入参数 |

```ts
const [waiting, go, cancel] = Wait()
cancel(new Error('user aborted'))

try {
  await waiting
} catch (err) {
  err instanceof WaitingRejected // true
  err.cause                      // Error: user aborted
}
```

**细节**

- Promise 状态不可逆：`go` 之后再 `cancel`、或 `cancel` 之后再 `go` 都不会改变结果。
- 无参 `go()` 对应 `T = void`；需要携带值用 `Wait<T>()`。
- `cancel` 之后再次调用也是安全的（Promise 已定型）。

---

## nextTick

返回一个已 resolve 的 Promise，用于把后续逻辑推迟到微任务队列。

```ts
await nextTick()
```

**细节**

- 实现就是 `Promise.resolve()`，等价于 `await Promise.resolve()`。
- 它是**微任务**，不等价于 `setImmediate` / `setTimeout(fn, 0)`（宏任务）。
- 队列内部用它保证“投递任务后不立即同步执行”。

---

## Timer

`setTimeout` 的可取消封装。

```ts
const cancel = Timer(1000, () => console.log('1s later'))
cancel() // 取消，回调不再执行
```

**API**

| 项 | 说明 |
| --- | --- |
| 参数 | `(ms: number, fn: () => void)` |
| 返回 | `() => void`，调用即取消 |
| 类型 | `CancelTimer` |

**细节**

- 只执行一次，不重复。
- 重复调用取消函数是安全的（底层 `clearTimeout` 幂等）。

---

## timeout 与 rejectTimeout

```ts
await timeout(1000) // 1 秒后 resolve

const t = timeout(60_000)
rejectTimeout(t)    // t 立刻以 TimeoutRejected 拒绝，并清除定时器
```

**API**

| 函数 | 说明 |
| --- | --- |
| `timeout(ms)` | 返回 `Promise<void>`，`ms` 后 resolve |
| `rejectTimeout(waiting)` | 取消一个由 `timeout` 创建的 Promise，使其以 `TimeoutRejected` 拒绝 |

**细节**

- `rejectTimeout` 对**非`timeout` 创建的 Promise 是空操作**（内部用 `WeakMap` 记录）。
- 被取消时会 `clearTimeout`，不会残留定时器。
- 拒绝错误的类型是 `TimeoutRejected`，其 `cause` 为 `rejectTimeout` 的入参。
- 已经 resolve 之后调用 `rejectTimeout` 不会改变结果。

---

## 组合示例：给任意 Promise 加超时

```ts
import { timeout, rejectTimeout } from 'vait'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const t = timeout(ms)
  const timed = t.then(() => { throw new Error('request timeout') })
  return Promise.race([promise, timed]).finally(() => {
    rejectTimeout(t) // 清理定时器，避免长时间挂起
  })
}

await withTimeout(fetch('/api').then(r => r.json()), 3000)
```

> 在 `finally` 里取消 `timeout`：即使主 Promise 先完成，也能立刻释放定时器。

---

## 组合示例：等待外部事件

```ts
import { Wait } from 'vait'

const [waiting, done, cancel] = Wait<string>()

socket.on('message', done)
socket.on('close', () => cancel(new Error('socket closed')))

const message = await waiting
```
