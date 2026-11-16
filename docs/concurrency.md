# 并发控制：concurrency / Valve / each / concurrentMap

```ts
import { concurrency, concurrentMap } from 'vait'
```

---

## concurrency(valveOrNum, iterator, asyncFn)

以一个“阀门”（并发上限）消费迭代器，`asyncFn(item, idx)` 在并发上限内执行。

```ts
await concurrency(3, [1, 2, 3, 4, 5][Symbol.iterator](), async (item, idx) => {
  await timeout(100)
  console.log(idx, item)
})
```

**API**

| 项 | 说明 |
| --- | --- |
| `valveOrNum` | 数字上限，或 `concurrency.Valve(n)` 返回的可变阀门 |
| `iterator` | 任意 `IterableIterator<T>`，如 `list[Symbol.iterator]()` |
| `asyncFn` | `(item, idx) => Promise<void>` |
| 返回 | `Promise<void>`：迭代器耗尽且所有进行中任务结束后 resolve |

**细节**

- 第一个任务在下次调用时**同步启动**（不会先等一个 tick）。
- 并发上限为 `Infinity` 时表示不限制；为 `0` 时可创建后通过阀门再放开。
- 错误采用“**首个错误向外抛出**”语义：

```ts
try {
  await concurrency(2, [0, 1, 2][Symbol.iterator](), async (_, idx) => {
    if (idx === 0) throw new Error('first error wins')
    await timeout(1000)
  })
} catch (err) {
  console.error(err) // first error wins（不必等慢任务）
}
```

> 一旦发生错误，不再派发新任务；但**已经在执行的 `asyncFn` 无法被强制取消**，会继续跑到结束。不要依赖“失败后其它任务一定没执行”。

---

## concurrency.Valve(n)

可动态调整的并发阀门。

```ts
const valve = concurrency.Valve(1)

valve.get()  // 1
valve.set(5) // 动态放大
valve.set(0) // 暂停派发（不影响正在执行的任务）
valve.memo   // 内部 Memo<number>，可用 Memo.watch 监听变化
```

**校验规则**

- `n` 必须 `>= 0`，且为整数或 `Infinity`；
- 违反时 `set` 抛 `RangeError`（负数）/ `TypeError`（非整数），且原值保持不变。

**动态调整示例**

```ts
const valve = concurrency.Valve(1)
const running = concurrency.each(valve, [1, 2, 3, 4, 5], async () => {
  await timeout(50)
})

valve.set(5)  // 立刻补派任务
await running
```

> 阀门变化会在**下一个微任务**生效（内部通过 `Memo.watch` + `nextTick` 触发重新派发）。

---

## concurrency.each(valve, list, asyncFn)

`concurrency` 的数组版本，回调可拿到原数组：`asyncFn(item, idx, list)`。

```ts
await concurrency.each(2, ['a', 'b', 'c'], async (item, idx, list) => {
  await timeout(50)
  console.log(idx, item, list.length) // list 始终是原数组
})
```

---

## concurrentMap(valve, list, asyncFn)

并发地对数组做映射，**结果顺序与输入一致**。

```ts
const result = await concurrentMap(3, ['a', 'b', 'c'], async (item, idx) => {
  await timeout(Math.random() * 100)
  return idx + ':' + item
})
console.log(result) // ['0:a', '1:b', '2:c']
```

**API**

| 项 | 说明 |
| --- | --- |
| 参数 | 与 `concurrency` 一致，回调签名为 `(item, idx, total)` |
| 返回 | `Promise<NT[]>`，索引与输入一一对应 |
| 空数组 | 立即 resolve `[]` |
| 错误 | 任一回调失败，整体 reject（原因即第一个错误） |

```ts
// 限制 5 个并发地处理 1000 条数据，结果保持原顺序
const output = await concurrentMap(5, inputList, async (item, idx, list) => {
  return await handle(item, idx, list)
})
```

---

## 如何选择

| 场景 | 推荐 |
| --- | --- |
| 数组并发映射，需要结果 | `concurrentMap` |
| 消费任意可迭代对象 | `concurrency` |
| 运行中动态调整并发上限 | `concurrency.Valve` + `concurrency` / `concurrentMap` |
| 需要队列语义（暂停、丢弃、信号、payload） | `Queue` / `QueuePool` |
| 需要任务按加入顺序串行 | `Sequence` / `Concurrent` |

---

## 与 Queue 的区别

- `concurrency` 是“一次性消费一个迭代器 / 数组”，适合批量数据处理。
- `Queue` 是可长期存在、可不断投递、可暂停 / 丢弃 / 携带 payload 的队列。
- 两者都支持运行时调整并发；`concurrency` 通过 `Valve`，`Queue` 通过 `setMaxConcurrent`。
