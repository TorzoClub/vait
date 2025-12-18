import { Memo } from './memo'
import { removeByItem } from './utils'
import { Wait } from './wait'

export type Handler<P> = (payload: P) => void
export type Handlers<P> = Handler<P>[]

export class SignalError extends Error {}

// 执行注册队列中的函数时，如果函数内部如果出错了的话，
// 进而会影响调用方的代码执行，这是不太好的
// 故 executeHandlers 将会忽略错误，并将跳过当前出错的函数
// 继续执行队列中余下的函数
export const ExecuteHandlers = <P>(ignore_error: boolean, getHandlers: () => Handler<P>[]) => (
  (payload: P) => {
    const handlers = getHandlers()
    for (let i = 0; i < handlers.length; ++i) {
      try { handlers[i](payload) } catch (cause) {
        if (ignore_error) {
          console.warn(
            'Signal has caught an error, but it is ignored by default and not thrown. ' +
            'If you want to throw this error, please use triggerCareError(). Error details:', cause
          )
        } else {
          throw new SignalError('An error occurred while executing the function queue registered in the signal.', { cause })
        }
      }
    }
  }
)

export type Signal<P = void> = Readonly<{
  trigger: P extends void ? () => void : (payload: P) => void
  triggerCareError: P extends void ? () => void : (payload: P) => void
  receive(fn: (payload: P) => void): () => void
  cancelReceive(fn: (payload: P) => void): void
  isEmpty(): boolean
}>

export function Signal(): Signal
export function Signal<P>(): Signal<P>
export function Signal<P>(): Signal<P> {
  const [getHandlers, setHandlers] = Memo<Handlers<P>>([])

  const cancelReceive = (fn: Handler<P>) => (
    setHandlers( removeByItem(getHandlers(), fn) )
  )

  return {
    isEmpty: () => getHandlers().length === 0,
    trigger: ExecuteHandlers(true, getHandlers) as Signal<P>['trigger'],
    triggerCareError: ExecuteHandlers(false, getHandlers) as Signal<P>['triggerCareError'],
    cancelReceive,
    receive(fn) {
      setHandlers(getHandlers().concat(fn))
      return () => cancelReceive(fn)
    },
  }
}

Signal.once = <P>(sig: Signal<P>, fn: Handler<P>) => {
  const cancel = sig.receive((p) => {
    cancel()
    fn(p)
  })
  return cancel
}

Signal.wait = <P>(sig: Signal<P>) => {
  const [ waiting, done ] = Wait<P>()
  Signal.once(sig, done)
  return waiting
}
