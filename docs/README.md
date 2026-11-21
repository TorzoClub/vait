# vait 文档

`vait` 提供异步编程中的任务调度、等待、定时与状态管理工具。本页是文档索引，同时给出稳定性分级和 API 选择表。

## 稳定性定义

- **Stable**：从包入口导出，按公开 API 维护；文档和测试覆盖当前行为。
- **Legacy**：仍从包入口导出，行为保持，但不再主动增加能力；新代码优先使用 Stable 替代。
- **Deprecated**：不再从包入口导出，仅保留源码；不保证后续可用。
- **Experimental**：位于 `src/experimental/`，不从入口导出，不参与 tsc、ESLint 和测试，不保证兼容。

## API 选择

| 场景 | 推荐 | 稳定性 |
| --- | --- | --- |
| 批量执行 async 函数（并发 / 背压 / 超时 / 销毁） | `Executor` | Stable |
| 长期提交任务、背压、等待 / 处理超时、中断、结构化结果 | `Conveyor` | Stable |
| 手动完成或取消 Promise | `Wait` / `OuterPromise` | Stable |
| 延时、取消延时、可查询进度的定时器 | `timeout` / `rejectTimeout` / `Timer` | Stable |
| 发布订阅、可观察状态 | `Signal` / `Memo` / `WithValidating` / `ChangedSignal` | Stable |
| 按 key 分组串行 | 每个 key 建一个 `Conveyor` | Stable |
| 严格串行执行 | `Sequence`（或 `Concurrent(1)`） | Legacy |
| 固定并发上限的批量映射 | `concurrentMap` | Legacy |
| 消费任意迭代器或数组 | `concurrency` / `concurrency.each` | Legacy |
| 已有 Queue 代码、队列信号、payload 映射 | `Queue` | Legacy |
| 需要 QueuePool 的 `pause` / `resume`，或已有 QueuePool 代码 | `QueuePool` | Legacy |
| 上下文、多命名事件 | `CreateContext` / `Event` | Deprecated |
| 实验性原型 | `src/experimental/` | Experimental |

`Executor` 基于 `Conveyor`。`Sequence` / `Concurrent` / `concurrency` / `concurrentMap` 已归入 Legacy，源码与文档分别位于 `src/legacy/` 与 `docs/legacy/`。

## 文档目录

| 分组 | 文档 | 稳定性 | 内容 |
| --- | --- | --- | --- |
| 入门 | [安装与调用](./getting-started.md) | — | 环境要求、安装、引入、构建测试、命名约定 |
| 基础原语 | [基础异步原语](./primitives.md) | Stable | `OuterPromise`、`Wait`、`nextTick`、`timeout`、`rejectTimeout` |
| 调度与并发 | [批量执行：Executor](./executor.md) | Stable | 内部 Conveyor、并发 / 背压 / 超时、销毁 |
| API Reference | [定时器：Timer](./timer.md) | Stable | `set` / `cancel` / `countdown` / `elapsedTime` 与状态语义 |
| API Reference | [信号：Signal](./signal.md) | Stable | `Signal`、`Signal.once`、`Signal.wait` |
| API Reference | [可观察状态：Memo](./memo.md) | Stable | `Memo`、`WithValidating`、`ChangedSignal` |
| Guides | [任务编排：Conveyor](./conveyor.md) | Stable | 并发上限、积压上限、等待 / 处理超时、中断、退役、状态查询 |
| Legacy | [串行执行：Sequence 与 Concurrent](./legacy/sequence.md) | Legacy | 串行执行与固定并发上限 |
| Legacy | [并发控制：concurrency / Valve / each / concurrentMap](./legacy/concurrency.md) | Legacy | 通用并发控制、动态并发上限、并发映射 |
| Legacy | [任务队列：Queue](./legacy/queue.md) | Legacy | `Queue`、`QueueSignal`、`WithPayload`、`runTask` |
| Legacy | [按 ID 分组：QueuePool](./legacy/queue-pool.md) | Legacy | 按 ID 分组、组内串行、暂停与恢复 |
| — | [综合示例](./examples.md) | — | 任务编排、批处理、等待与超时、可观察状态 |
| — | [迁移与变更记录](./migration.md) | — | v5 变更、Legacy / Deprecated 迁移、版本说明 |
| 附录 | [上下文与事件](./deprecated/context-event.md) | Deprecated | `CreateContext`、`Event` |
| 附录 | [实验场](./experimental.md) | Experimental | `src/experimental/` 的边界 |
