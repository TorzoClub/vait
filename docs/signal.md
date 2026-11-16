# 信号：Signal

`Signal` 是极简的发布 / 订阅：注册回调，触发时**按注册顺序同步执行**。

```ts
import { Signal } from 'vait'

const sig = Signal<number>()

const cancel = sig.receive(n => console.log('received', n))
sig.trigger(9) // 同步打印 received 9
cancel()

sig.trigger(1) // 已取消，不再触发
```

---

## API

| 成员 | 说明 |
| --- | --- |
| `receive(fn)` | 注册监听，返回取消函数 |
| `cancelReceive(fn)` | 按函数引用移除监听 |
| `trigger(payload)` | 触发；**忽略**监听器抛出的错误并 `console.warn` |
| `triggerCareError(payload)` | 触发；监听器抛错时抛出 `SignalError`（`cause` 为原始错误） |
| `isEmpty()` | 是否没有任何监听器 |
| `Signal.once(sig, fn)` | 只监听下一次触发（静态方法） |
| `Signal.wait(sig)` | 返回在下次触发时 resolve 的 Promise（静态方法） |

- `Signal()` 无 payload，`Signal<P>()` 有 payload；`trigger` 的签名随类型变化。
- 触发是**同步**的：`trigger` 返回时所有监听器都已执行完毕。

---

## 错误策略

```ts
const sig = Signal()
sig.receive(() => { throw new Error('handler boom') })
sig.receive(() => console.log('still runs'))

sig.trigger()          // 警告 + still runs
sig.triggerCareError() // 抛 SignalError，后续监听器不再执行
```

- `trigger` 会跳过出错的监听器继续执行其余监听器，并通过 `console.warn` 提示。
- `triggerCareError` 遇到第一个错误即抛出 `SignalError`，停止后续监听器。

> `SignalError` 未从包入口导出；如需精确判断类型，可从源码路径 `./signal` 引入，或读取 `err.name / err.cause`。

---

## Signal.once

只响应下一次触发。

```ts
const sig = Signal<number>()
Signal.once(sig, n => console.log('only once', n))

sig.trigger(1) // only once 1
sig.trigger(2) // 不再触发
```

---

## Signal.wait

返回一个在信号下次触发时 resolve 的 Promise。

```ts
const sig = Signal<string>()
const p = Signal.wait(sig)

sig.trigger('hi')
console.log(await p) // hi
```

**细节**

- `Signal.wait` 只等下一次触发；如果信号在调用前已经触发过，它不会补触发。
- 与 `Wait` 的区别：`Wait` 需要生产方显式调用 `go()`，而 `Signal.wait` 直接绑定到信号。

---

## 典型用法：等待“就绪”事件

```ts
import { Signal } from 'vait'

const ready = Signal<void>()
// 生产者：ready.trigger()
// 消费者：
await Signal.wait(ready)
```

---

## 大量监听器

`Signal` 的监听器存放在数组中，按注册顺序执行；测试覆盖了 10000 个监听器的场景。移除监听是 `filter` 生成新数组，不会影响正在进行的本次触发快照。
