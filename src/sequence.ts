import { Queue, runTask } from './queue'

export const Sequence = (
  q = Queue()
) => (
  <R>(taskFunc: () => Promise<R>): Promise<R> => runTask(q, taskFunc)
)
