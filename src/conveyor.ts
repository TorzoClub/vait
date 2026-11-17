import { Memo, WithValidating } from "./memo"
import { OuterPromise } from "./outer-promise"
import { Signal } from "./signal"
import { ConveyorTimer } from "./internal/conveyor-timer"
import { getWeakMapItem, ID, removeItem, weakMapItemIfExist } from "./internal/utils"

type TaskID = ID<Symbol, 'TaskID'>

export type AbortCause = 'destroy' | 'outside' | 'timeout'

export type ConveyorState =
  | 'idle'                // 空闲
  | 'paused'              // 暂停，即 Valve.get() === 0
  | 'working/controlled'  // 即 isWorking() === true 的情况
  | 'working/swamped'     // 即 isWorking() === true && isSwamped() === true 的情况
  | 'working/in_paused'   // 即 isWorking() === true && Valve.get() === 0
  | 'destroyed'           // 即 isDestroy() === true 的情况

export type RetireResult =
  | { scene: 'not_found' }
  | { scene: 'retired' }
  | { scene: 'in_processing' }

export type TaskStatus =
  | 'waiting'
  | 'processing'
  | 'failure'
  | 'done'
  | 'retired/in_processing'
  | 'retired/in_waiting'
  | 'timeout/in_waiting'
  | 'timeout/in_processing'
  | 'destroyed'

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'done',
  'failure',
  'retired/in_processing',
  'retired/in_waiting',
  'timeout/in_waiting',
  'timeout/in_processing',
  'destroyed',
])

export type ConveyorSendResult<ProcessorReturn> =
  | Readonly<{ scene: 'done', return_value: ProcessorReturn }>
  | Readonly<{ scene: 'overflow' }>
  | Readonly<{ scene: 'processor_failure', error: unknown }>
  | Readonly<{ scene: 'retired/in_waiting' }>
  | Readonly<{ scene: 'retired/in_processing' }>
  | Readonly<{ scene: 'timeout/in_waiting', elapsed_time: number }>
  | Readonly<{ scene: 'timeout/in_processing', elapsed_time: number }>
  | Readonly<{ scene: 'destroyed' }>

const __overflow_result: Readonly<{ scene: 'overflow' }> = Object.freeze({ scene: 'overflow' })

type ConveyorErrorSource = 'Processor' | 'Internal'

export class ConveyorError extends Error {
  source: ConveyorErrorSource
  constructor(source: ConveyorErrorSource, msg: string, opts: { cause?: unknown }) {
    super(msg, opts)
    this.source = source
  }
}

function isTerminalStatus(status: TaskStatus | undefined) {
  return status !== undefined && TERMINAL_STATUSES.has(status)
}

// Processor 函数签名
type Processor<Payload, ProcessorReturn> = (
  payload: Payload,
  o: {
    id: TaskID,
    abort_signal: Signal<AbortCause>,
  }
) => Promise<ProcessorReturn>

type ConveyorSignals<Payload> = {
  sig_processor_failure: Signal<{ task_id: TaskID, error: unknown }>
  sig_processor_will_process: Signal<TaskID>
  sig_processor_processed: Signal<TaskID>
  sig_send_before: Signal<Payload>
  sig_processor_done: Signal<TaskID>
}

const sym_hook_willProcess = Symbol('sym_hook_willProcess')

type Task<Payload> = {
  id: TaskID
  payload: Payload

  [sym_hook_willProcess]: () => void
}

export type ConveyorInstance<Payload, ProcessorReturn> = {
  setValve(n: number): void
  setBacklogsLimit(n: number): void
  setWaitingTimeout(n: number): void
  setProcessingTimeout(n: number): void

  getState(): ConveyorState

  send(payload: Payload): Promise<ConveyorSendResult<ProcessorReturn>>

  getBlacklogs(): Task<Payload>[]
  getProcessing(): Task<Payload>[]

  getTaskStatus(id: TaskID): TaskStatus
  retireOneIgnoreProcessing(id: Task<Payload>['id']): Exclude<RetireResult, { scene: 'in_processing' }>
  retireOne(id: Task<Payload>['id']): RetireResult

  destroy(): void

  signals: ConveyorSignals<Payload>
}

type Valve = {
  get(): number;
  set(v: number): void
  memo: Memo<number>
}

