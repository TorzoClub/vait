import { Memo, MemoGetter, MemoSetter, ValidatingMemo } from './memo'
import { Signal, removeByItem } from './signal'
import { OutterPromise } from './outter-promise'
import { nextTick } from './next-tick'

type TaskFunction<R> = () => Promise<R>
type QueueTask = TaskFunction<void>

type AddTaskNonePayload = (taskFunc: QueueTask) => void
type AddTaskWithPayload<P> = (payload: P, taskFunc: QueueTask) => void

type QueueStatus = 'running' | 'pause'

type QueueSignal = {
  ALL_DONE: Signal<void>
  WILL_PROCESSING: Signal<void>
  PROCESSING: Signal<QueueTask>
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
        throw new Error('getPayload failure: taskFunc not found')
      } else {
        return payload_map.get(taskFunc) as P
      }
    },
  }
}

function validateMaxConcurrent(v: number) {
  if (!Number.isInteger(v)) {
    return 'Max Concurrent should be Integer'
  } else if (v < 1) {
    return 'Max Concurrent should >= 1'
  }
}

export function QueueSignal(): QueueSignal {
  const signal = {
    PROCESSING: Signal<QueueTask>(),
    WILL_PROCESSING: Signal(),
    ALL_DONE: Signal(),
  }
  return signal
}


export function Queue(): Queue
export function Queue<S extends QueueSignal>(signal?: S): (
  [S] extends [void] ? Queue : QueueWithSignal
)
export function Queue<S extends void | QueueSignal>(signal?: S) {
  const [getTasks, setTasks] = Memo<QueueTask[]>([])
  const [getStatus, setStatus] = Memo<QueueStatus>('pause')
  const [getMaxConcurrent, setMaxConcurrent] = ValidatingMemo<number>(
    Memo(1),
    validateMaxConcurrent,
  )

  function dropTask(task: QueueTask) {
    setTasks(
      removeByItem(getTasks(), task)
    )
  }

  async function run() {
    if (getStatus() === 'pause') {
      setStatus('running')
      running()
    }
  }

  async function running() {
    let current_concurrent = 0
    await nextTick()

    function after() {
      if (getStatus() === 'running') {
        if (
          (getTasks().length === 0) &&
          (current_concurrent === 1)
        ) {
          setStatus('pause')
          signal?.ALL_DONE.trigger()
        } else {
          current_concurrent -= 1
          callConcurrent()
        }
      }
    }

    callConcurrent()
    function callConcurrent() {
      while (
        (current_concurrent < getMaxConcurrent()) &&
        (getTasks().length > 0)
      ) {
        signal?.WILL_PROCESSING.trigger()

        if (getTasks().length === 0) {
          after()
        } else {
          const [ taskFunc ] = getTasks()
          dropTask( taskFunc )

          current_concurrent += 1

          taskFunc().then(after).catch(after)
          signal?.PROCESSING.trigger(taskFunc)
        }
      }
    }
  }

  function addTask(taskFunc: QueueTask) {
    setTasks(
      getTasks().concat(taskFunc)
    )
    run()
  }

  const queue = {
    task: addTask,
    dropTask,
    getStatus,
    getTasks,
    setTasks,
    signal,
    setMaxConcurrent,
  }
  return queue as (
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
