# 定时器：Timer / PromiseTimer

```ts
import { Timer, PromiseTimer } from 'vait'
```

`vait` 提供两个层次的定时器：

- `Timer(ms, fn)`：最薄的 `setTimeout` 可取消封装，适合一次性的延时回调；
- `PromiseTimer(initial)`：可动态调整、可挂到 Promise 生命周期上的定时器，适合超时控制；`Conveyor` 的等待 / 处理超时就是用两个 `PromiseTimer` 实现的。

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
- 不对 `ms` 做特殊语义处理：直接透传给 `setTimeout`。

---

## PromiseTimer

`PromiseTimer` 是一个「时间配置 + 多个挂载点」的定时器控制器：

- 创建时给一个初始时间；
- 通过 `setTime` 动态修改时间，修改会作用于所有已挂载的定时器；
- 通过 `mount(promise, onTimeout)` 把一个 Promise 和超时回调绑定起来；
- 时间值支持 `-1`（不使用定时器）、`0`（0ms）和正数（毫秒）。

### 快速开始

```ts
import { PromiseTimer } from 'vait'

const timer = PromiseTimer(1000)
const controller = new AbortController()

const cancel = timer.mount(
  fetch('https://example.com/slow', { signal: controller.signal }),
  elapsed_time => {
    console.log(`已经过去 ${elapsed_time}ms，取消请求`)
    controller.abort()
  },
)

// 动态调整
timer.setTime(5000) // 延长
timer.setTime(0)    // 0ms 后超时
timer.setTime(-1)   // 关闭定时器（如果已有定时器，取消它）

cancel()            // 手动取消挂载点
```

### API

```ts
type CancelTimer = () => void

type PromiseTimer = Readonly<{
  getTime(): number
  setTime(t: number): void
  mount(
    promise: Promise<unknown>,
    onTimeout: (elapsed_time: number) => void,
  ): CancelTimer
}>

function PromiseTimer(initial: number): PromiseTimer
```

| 成员 | 说明 |
| --- | --- |
| `getTime()` | 返回当前时间配置 |
| `setTime(t)` | 设置时间；校验通过后立即作用于所有已挂载的定时器 |
| `mount(promise, onTimeout)` | 挂载一个定时器；返回取消函数。`promise` 结算后会自动取消定时器 |

### 时间值语义

| 值 | 含义 |
| --- | --- |
| `-1` | 不使用定时器；如果当前有定时器，立即取消，不让它触发 |
| `0` | 0ms 定时器：用 `setTimeout(fn, 0)` 触发 |
| 正安全整数 | `ms` 毫秒后触发 |
| `Infinity` / 小数 / `NaN` | 非法，抛错 |

校验规则（`PromiseTimer(initial)` 与 `setTime` 都适用）：

- 必须是 `Number.isSafeInteger`；
- 必须 `>= -1`；
- 非安全整数（含小数、`NaN`、`Infinity`）抛 `TypeError`；
- 小于 `-1` 的整数抛 `RangeError`。

非法值不会写入，也不会改变之前的时间配置。

### mount 与生命周期

- `mount` 返回一个取消函数；调用后清除当前定时器和内部 watcher。
- 如果 `promise` 先结算，定时器会自动取消（内部通过 `promise.finally(...)` 清理），不会触发 `onTimeout`。
- `onTimeout` 只触发一次：触发后会清除定时器和 watcher，之后再调用 `setTime` 不会再次触发该挂载点。
- `elapsed_time` 是从 `mount` 时刻到实际触发时刻的毫秒数。
- 初始值为 `-1` 时也会注册时间 watcher，因此之后调用 `setTime(正数)` 或 `setTime(0)` 仍能作用于这个挂载点。

### 动态调整

`setTime` 会影响该 `PromiseTimer` 上所有仍存活的挂载点：

- 新值为 `-1`：取消当前定时器，不会触发超时；
- 新值为 `0`：重新挂一个 0ms 定时器；
- 新值为正数：按「新时间 - 已流逝时间」计算剩余时间；剩余 `> 0` 则重挂，`<= 0` 则立即触发。

例如，挂载后已经过了 200ms，再把时间改成 100ms，会立即触发，`elapsed_time` 约为 200。

---

## 与 Conveyor 的关系

`Conveyor` 内部为等待阶段和处理阶段各维护一个 `PromiseTimer`：

- `setWaitingTimeout(ms)` → 等待阶段 `PromiseTimer.setTime(ms)`；
- `setProcessingTimeout(ms)` → 处理阶段 `PromiseTimer.setTime(ms)`。

因此 `Conveyor` 的超时同样使用 `-1`（不启用）/ `0`（0ms）/ 正数（毫秒）的语义。具体配置与任务生命周期见 [任务编排：Conveyor](./conveyor.md)。
