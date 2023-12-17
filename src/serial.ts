import { Memo } from './memo'
import { nextTick } from './next-tick'

export function Serial() {
  const [ getProcessing, setProcessing ] = Memo<Promise<unknown> | null>(null)

  return async function serial<T>(
    task: () => Promise<T>,
  ): Promise<T> {
    const processing = getProcessing()
    if (processing !== null) {
      try {
        await processing
        return serial(task)
      } catch {
        await nextTick()
        return serial(task)
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
