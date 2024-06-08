import { Queue } from './queue'

export function Concurrent(init_max_concurrent: number) {
  const q = Queue(init_max_concurrent)
  return Object.assign(q.task, {
    setMaxConcurrent: q.setMaxConcurrent
  })
}
