import { Memo } from './memo'

type Handler<P> = (payload: P) => void
type Handlers<P> = Array< Handler<P> >

function executeHandlers<P>(handlers: Handlers<P>, payload: P): void {
  if (handlers.length !== 0) {
    const [fn, ...remaing] = handlers
    try {
      fn(payload)
    } catch (err) {
      console.warn('Signal Warning:', err)
    } finally {
      executeHandlers(remaing, payload)
    }
  }
}

export interface Signal<P> {
  isEmpty(): boolean
  trigger(payload: P): void
  receive(fn: Handler<P>): void
  unReceive(fn: Handler<P>): void
}
export function Signal(): Signal<void>
export function Signal<P>(): Signal<P>
export function Signal<P>(): Signal<P> {
  const [getHandlers, setHandlers] = Memo<Handlers<P>>([])

  return {
    isEmpty: () => !getHandlers().length,
    trigger: payload => executeHandlers(getHandlers(), payload),
    receive: fn => setHandlers([...getHandlers(), fn]),
    unReceive: removeFn =>
      setHandlers(
        getHandlers().filter(
          fn => fn !== removeFn
        )
      )
  } as const
}
