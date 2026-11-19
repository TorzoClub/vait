# 迁移与变更记录

本页记录能从当前仓库确认的 v5 变更，以及与 Legacy / Deprecated 模块相关的迁移说明。

更早的 v2 / v3 公开 API 与当前版本差异较大，不提供逐项迁移表；升级时应以当前文档和 `src/index.ts` 的导出为准。

## v5

- **新增 `Conveyor`**：用于长期任务提交、背压、等待 / 处理超时、中断和结构化结果。新代码的任务编排优先使用 [`Conveyor`](./conveyor.md)。
- **`Queue` / `QueuePool` 归为 Legacy**：源码位于 `src/legacy/`，仍从包入口导出，行为保持，但不再主动增加能力。新代码优先使用 `Conveyor`、`concurrentMap` 或 `concurrency`；现有代码见 [`Queue`](./legacy/queue.md) 与 [`QueuePool`](./legacy/queue-pool.md)。
- **`CreateContext` / `Event` 归为 Deprecated**：源码位于 `src/deprecated/`，不再从包入口导出。`import { CreateContext } from 'vait'` 和 `import { Event } from 'vait'` 不可用；详情见 [上下文与事件](./deprecated/context-event.md)。
- **`OutterPromise` 更名为 `OuterPromise`**：使用旧名称的代码需要更新导入。
- **Conveyor 结果字段使用 `scene`**：结算结果通过 `scene` 判别，例如 `done`、`overflow`、`processor_failure`、`timeout/in_waiting`、`timeout/in_processing`、`retired/in_waiting`、`retired/in_processing`、`destroyed`。状态字符串也使用路径式名称。
- **包目标调整**：`package.json` 声明 Node.js ≥ 20；Vite 构建目标为 ECMAScript 2023。

> `scene` 字段和路径式状态字符串只影响使用过 v5 预发布版本的代码；从更早版本直接升级时，应以当前文档中的 API 为准。

## 版本说明

- `package.json` 的版本是 v5.0.0，版本号以该文件为准。
- 仓库中的 git tag 可能滞后于 `package.json`，不应当用 tag 判断当前发布版本。
- `dist/` 与 `types/` 是构建产物，不提交到仓库；本地使用或发布前需要执行 `npm run build`。
- 本页同时承担 v5 变更记录；不单独维护根级 `CHANGELOG.md`，避免两处内容不同步。
