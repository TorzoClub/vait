# 安装与调用

## 环境要求

- 构建和测试需要 Node.js ≥ 20（CI 使用 Node 24）。
- 运行时需要支持 Promise；打包产物面向 ECMAScript 2023+。
- 类型检查与声明生成使用 TypeScript 7。
- 类型声明由构建生成到 `types/index.d.ts`，仓库不提交该产物。

## 安装

```bash
npm install --save vait
# 或
yarn add vait
```

## 引入方式

### ES Module / TypeScript

```ts
import { timeout, Sequence, Signal, Wait } from 'vait'
```

### CommonJS

```js
const { timeout, Wait, QueuePool } = require('vait')
```

### 包入口字段

| 字段 | 文件 | 说明 |
| --- | --- | --- |
| `main` | `./dist/vait.common.js` | CommonJS 入口 |
| `module` | `./dist/vait.esm.js` | ESM 入口 |
| `typings` | `./types/index.d.ts` | 类型声明，构建后生成 |

`dist/` 与 `types/` 是构建产物，不提交到仓库；本地使用或发布前需要先执行构建。

### 直接从源码引入

```ts
import { Sequence } from './src' // 等价于 ./src/index.ts
```

`src/deprecated/` 和 `src/experimental/` 下的模块不从包入口导出，也不建议直接用于业务代码；边界见 [文档索引](./README.md)。

## 构建与测试

| 命令 | 作用 |
| --- | --- |
| `npm test` | 运行 Vitest 测试（覆盖率已启用） |
| `npm run test-watch` | 监听 `src/` 下的测试 |
| `npm run runtsc` | 类型检查（`tsc --noEmit`，TypeScript 7） |
| `npm run lint` | ESLint，当前只检查 JavaScript 文件 |
| `npm run lint-strict` | ESLint，警告也视为错误 |
| `npm run build:type` | 生成 `types/*.d.ts` |
| `npm run build:vite` | 使用 Vite 打包 `dist/vait.esm.js`、`dist/vait.common.js` |
| `npm run build` | 依次执行类型生成与打包 |

## 命名与设计约定

1. **大写开头的是工厂函数**：`Wait()`、`Queue()`、`Signal()`、`Memo()`、`Timer()`、`Conveyor()` 返回对象或元组；`Sequence`、`Concurrent` 直接返回函数。
2. **小写开头的是普通函数**：`timeout`、`nextTick`、`runTask`、`concurrency`、`concurrentMap`。
3. **元组返回值按位置解构**：`const [waiting, go] = Wait()`、`const [get, set] = Memo(0)`、`const [resolve, reject, promise] = OuterPromise()`。
4. **注册监听或钩子返回取消函数**：`Signal.receive`、`Signal.once`、`Memo.watch`、`Memo.addValidator`、`Memo.forward` 等都返回 `() => void`。
5. **错误策略**：队列和任务池里单个任务失败不会中断整体；`Signal.trigger` 默认忽略监听器错误并 `console.warn`，需要抛出时使用 `triggerCareError`；`concurrency` 采用首个错误向外抛出的语义；`Conveyor` 将 processor 的错误作为 `processor_failure` 结果返回，而不是让 `send()` reject。
6. **`task` 不返回 Promise**：`Queue.task`、`QueuePool.addTask` 返回 `void`；需要结果时使用 `runTask` 或 `Conveyor.send`。

## 下一步

[文档索引](./README.md) 包含稳定性分级、API 选择表和按主题组织的目录。