const Valve = (v: number): Valve => {
  const memo = WithValidating(Memo(v), v => {
    if (v !== Infinity && !Number.isInteger(v)) {
      throw new TypeError('concurrent_limit should be integer or Infinity')
    } else if (v < 0) {
      throw new RangeError('concurrent_limit should >= 0')
    }
  })

  return {
    get: Memo.getGetter(memo),
    set: Memo.getSetter(memo),
    memo,
  }
}

function allocTaskID(): TaskID {
  return Symbol('Conveyor Task ID') as unknown as TaskID
}

function Guard(
  failWhen: () => boolean
) {
  return (guardFn: () => never) =>
    <A extends unknown[], T>(fn: (...args: A) => T) =>
      (...args: A) => (
        failWhen() ? guardFn() : fn(...args)
      )
}

const conveyor_defaults = {
  valve: 1,
  blacklogs_limit: Infinity,
  waiting_time: -1,
  processing_time: -1,
} as const

function assertBacklogsLimit(v: number) {
  if (v !== Infinity && !Number.isInteger(v)) {
    throw new TypeError('blacklogs_limit should be integer or Infinity')
  }
  if (v < 0) {
    throw new RangeError('blacklogs_limit should >= 0')
  }
}

const __promise_pool = new WeakMap<Promise<any>, TaskID>()
function getTaskIDByPromise(p: Promise<any>) {
  return __promise_pool.get(p)
}
function setTaskIDByPromise(promise: Promise<any>, task_id: TaskID) {
  __promise_pool.set(promise, task_id)
}
Conveyor.getTaskIDByPromise = getTaskIDByPromise

