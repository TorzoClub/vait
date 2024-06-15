import { Queue, QueueSignal, QueueWithPayload, QueueWithSignal, WithPayload } from './queue'
import { Signal } from './signal'
import { Memo } from './memo'
import { Wait } from './wait'

export type QueuePool<ID, Payload> = {
  getQueue: (id: ID) => QueueWithPayload<Payload, QueueWithSignal>,
  hasQueue: (id: ID) => boolean,
  pause(): void
  resume(): void
  addTask: AddTask<ID, Payload>,
  signal: {
    ALL_DONE: Signal,
    ERROR: Signal<{ id: ID, payload: Payload, error: unknown }>
  }
}

type AddTaskNonePayload<ID> = (id: ID, func: () => Promise<void>) => void
type AddTaskWithPayload<ID, Payload> = (id: ID, payload: Payload, func: () => Promise<void>) => void
type AddTask<ID, Payload> = [Payload] extends [void] ? AddTaskNonePayload<ID> : AddTaskWithPayload<ID, Payload>

export function QueuePool(): QueuePool<'You must be provide ID parameter', void>
export function QueuePool<ID>(): QueuePool<ID, void>
export function QueuePool<ID, Payload>(): QueuePool<ID, Payload>
export function QueuePool<ID, Payload>(): QueuePool<ID, Payload> {
  const [getPause, setPause] = Memo<Wait | null>(null)

  const pool = new Map<ID, QueueWithPayload<Payload, QueueWithSignal>>()

  const signal = {
    ALL_DONE: Signal(),
    ERROR: Signal<{ id: ID, payload: Payload, error: unknown }>(),
  }

  function createQueue(id: ID) {
    const q = WithPayload<Payload>(Queue(QueueSignal()))
    pool.set(id, q)
  }

  function getQueue(id: ID): QueueWithPayload<Payload, QueueWithSignal> {
    const q = pool.get(id)
    if (q !== undefined) {
      return q
    } else {
      createQueue(id)
      return getQueue(id)
    }
  }

  type TaskFunc = () => Promise<void>

  function addTask(i: ID, p: Payload, f: TaskFunc): void
  function addTask(i: ID, p: Payload | TaskFunc): void
  function addTask(
    id: ID,
    payload: Payload | TaskFunc,
    func?: TaskFunc,
  ) {
    if (typeof func !== 'function') {
      return addTask(id, undefined as Payload, payload as (() => Promise<void>))
    } else {
      const q = getQueue(id)
      q.task(payload as Payload, func)

      const cancelReceiveError = q.signal.ERROR.receive(({ task, error }) => {
        signal.ERROR.trigger({
          id,
          payload: q.getPayload(task),
          error,
        })
      })

      if (q.signal.ALL_DONE.isEmpty()) {
        const cancel = q.signal.ALL_DONE.receive(() => {
          cancelReceiveError()
          cancel()
          pool.delete(id)
          if (pool.size === 0) {
            signal.ALL_DONE.trigger()
          }
        })
      }
    }
  }

  return {
    addTask,
    pause: () => {
      const pause = Wait()
      setPause(pause)
      const [ waiting ] = pause
      for (const queue of pool.values()) {
        queue.setTasks([
          () => waiting,
          ...queue.getTasks()
        ])
      }
    },
    resume: () => {
      const pause = getPause()
      if (pause) {
        const [, resume] = pause
        setPause(null)
        resume()
      }
    },
    getQueue,
    hasQueue: (id: ID) => pool.has(id),
    signal,
  }
}
