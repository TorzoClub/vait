import { ExecuteHandlers, Handler, Handlers } from '../signal'
import { removeByItem } from '../utils'

interface Event<EventSetting> {
  isEmpty(evname: keyof EventSetting): boolean

  emit<E extends keyof EventSetting>(
      evname: E,
      payload: EventSetting[E]
  ): void

  cancelReceive<E extends keyof EventSetting>(
      evname: E,
      handler: Handler<EventSetting[E]>
  ): void

  on<E extends keyof EventSetting>(
      evname: E,
      handler: Handler<EventSetting[E]>
  ): void
}

export function Event(): never
export function Event<EventSetting>(): Event<EventSetting>
export function Event<EventSetting>(): Event<EventSetting> {
  type EventNames = keyof EventSetting
  type Payloads = EventSetting[EventNames]

  const pool = new Map<EventNames, Handler<Payloads>[]>()

  function getHandlers<E extends EventNames, P extends EventSetting[E]>(
    evname: EventNames
  ): Handlers<P> {
    const handlers = pool.get(evname)
    if (!Array.isArray(handlers)) {
      pool.set(evname, [])
      return getHandlers(evname)
    } else {
      return handlers
    }
  }

  function setHandlers<E extends EventNames, P extends EventSetting[E]>(
    evname: E, handlers: Handler<P>[]
  ) {
    pool.set(evname, handlers as Handler<Payloads>[])
  }

  function cancelReceive<E extends EventNames, P extends EventSetting[E]>(
    evname: E, handler: Handler<P>
  ) {
    setHandlers(evname, removeByItem(getHandlers(evname), handler))
  }

  return {
    isEmpty: (evname: EventNames) => (getHandlers(evname).length === 0),
    emit<E extends EventNames, P extends EventSetting[E]>(evname: E, payload: P) {
      ExecuteHandlers(true, () => getHandlers(evname))(payload)
    },
    cancelReceive,
    on<E extends EventNames, P extends EventSetting[E]>(evname: E, fn: Handler<P>) {
      setHandlers(evname, [...getHandlers(evname), fn])
      return () => cancelReceive(evname, fn)
    },
  } as const
}

const ev = Event<{
  hello: 9 | 8 | 7
  [s: symbol]: 2
}>()
ev.on('hello', num => {
  num
})
ev.on(Symbol(), () => {})
ev.emit('hello', 9)
