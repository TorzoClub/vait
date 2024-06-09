import { Memo, MemoGetter, MemoSetter, MemoWithValidating } from './memo'
import { nextTick } from './next-tick'
import { OutterPromise } from './outter-promise'
import { Signal } from './signal'

type TaskFunction<R> = () => Promise<R>

type Payload<P> = P

type QueueTask<P> = {
  func: () => Promise<void>
  payload: Payload<P>
}

type AddTaskNonePayload = <R>(taskFunc: TaskFunction<R>) => Promise<R>
type AddTaskWithPayload<P> = <R>(payload: P, taskFunc: TaskFunction<R>) => Promise<R>
type AddTask<P> = AddTaskNonePayload & AddTaskWithPayload<P>

type QueueStatus = 'running' | 'pause'

type QueueSignals<P> = {
  ALL_DONE: Signal<void>
  WILL_PROCESSING: Signal<void>
  PROCESSING: Signal<QueueTask<P>>
}

export type Queue<P> = Readonly<{
  task: AddTask<P>
  getStatus: MemoGetter<QueueStatus>
  getTasks: MemoGetter<QueueTask<P>[]>
  setTasks: MemoSetter<QueueTask<P>[]>
  signals: QueueSignals<P>
  setMaxConcurrent: MemoSetter<number>
}>

function validateMaxConcurrent(v: number) {
  if (!Number.isInteger(v)) {
    return 'Max Concurrent should be Integer'
  } else if (v < 1) {
    return 'Max Concurrent should >= 1'
  }
}

export function Queue(init_max_concurrent?: number): Queue<void>
export function Queue<P>(init_max_concurrent?: number): Queue<P>
export function Queue<P>(init_max_concurrent = 1) {
  const [getTasks, setTasks] = Memo<QueueTask<P>[]>([])
  const [getStatus, setStatus] = Memo<QueueStatus>('pause')
  const [getMaxConcurrent, setMaxConcurrent] = MemoWithValidating<number>(
    init_max_concurrent,
    validateMaxConcurrent,
  )

  const signals = {
    PROCESSING: Signal<QueueTask<P>>(),
    WILL_PROCESSING: Signal(),
    ALL_DONE: Signal()
  }

  async function run() {
    if (getStatus() === 'running') {
      return
    }
    setStatus('running')

    await nextTick()

    let current_concurrent = 0
    callConcurrent()
    async function callConcurrent() {
      while (
        (getStatus() === 'running') &&
        (current_concurrent < getMaxConcurrent()) &&
        (getTasks().length > 0)
      ) {
        current_concurrent += 1
        processing().then(() => {
          current_concurrent -= 1
          callConcurrent()
        })
      }
    }
  }

  async function processing() {
    signals['WILL_PROCESSING'].trigger()

    const [current_task, ...remain_tasks] = getTasks()
    setTasks(remain_tasks)

    signals['PROCESSING'].trigger(current_task)

    await current_task.func()

    if (remain_tasks.length === 0) {
      setStatus('pause')
      signals['ALL_DONE'].trigger()
    }
  }

  function task<R>(payload: P, taskFunc: TaskFunction<R>): Promise<R>
  function task<R>(taskFunc: TaskFunction<R>): Promise<R>
  async function task<R>(payload: P | TaskFunction<R>, taskFunc?: TaskFunction<R>) {
    if (taskFunc) {
      const [resolve, reject, promise] = OutterPromise<R>()
      setTasks(
        getTasks().concat({
          payload: payload as P,
          func: () => (
            taskFunc().then(resolve).catch(reject)
          )
        })
      )
      run()
      return promise
    } else {
      return task(undefined as P, payload as TaskFunction<R>)
    }
  }

  return {
    task,
    getStatus,
    getTasks,
    setTasks,
    signals,
    setMaxConcurrent,
  } as const
}
