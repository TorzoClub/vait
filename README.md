# vait

异步编程的实用工具集，主要覆盖三类能力：

- **任务编排与并发**：`Conveyor`、`Executor`
- **Promise 与等待**：`OuterPromise`、`Wait`、`Timer`、`timeout`、`nextTick`
- **信号与状态**：`Signal`、`Memo`、`WithValidating`、`ChangedSignal`

`Queue`、`QueuePool`、`Sequence`、`Concurrent`、`concurrency`、`concurrentMap` 仍从包入口导出，归为 Legacy；`CreateContext`、`Event` 为 Deprecated，不再从入口导出。稳定性定义和完整目录见 [文档索引](./docs/README.md)。

## 安装

```bash
npm install --save vait
# 或
yarn add vait
```

## 快速开始

### 任务编排：Conveyor

`Conveyor` 把提交的任务交给构造时传入的 `processor`，并按并发上限执行；每个任务返回结构化结果。

```ts
import { Conveyor } from 'vait'

const conveyor = Conveyor(async (url: string) => {
  const response = await fetch(url)
  return response.text()
})

conveyor.setValve(3) // 最多 3 个任务同时处理

const result = await conveyor.send('https://example.com/')

if (result.scene === 'done') {
  console.log(result.return_value)
}
```

### 批量执行：Executor

```ts
import { Executor, timeout } from 'vait'

const executor = Executor({ concurrency: 3 })

const result = await Promise.all(
  [1, 2, 3, 4, 5].map(n => executor(async () => {
    await timeout(100)
    return n * 2
  }))
)

console.log(result) // [2, 4, 6, 8, 10]
```

结果顺序与调用顺序一致；同时执行的 async 函数数量不超过 3。

### 信号：Signal

```ts
import { Signal } from 'vait'

const ready = Signal<void>()
const cancel = ready.receive(() => console.log('ready'))

ready.trigger()
cancel() // 取消订阅
```

## 文档

完整文档见 [docs/README.md](./docs/README.md)：包含稳定性分级、API 选择表、模块参考、示例和迁移说明。

## License

MIT © vec <vec@torzo.club>