export function Conveyor<Payload, ProcessorReturn>(
  processor: Processor<Payload, ProcessorReturn>
): ConveyorInstance<Payload, ProcessorReturn> {
  const destroyMemo = Memo(false)
  const sig_destroyed = Signal()
  Memo.watch(destroyMemo, d => {
    if (d) { sig_destroyed.trigger() }
  })
  const [isDestroy, setDestroy] = destroyMemo as [ () => boolean, (b: true) => void ]
  const WithDestroy = Guard(isDestroy)(() => {
    throw new ConveyorError('Internal', 'This Conveyor is Destored', {})
  })

  const signals: ConveyorSignals<Payload> = {
    sig_processor_failure: Signal<{ task_id: TaskID, error: unknown }>(),
    sig_processor_will_process: Signal<TaskID>(),
    sig_processor_processed: Signal<TaskID>(),
    sig_send_before: Signal<Payload>(),
    sig_processor_done: Signal<TaskID>(),
  }

  const waitingTimer = ConveyorTimer<TaskID>()
  const processingTimer = ConveyorTimer<TaskID>()

  const valve = Valve(conveyor_defaults.valve)
  const [getBlacklogsLimit, setBlacklogsLimit] = Memo(conveyor_defaults.blacklogs_limit)
  const blacklogsMemo = Memo<Task<Payload>[]>([])
  const [getBlacklogs, setBlacklogs] = blacklogsMemo

  const task_done_pool = new WeakMap<TaskID, Signal<ConveyorSendResult<ProcessorReturn>>>()
  function triggerDoneSignal(task_id: TaskID, result: ConveyorSendResult<ProcessorReturn>) {
    weakMapItemIfExist(task_done_pool, task_id, done_signal => {
      done_signal.trigger(result)
    })
  }

  const task_status_pool = new WeakMap<TaskID, TaskStatus>()
  function taskIsProcessing(task_id: TaskID) {
    return 'processing' === task_status_pool.get(task_id)
  }
  function setTaskStatus(task_id: TaskID, status: TaskStatus): TaskStatus {
    const current_status = task_status_pool.get(task_id)
    if (isTerminalStatus(current_status)) {
      return current_status as TaskStatus
    } else {
      task_status_pool.set(task_id, status)
      return status
    }
  }

  const task_abort_pool = new WeakMap<TaskID, Signal<AbortCause>>()
  function getAbortSignal(task_id: TaskID) {
    return getWeakMapItem(task_abort_pool, task_id, () => Signal<AbortCause>())
  }

  const processing_slots = new Set<Task<Payload>>()

  function getProcessing(): Task<Payload>[] {
    return [...processing_slots]
  }

  function startProcessing() {
    if (isDestroy()) { return }

    const concurrency = valve.get()
    const tasks = getBlacklogs()

    if (tasks.length === 0) { return }

    if (!(processing_slots.size < concurrency)) { return }

    const can_start_count = Math.min(
      concurrency - processing_slots.size,
      tasks.length
    )

    if (!(can_start_count > 0)) { return }

    const will_process_tasks = tasks.slice(0, can_start_count)
    setBlacklogs(tasks.slice(can_start_count))

    // 先占槽位，避免 processor 同步触发 startProcessing 时超发
    for (const task of will_process_tasks) {
      processing_slots.add(task)
    }

    for (const task of will_process_tasks) {
      const abort_signal = getAbortSignal(task.id)

      waitingTimer.stop(task.id)
      setTaskStatus(task.id, 'processing')

      const cancelDestroyedWatcher = Signal.once(sig_destroyed, () => {
        abort_signal.trigger('destroy')
        waitingTimer.stop(task.id)
        processingTimer.stop(task.id)
        setTaskStatus(task.id, 'destroyed')
        triggerDoneSignal(task.id, {
          scene: 'destroyed'
        })
      })

      const [isProcessingTimeout, setProcessingTimeout] = Memo(false)

      processingTimer.mount(task.id, (elapsed_time) => {
        if (!isTerminalStatus(task_status_pool.get(task.id))) {
          setProcessingTimeout(true)

          cancelDestroyedWatcher()

          abort_signal.trigger('timeout')

          processing_slots.delete(task)
          setTaskStatus(task.id, 'timeout/in_processing')

          triggerDoneSignal(task.id, { scene: 'timeout/in_processing', elapsed_time })

          startProcessing()
        }
      })

      task[sym_hook_willProcess]()

      signals.sig_processor_will_process.trigger(task.id)

      let promiseMiddle: Promise<ProcessorReturn>
      try {
        promiseMiddle = Promise.resolve(
          processor(task.payload, { id: task.id, abort_signal })
        )
      } catch (error) {
        promiseMiddle = Promise.reject(error)
      }

      promiseMiddle.then(return_value => {
        if (taskIsProcessing(task.id)) {
          setTaskStatus(task.id, 'done')
          triggerDoneSignal(task.id, {
            scene: 'done',
            return_value
          })
          signals.sig_processor_done.trigger(task.id)
        }
      }).catch(error => {
        if (taskIsProcessing(task.id)) {
          setTaskStatus(task.id, 'failure')
          triggerDoneSignal(task.id, {
            scene: 'processor_failure',
            error
          })
          signals.sig_processor_failure.trigger({
            task_id: task.id,
            error,
          })
        }
      }).finally(() => {
        if (!isProcessingTimeout()) {
          processingTimer.stop(task.id)
          cancelDestroyedWatcher()
          processing_slots.delete(task)
          signals.sig_processor_processed.trigger(task.id)
          startProcessing()
        }
      })
    }
  }

  function getDoneSignal(task_id: TaskID) {
    return getWeakMapItem(task_done_pool, task_id, () => Signal<ConveyorSendResult<ProcessorReturn>>())
  }

  function isWorking() {
    return processing_slots.size > 0
  }

  function isSwamped() {
    return getBlacklogs().length >= getBlacklogsLimit()
  }

  function getState(): ConveyorState {
    if (isDestroy()) {
      return 'destroyed'
    } else {
      const is_working = isWorking()
      if (valve.get() === 0) {
        return is_working ? 'working/in_paused' : 'paused'
      } else if (is_working) {
        return isSwamped() ? 'working/swamped' : 'working/controlled'
      } else {
        return 'idle'
      }
    }
  }

  const __internalSend = WithDestroy((payload: Payload) => {
    signals.sig_send_before.trigger(payload)
    if (isSwamped()) {
      return Promise.resolve(__overflow_result)
    } else {
      let $_cancelDestroyedWatcherInSend: () => void = () => {}

      const task = {
        id: allocTaskID(),
        payload,
        [sym_hook_willProcess]() {
          $_cancelDestroyedWatcherInSend()
        }
      }

      const done_signal = getDoneSignal(task.id)

      const [resolve, reject, promise] = OuterPromise<ConveyorSendResult<ProcessorReturn>>()

      setBlacklogs([...getBlacklogs(), task])

      const cancelDoneWatcher = Signal.once(done_signal, (r) => {
        waitingTimer.stop(task.id)
        $_cancelDestroyedWatcherInSend()
        resolve(r)
      })
      $_cancelDestroyedWatcherInSend = Signal.once(sig_destroyed, () => {
        cancelDoneWatcher()
        waitingTimer.stop(task.id)
        setTaskStatus(task.id, 'destroyed')
        reject(
          new ConveyorError(
            'Internal',
            `当前 Conveyor 已经销毁.该任务(task_id=${String(task.id)})将无法处理`,
            { cause: { task_id: task.id, payload } }
          )
        )
      })

      setTaskStatus(task.id, 'waiting')

      setTaskIDByPromise(promise, task.id)

      waitingTimer.mount(task.id, (elapsed_time) => {
        if (!isTerminalStatus(task_status_pool.get(task.id))) {
          const rm_result = removeBlacklogTask(task.id)
          if (rm_result === 'removed') {
            cancelDoneWatcher()
            $_cancelDestroyedWatcherInSend()
            setTaskStatus(task.id, 'timeout/in_waiting')
            resolve({ scene: 'timeout/in_waiting', elapsed_time })
          }
        }
      })

      startProcessing()

      return promise
    }
  })

  function removeBlacklogTask(will_remove_task_id: TaskID): 'not_found' | 'removed' {
    const [removed_idx, removed_blacklogs] = removeItem(
      getBlacklogs(),
      task => will_remove_task_id === task.id
    )
    if (removed_idx === -1) {
      return 'not_found'
    } else {
      setBlacklogs(removed_blacklogs)
      return 'removed'
    }
  }

  function retireOneWithoutProcessing(will_remove_task_id: TaskID): Exclude<RetireResult, { scene: 'in_processing' }> {
    const rm_result = removeBlacklogTask(will_remove_task_id)
    if (rm_result === 'not_found') {
      return { scene: 'not_found' }
    } else {
      waitingTimer.stop(will_remove_task_id)
      setTaskStatus(will_remove_task_id, 'retired/in_waiting')
      triggerDoneSignal(will_remove_task_id, { scene: 'retired/in_waiting' })
      return { scene: 'retired' }
    }
  }

  function destroyConveyor() {
    if (isDestroy()) { return }

    for (const task of getBlacklogs()) {
      waitingTimer.stop(task.id)
      setTaskStatus(task.id, 'destroyed')
    }

    waitingTimer.clear()
    processingTimer.clear()
    processing_slots.clear()

    setBlacklogs([])
    setDestroy(true)
  }

  return {
    signals,

    setValve: WithDestroy(n => {
      valve.set(n)
      startProcessing()
    }),
    setBacklogsLimit: WithDestroy(n => {
      assertBacklogsLimit(n)
      setBlacklogsLimit(n)
    }),
    setWaitingTimeout: WithDestroy(waitingTimer.setTimeout),
    setProcessingTimeout: WithDestroy(processingTimer.setTimeout),
    getBlacklogs: WithDestroy(getBlacklogs),
    getProcessing: WithDestroy(getProcessing),
    getState,
    getTaskStatus(task_id) {
      // getTaskStatus 不能被 WithDestroy 包装
      // 因为预期会有 destroyed 的 TaskStatus
      const task_status = task_status_pool.get(task_id)
      if (task_status === undefined) {
        throw new ConveyorError('Internal', `Task(task_id=${String(task_id)}) not found`, {
          cause: { task_id }
        })
      } else {
        return task_status
      }
    },
    retireOneIgnoreProcessing: WithDestroy(retireOneWithoutProcessing),
    retireOne: WithDestroy(will_remove_task_id => {
      const result = retireOneWithoutProcessing(will_remove_task_id)
      if ((result.scene === 'not_found') && taskIsProcessing(will_remove_task_id)) {
        waitingTimer.stop(will_remove_task_id)
        processingTimer.stop(will_remove_task_id)
        setTaskStatus(will_remove_task_id, 'retired/in_processing')
        getAbortSignal(will_remove_task_id).trigger('outside')
        triggerDoneSignal(will_remove_task_id, { scene: 'retired/in_processing' })
        return { scene: 'in_processing' }
      } else {
        return result
      }
    }),
    destroy: destroyConveyor,
    send(payload) {
      try {
        return __internalSend(payload)
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
