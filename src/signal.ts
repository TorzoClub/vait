import { Memo } from './memo'
import { nextTick } from './next-tick'

type Handler<P> = (payload: P) => void
type Handlers<P> = Array< Handler<P> >

// 执行注册队列中的函数时，如果函数内部如果出错了的话，
// 进而会影响调用方的代码执行，这是不太好的
// 故 executeHandlers 将会忽略错误，并将跳过当前出错的函数
// 继续执行注册队列中余下的函数
// executeHandlers 有可能是异步执行的，
// 加入 nextTick 的原因是规避递归栈溢出的问题，万一就有
// 这么一种几万个 handler 都在抛出错误的场景……
// 其实递归可以用蹦床来解决，但是蹦床太丑陋了，而且 TS 的
// 类型系统无法完美地处理蹦床高阶函数，就跟柯里化的情况一样
// 最重要的是，蹦床本质上就是迭代语句，那还不如写成迭代的好了
function executeHandlers<P>(
  handlers: Handlers<P>,
  payload: P,
  i = 0
) {
  try {
    for (; i < handlers.length; ++i) {
      handlers[i](payload)
    }
  } catch (err) {
    console.warn('Signal trigger Error:', err)
    nextTick().then(() => {
      executeHandlers(handlers, payload, i + 1)
    })
  }
}

const removeByItem = <T>(list: T[], remove_item: T) =>
  list.filter((item) => item !== remove_item)

export interface Signal<P> {
  isEmpty(): boolean
  trigger(payload: P): void
  receive(fn: Handler<P>): void
  cancelReceive(fn: Handler<P>): void
}
export function Signal(): Signal<void>
export function Signal<P>(): Signal<P>
export function Signal<P>(): Signal<P> {
  const [getHandlers, setHandlers] = Memo<Handlers<P>>([])
  return {
    isEmpty: () => !getHandlers().length,
    trigger: payload => executeHandlers(getHandlers(), payload),
    receive: fn => setHandlers([...getHandlers(), fn]),
    cancelReceive: removeFn =>
      setHandlers(
        removeByItem(getHandlers(), removeFn)
      )
  } as const
}
