# 上下文与事件（Deprecated）

> **Deprecated**：这两个模块已移至 `src/deprecated/`，并且**没有**从 `src/index.ts` 导出，`import { CreateContext } from 'vait'` 和 `import { Event } from 'vait'` 不可用。不应在新代码中使用；如需查阅，可直接阅读 `src/deprecated/context.ts` 与 `src/deprecated/event.ts`。

---

## CreateContext

一个带类型、键集合固定的共享容器。

```ts
// 以下示例假设已从源码 src/deprecated/context 引入 CreateContext
const ctx = CreateContext({ count: 0, name: 'vait' })

ctx.has('count')     // true
ctx.get('count')     // 0
ctx.set('count', 1)
ctx.get('count')     // 1
```

**API**

| 成员 | 说明 |
| --- | --- |
| `has(key)` | 键是否存在于预设中 |
| `get(key)` | 取键对应的值 |
| `set(key, value)` | 修改键对应的值 |

**细节**

- 预设对象会被浅拷贝到 `Object.create(null)` 上，因此**不会继承原型链上的属性**：

```ts
const ctx = CreateContext(Object.create({ val: 0 }))
ctx.has('val')       // false
ctx.get('val')       // 抛 VaitContextError
```

- `get` / `set` 只允许预设中已存在的键；访问不存在的键抛 `VaitContextError`。
- 返回的 context 对象被 `Object.freeze`，不能新增或替换方法。
- 值按引用存储，可以像普通对象一样修改其内部字段。

**类型参数**

```ts
type Ctx = Context<'a' | 'b', { a: number; b: number }>

function inc(ctx: Ctx) {
  ctx.set('a', ctx.get('a') + 1)
}
```

- 第一参数是键的联合类型，第二参数是键到值类型的映射。
- `CreateContext` 会从传入对象推断这两个类型；也可显式标注。

---

## Event

带类型约束的多事件发布 / 订阅。

```ts
// 以下示例假设已从源码 src/deprecated/event 引入 Event
const ev = Event<{
  message: string
  count: number
}>()

const onMessage = (msg: string) => console.log(msg)
ev.on('message', onMessage)
ev.emit('message', 'hello')

ev.cancelReceive('message', onMessage)
ev.isEmpty('message') // true
```

**API**

| 成员 | 说明 |
| --- | --- |
| `on(name, handler)` | 注册监听；取消监听使用 `cancelReceive` |
| `cancelReceive(name, handler)` | 按函数引用移除监听 |
| `emit(name, payload)` | 触发，同步执行监听器 |
| `isEmpty(name)` | 该事件是否没有任何监听器 |

**细节**

- 事件名与 payload 类型由泛型 `EventSetting` 决定，编译期即可校验。
- `on` 的类型声明返回 `void`；取消监听应使用 `cancelReceive(name, handler)`，不要依赖 `on` 的返回值。
- `emit` 与 `Signal.trigger` 采用相同的错误策略：忽略监听器错误，继续执行其余监听器。
- 与 `Signal` 的区别：`Event` 支持多个命名事件；`Signal` 每个实例只有一种 payload 类型。
