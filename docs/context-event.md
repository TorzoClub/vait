# 上下文与事件

> 这两个模块**尚未从 `src/index.ts` 导出**，`import { CreateContext } from 'vait'` 不可用。若项目内使用，请从源码路径引入，例如 `import { CreateContext } from './context'`。它们属于内部 / 实验性能力，API 可能调整。

---

## CreateContext

一个带类型、键集合固定的共享容器。

```ts
import { CreateContext } from './context'

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
import { Event } from './event'

const ev = Event<{
  message: string
  count: number
}>()

const off = ev.on('message', msg => console.log(msg))
ev.emit('message', 'hello')

off()
ev.isEmpty('message') // true
```

**API**

| 成员 | 说明 |
| --- | --- |
| `on(name, handler)` | 注册监听，返回取消函数 |
| `cancelReceive(name, handler)` | 按函数引用移除监听 |
| `emit(name, payload)` | 触发，同步执行监听器 |
| `isEmpty(name)` | 该事件是否没有任何监听器 |

**细节**

- 事件名与 payload 类型由泛型 `EventSetting` 决定，编译期即可校验。
- `emit` 与 `Signal.trigger` 采用相同的错误策略：忽略监听器错误，继续执行其余监听器。
- 与 `Signal` 的区别：`Event` 支持多个命名事件；`Signal` 每个实例只有一条“频道”。
