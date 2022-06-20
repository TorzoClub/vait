import { Memo } from './memo'
import { nextTick } from './next-tick'

export function Atomic() {
  const [ getProcessing, setProcessing ] = Memo<Promise<unknown> | null>(null)

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
        // eslint-disable-next-line no-unsafe-finally
        return new_processing
      }
    }
  }
}
