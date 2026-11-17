# 定时器：Timer

```ts
import { Timer } from 'vait'
```

`Timer` 是一个有状态的单次定时器：通过 `set(ms)` 开始计时，`cancel()` 终止，`countdown()` / `elapsedTime()` 查询进度。

```ts
const timer = Timer(Date.now, function onTimeout() {
  console.log('timeout')
})

timer.set(1000) // 1000ms 后触发 onTimeout
```

---

## API

```ts
export type Timer = Readonly<{
  set(ms: number): void
  cancel(): void
  countdown(): number
  elapsedTime(): number
}>

export function Timer(
  clock: () => number,
  onTimeout: () => void,
): Timer
```

| 成员 | 说明 |
| --- | --- |
| `set(ms)` | 开始或重新设定计时；校验 `ms` 为非负安全整数 |
| `cancel()` | 取消计时并冻结 `countdown` / `elapsedTime`；之后 `set` 抛错 |
| `countdown()` | 距离触发还剩多少时间 |
| `elapsedTime()` | 从第一次 `set` 开始经过的时间 |

`clock` 是时间源，通常传 `Date.now`；测试可以注入假时钟。内部定时器仍使用 `setTimeout`。

---

## 状态

| 状态 | 含义 | `countdown()` | `elapsedTime()` |
| --- | --- | --- | --- |
| `idle` | 还没有调用 `set` | `Infinity` | `0` |
| `running` | 正在计时 | 剩余时间 | 已流逝时间 |
| `canceled` | 调用了 `cancel` | 冻结值 | 冻结值 |
| `fired` | `onTimeout` 已触发 | `0` | 冻结值 |

### set

- 第一次调用：记录起点，按 `ms` 挂 `setTimeout`，进入 `running`。
- 再次调用（`running`）：**保留原起点**，只改总时长；`countdown = ms - 已流逝时间`。
  - 剩余 `> 0`：重挂定时器；
  - 剩余 `<= 0`：立即触发 `onTimeout`；
  - `ms === 0`：重挂 0ms 定时器。
- `canceled` / `fired` 状态再调用：抛 `Error`。
- 校验：`Number.isSafeInteger(ms)` 且 `ms >= 0`。负数抛 `RangeError`，小数 / `NaN` / `Infinity` / 超出安全整数范围抛 `TypeError`。

### cancel

- 清掉内部定时器，进入 `canceled`。
- 冻结 `countdown` 与 `elapsedTime`：
  - 如果取消前是 `idle`，`countdown` 冻结为 `Infinity`，`elapsedTime` 冻结为 `0`；
  - 如果取消前是 `running`，冻结取消时刻的剩余时间与已流逝时间。
- 重复调用 `cancel` 是安全的。
- 一旦 `cancel`，实例永久失效；之后 `set` 抛错。

### 超时

`onTimeout` 只触发一次。触发时：

- 进入 `fired`；
- `countdown()` 变为 `0`；
- `elapsedTime()` 冻结在触发时刻；
- 之后再调用 `set` 抛错。

---

## 示例

```ts
const timer = Timer(Date.now, () => {
  console.log('超时')
})

console.log(timer.countdown())    // Infinity
console.log(timer.elapsedTime())  // 0

timer.set(5000)

setTimeout(() => {
  console.log(timer.countdown())   // 约 3000
  console.log(timer.elapsedTime()) // 约 2000
  timer.set(8000)                  // 保留原起点，总时长改为 8000ms
  timer.cancel()                   // 冻结；此后 set 会抛错
}, 2000)
```

---

## 与 Conveyor 的关系

Conveyor 用 `Timer` 实现等待超时与处理超时，但不总是创建实例：

- 超时为 `-1`：**不创建 Timer**。
- 超时为 `0`：创建 Timer 并 `set(0)`。
- 超时为正数：创建 Timer 并 `set(ms)`。
- 正数改正数：对已有 Timer 调用 `set(ms)`，保留该任务的原起点。
- `-1` 改正数：为已存在的任务补建 Timer，并从**启用时刻**开始计时（无法回溯到任务入队/开始时刻）。
- `retireOne` / `destroy`：取消该任务相关的 waiting / processing Timer。

具体超时流程见 [任务编排：Conveyor](./conveyor.md)。
