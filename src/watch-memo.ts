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

export const WatchMemo = <D>(init_data: D): WatchMemo<D> => {
  const [ canChange, setChangeState ] = Memo(true)
  const [ get, set ] = Memo(init_data)
  const changed_signal = Signal<D>()

  return [
    get,
    function change(new_data: D) {
      if (canChange()) {
        setChangeState(false)
        set(new_data)
        changed_signal.trigger(new_data)
      } else {
        throw new WatchMemoError('cannot set memo in watcher')
      }
    },
    function SetWatcher(cb) {
      changed_signal.receive(cb)
      return (
        function RemoveWatcher() {
          changed_signal.unReceive(cb)
        }
      )
    }
  ]
}
