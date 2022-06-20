import { Memo } from './memo'

type QueueFn<P> = (payload: P) => void
type Queue<P> = Array< QueueFn<P> >

function fetchQueue<P>(queue: Queue<P>, arg: P): void {
  if (queue.length !== 0) {
    const [fn, ...remaing_queue] = queue
    try {
      fn(arg)
    } catch (err) {
      console.warn('Signal Warning:', err)
    } finally {
      fetchQueue(remaing_queue, arg)
    }
  }
}

export interface Signal<A> {
  isEmpty(): boolean
  trigger(payload: A): void
  receive(fn: QueueFn<A>): void
  unReceive(fn: QueueFn<A>): void
}

export function Signal<A>(): Signal<A> {
  const [getQueue, setQueue] = Memo<Queue<A>>([])

  return Object.freeze({
    isEmpty() {
      return !getQueue().length
    },

    trigger(payload) {
      fetchQueue(getQueue(), payload)
    },

    receive(fn) {
      setQueue([...getQueue(), fn])
    },

    unReceive(removeFn) {
      setQueue(
        getQueue().filter((fn) => {
          return fn !== removeFn
        })
      )
    },
  })
}
