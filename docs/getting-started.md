# 安装与调用方式

## 环境要求

- 构建 / 测试需要 Node.js ≥ 22.13（CI 使用 Node 24）
- 支持 Promise 的运行时；打包产物面向 ECMAScript 2020+
- TypeScript 7 用于类型检查与声明生成；由于 typescript-eslint 尚未支持 TypeScript 7，ESLint 目前只检查 JavaScript 文件
- 自带 TypeScript 类型声明（`types/index.d.ts`）

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
| `typings` | `./types/index.d.ts` | 类型声明 |

`dist/` 与 `types/` 为构建产物，仓库中可能落后于 `src/`；以 `src/` 为准。

### 直接从源码引入（本地开发 / 二次开发）

```ts
import { Sequence } from './src'        // 等价于 ./src/index.ts
import { CreateContext } from './src/context' // 未从入口导出的模块
```

## 构建与测试

| 命令 | 作用 |
| --- | --- |
| `npm test` | 运行 Vitest 测试（含覆盖率统计） |
| `npm run test-watch` | 监听 `src/` 下的测试 |
| `npm run runtsc` | 类型检查（`tsc --noEmit`，TypeScript 7） |
| `npm run lint` | ESLint（当前仅 JS 文件） |
| `npm run lint-strict` | ESLint，警告也视为错误 |
| `npm run build:type` | 生成 `types/*.d.ts` |
| `npm run build:vite` | 使用 Vite 打包 `dist/vait.esm.js`、`dist/vait.common.js` |
| `npm run build` | 依次执行上面两步 |

## 命名与设计约定

1. **大写开头的是工厂函数**：`Wait()`、`Queue()`、`Signal()`、`Memo()`、`CreateContext()` 返回对象或元组；`Timer`、`Sequence`、`Concurrent` 直接返回函数。
2. **小写开头的是普通函数**：`timeout`、`nextTick`、`runTask`、`concurrency`、`concurrentMap`。
3. **元组返回值按位置解构**：`const [waiting, go] = Wait()`、`const [get, set] = Memo(0)`、`const [resolve, reject, promise] = OutterPromise()`。
4. **取消订阅一律返回取消函数**：`Signal.receive`、`Memo.watch`、`Event.on` 等都返回 `() => void`。
5. **错误策略**：队列 / 任务池里单个任务失败不会中断整体；`Signal.trigger` 默认吞掉监听器错误并 `console.warn`，需要抛出时用 `triggerCareError`；`concurrency` 则采用“首个错误向外抛出”的语义。
6. **`task` 不返回 Promise**：`Queue.task`、`QueuePool.addTask` 返回 `void`，需要拿到结果请用 `runTask`。

## 分模块阅读顺序建议

- 先看 [基础异步原语](./primitives.md) 理解 `Wait` / `timeout`；
- 再看 [串行执行](./sequence.md) 与 [任务队列](./queue.md)，这是最常用的调度工具；
- 需要限制并发时看 [并发控制](./concurrency.md)；
- 需要事件 / 响应式状态时看 [信号](./signal.md) 与 [可观察状态](./memo.md)。
