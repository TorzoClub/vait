import { createMemo } from './create-memo'
import { nextTick } from './next-tick'

export function Atomic() {
  const [ getProcessing, setProcessing ] = createMemo<Promise<unknown> | null>(null)

  return async function atomic<T>(
    task: () => Promise<T>,
  ): Promise<T> {
    const processing = getProcessing()
    if (processing !== null) {
      try {
        await processing
        return atomic(task)
      } catch {
        await nextTick()
        return atomic(task)
      }
    } else {
      const new_processing = task()
      setProcessing(new_processing)
      
      try {
        await new_processing
      } finally {
        setProcessing(null)
        return new_processing
      }
    }
  }
}
