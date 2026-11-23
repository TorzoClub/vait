import { Conveyor, ConveyorError, type ConveyorInstance } from './conveyor'

type ExecutorTask = () => Promise<unknown>

export type ExecutorOptions = Readonly<{
  concurrency?: number
  backlogs_limit?: number
  waiting_timeout?: number
  processing_timeout?: number
}>

export type Executor = (<R>(taskFunc: () => Promise<R>) => Promise<R>) & {
  setConcurrency(n: number): void
  destroy(): void
  get conveyor(): ConveyorInstance<ExecutorTask, unknown>
}

export function Executor(options: ExecutorOptions = {}): Executor {
  const {
    concurrency = 1,
    backlogs_limit = Infinity,
    waiting_timeout = -1,
    processing_timeout = -1,
  } = options

  const conveyor = Conveyor<ExecutorTask, unknown>(taskFunc => taskFunc())
  conveyor.setValve(concurrency)
  conveyor.setBacklogsLimit(backlogs_limit)
  conveyor.setWaitingTimeout(waiting_timeout)
  conveyor.setProcessingTimeout(processing_timeout)

  async function execute<R>(taskFunc: () => Promise<R>): Promise<R> {
    const result = await conveyor.send(taskFunc)

    if (result.scene === 'done') {
      return result.return_value as R
    } else if (result.scene === 'processor_failure') {
      throw result.error
    } else {
      throw new ConveyorError(
        'Internal',
        `Executor task ended with scene '${result.scene}'`,
        { cause: result },
      )
    }
  }

  return Object.assign(execute, {
    setConcurrency: conveyor.setValve,
    destroy: conveyor.destroy,
    conveyor,
  })
}
