# TODOS

这里记录暂缓处理的工程改进。完成一项后勾选，并在提交信息里注明对应条目。

## 发布工程与包元数据（P2）

- [ ] `package.json` 增加 `engines`：`"node": ">=22.13"`（与 [安装与调用方式](./docs/getting-started.md) 的环境要求保持一致）。
- [ ] 增加 `exports` 映射：`"."` 的 `import` / `require` / `types` 分别指向 ESM、CJS、声明文件，并验证 Node ESM、Node CJS 与常见 bundler 都能解析。
- [ ] 用 `types` 字段指向 `./types/index.d.ts`（或明确保留 `typings` 并说明原因），确认 TypeScript 能正确解析。
- [ ] 增加 `"sideEffects": false`：库本身是纯函数 / 工厂，没有导入副作用。
- [ ] 处理 git tag 与版本号不一致：最新 tag 仍为 `v2.4.0`，而 `package.json` 已是 `5.0.0`；至少补 `v5.0.0`，或补齐历史版本 tag。
- [ ] 增加 release workflow：tag 触发 build + test + npm publish，并在发布前校验 `dist` / `types` 与 `src` 一致。
- 备注：当前 `dist/`、`types/` 是旧构建（不含 `Conveyor`，仍引用已重命名的 `outter-promise`）；任何发布前都必须先执行 `npm run build`。

## API 命名与类型导出（P3）

- [ ] `getBlacklogs` / `'in blacklogs'` 拼写统一为 `backlogs`。这涉及公开方法名和状态字符串，需要按破坏性变更处理：新增新名并弃用旧名，或留到下一个大版本。
- [ ] `ConveyorError` 文案 `'This Conveyor is Destored'` 改为 `'This Conveyor is destroyed'`。
- [ ] `getTaskStatus` 的错误消息模板缺右括号：`Task(${id} not found)` 改为 `Task(${id}) not found`。
- [ ] 导出 `TaskID`、`TaskStatus`、`RetireResult`、`Task`（或改成公开命名），让使用者在声明层能命名这些类型；同时检查 `Conveyor.getTaskIDByPromise` 的返回类型。
- [ ] 验收：`npm run runtsc`、`npm test` 通过；破坏性变更写入变更日志。

## 相关

- `Conveyor` 的当前行为与已知边界见 [任务编排：Conveyor](./docs/conveyor.md)；`retireOne` 对执行中任务的结算语义若需要调整，应单独立项。
