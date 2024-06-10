import { Queue } from './queue'
import { Sequence } from './sequence'

export function Concurrent(init_max_concurrent: number) {
  const q = Queue()
  q.setMaxConcurrent(init_max_concurrent)
  const runTask = Sequence(q)
  return Object.assign(runTask, {
    setMaxConcurrent: q.setMaxConcurrent
  })
}
