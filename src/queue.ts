import { Memo, MemoGetter, MemoSetter } from './memo'
import { OutterPromise } from './outter-promise'
import { removeByItem } from './utils'
import { nextTick } from './next-tick'
import { Signal } from './signal'
import { concurrency } from './concurrency'

export class QueueError extends Error {}

type TaskFunction<R> = () => Promise<R>
type QueueTask = TaskFunction<void>

type AddTaskNonePayload = (taskFunc: QueueTask) => void
type AddTaskWithPayload<P> = (payload: P, taskFunc: QueueTask) => void

type QueueStatus = 'running' | 'pause'

type QueueSignal = {
  WILL_PROCESS: Signal<void>
  SUCCESS: Signal<QueueTask>
  ERROR: Signal<{ task: QueueTask, error: unknown }>
  PROCESSED: Signal<QueueTask>
  ALL_DONE: Signal<void>
}

export type Queue = {
  getStatus: MemoGetter<QueueStatus>
  getTasks: MemoGetter<QueueTask[]>
  setTasks: MemoSetter<QueueTask[]>
  dropTask: (taskFunc: QueueTask) => void
  setMaxConcurrent: MemoSetter<number>
  task: AddTaskNonePayload
  signal: undefined
}

export type QueueWithSignal = Omit<Queue, 'signal'> & {
  signal: QueueSignal
}

export type QueueWithPayload<P, Q extends (Queue | QueueWithSignal)> = Omit<Q, 'task'> & {
  getPayload: (taskFunc: TaskFunction<unknown>) => P
  task: AddTaskWithPayload<P>
  setPayload: (taskFunc: TaskFunction<unknown>, payload: P) => void
  payload_map: WeakMap<QueueTask, P>
}

export function WithPayload<P>(q: Queue): QueueWithPayload<P, Queue>
export function WithPayload<P>(q: QueueWithSignal): QueueWithPayload<P, QueueWithSignal>
export function WithPayload<
  P
>(q: Queue | QueueWithSignal) {
  const payload_map = new WeakMap<TaskFunction<unknown>, P>()

  function addTask(payload: P, taskFunc: QueueTask) {
    setPayload(taskFunc, payload)
    q.task(taskFunc)
  }

  function setPayload(taskFunc: TaskFunction<unknown>, payload: P) {
    payload_map.set(taskFunc, payload)
  }

  return {
    ...q,
    task: addTask,
    payload_map,
    setPayload,
    getPayload(taskFunc: TaskFunction<unknown>): P {
      if (!payload_map.has(taskFunc)) {
        throw new QueueError('getPayload failure: taskFunc not found')
      } else {
        return payload_map.get(taskFunc) as P
      }
    },
  }
}

export function QueueSignal(): QueueSignal {
  const signal = {
    WILL_PROCESS: Signal(),
    SUCCESS: Signal<QueueTask>(),
    ERROR: Signal<{ task: QueueTask, error: unknown }>(),
    PROCESSED: Signal<QueueTask>(),
    ALL_DONE: Signal(),
  }
  return signal
}

export function Queue(): Queue
export function Queue<S extends QueueSignal>(signal?: S): (
  [S] extends [void] ? Queue : QueueWithSignal
)
export function Queue<S extends void | QueueSignal>(signal?: S) {
  const TasksMemo = Memo<QueueTask[]>([])
  const [getTasks, setTasks] = TasksMemo
  const [getStatus, setStatus] = Memo<QueueStatus>('pause')
  const MaxConcurrency = concurrency.Number(1)
  const { memo: [, setMaxConcurrent] } = MaxConcurrency

  function dropTask(task: QueueTask) {
    setTasks(
      removeByItem(getTasks(), task)
    )
  }

  async function run() {
    if (getStatus() === 'pause') {
      setStatus('running')
      startProcessing()
    }
  }

  type QueueTaskIterator = Generator<QueueTask, void, unknown>
  function * QueueTaskIterator(): QueueTaskIterator {
    while (getTasks().length !== 0) {
      signal?.WILL_PROCESS.trigger()
      if (getTasks().length === 0) {
        return
      } else {
        const [currentTask] = getTasks()
        dropTask(currentTask)
        yield currentTask
      }
    }
  }

  function startProcessing() {
    return (
      nextTick().then(() => (
        concurrency(
          MaxConcurrency,
          QueueTaskIterator(),
          async task => {
            try {
              await task()
              signal?.SUCCESS.trigger(task)
            } catch (error) {
              signal?.ERROR.trigger({ task, error })
            } finally {
              signal?.PROCESSED.trigger(task)
            }
          }
        )
      )).then(() => {
        if (getTasks().length) {
          startProcessing()
        } else {
          setStatus('pause')
          signal?.ALL_DONE.trigger()
        }
      })
    )
  }

  function addTask(taskFunc: QueueTask) {
    setTasks(
      getTasks().concat(taskFunc)
    )
    run()
  }

  return {
    task: addTask,
    dropTask,
    getStatus,
    getTasks,
    setTasks,
    signal,
    setMaxConcurrent,
  } as (
    [S] extends [void] ? Queue : QueueWithSignal
  )
}

export function runTask<R>(
  queue: Queue | QueueWithSignal,
  taskFunc: TaskFunction<R>,
): Promise<R>
export function runTask<R, P>(
  queue: QueueWithPayload<P, Queue> | QueueWithPayload<P, QueueWithSignal>,
  payload: P,
  taskFunc: TaskFunction<R>,
): Promise<R>
export function runTask<
  R,
  P,
  Q extends Queue | QueueWithSignal,
  QP extends QueueWithPayload<P, Queue> | QueueWithPayload<P, QueueWithSignal>
>(
  queue: [P] extends void ? Q : QP,
  payload: P | TaskFunction<R>,
  taskFunc?: TaskFunction<R>,
): Promise<R> {
  const [resolve, reject, promise] = OutterPromise<R>()

  if (queue.setPayload !== undefined) {
    queue.setPayload(taskFunc as TaskFunction<R>, payload as P)
  }

  if (taskFunc) {
    queue.task(payload as P, () => (
      taskFunc().then(resolve).catch(reject)
    ))
  } else {
    (queue.task as AddTaskNonePayload)(() => (
      (payload as TaskFunction<R>)().then(resolve).catch(reject)
    ))
  }
  return promise
}
