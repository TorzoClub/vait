import { Memo } from './memo'
import { Signal } from './signal'

export interface MemoWatcherCallback<D> {
  (changed_data: Readonly<D>): void
}

export interface RemoveMemoWatcher {
  (): void
}

export interface SetMemoWatcher<D> {
  (cb: MemoWatcherCallback<D>): RemoveMemoWatcher
}

export type WatchMemo<D> = Readonly<[...Memo<D>, SetMemoWatcher<D>]>

export class WatchMemoError extends Error {}

export const WatchMemo = <D>(
  [ get, set ]: Memo<D>
): WatchMemo<D> => {
  const [ canChange, setChangeState ] = Memo(true)
  const changed_signal = Signal<D>()
  return [
    get,
    function change(new_data: D) {
      try {
        if (canChange()) {
          setChangeState(false)
          set(new_data)
          changed_signal.trigger(new_data)
        } else {
          throw new WatchMemoError('cannot change memo in watcher')
        }
      } finally {
        setChangeState(true)
      }
    },
    changed_signal.receive
  ]
}
