import { Queue } from './queue'

export function Sequence() {
  const q = Queue()
  return q.task
}
