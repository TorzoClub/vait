import { AbortCause, Conveyor, ConveyorInstance, ConveyorSendResult } from "../conveyor"
import { Signal } from "../signal"

export function Traffic<Payload, R, Return = void>(
  router: (payload: Payload) => Generator<ConveyorInstance<Payload, R>, Return, ConveyorSendResult<R>>
): ConveyorInstance<Payload, Return> {
  return Conveyor<Payload, Return>(async (payload, o) => {
    // 内部再用 as 把它转成正确的类型
    const gen = router(payload) as Generator<
      ConveyorInstance<Payload, R>,
      Return,
      ConveyorSendResult<R>
    >

    let step = gen.next()

    while (!step.done) {
      const child = step.value
      const result = await sendToChild(child, payload, o.abort_signal)
      step = gen.next(result)
    }

    return step.value
  })
}

async function sendToChild<Payload, R>(
  child: ConveyorInstance<Payload, R>,
  payload: Payload,
  abort_signal: Signal<AbortCause>
): Promise<ConveyorSendResult<R>> {
  const child_promise = child.send(payload)
  const child_task_id = Conveyor.getTaskIDByPromise(child_promise)

  // overflow / 立即返回的结果没有 task id，直接返回
  if (child_task_id === undefined) {
    return await child_promise
  }

  // 把外层的 abort（destroy / outside / timeout）桥接到子任务
  const cancelAbortWatcher = Signal.once(abort_signal, () => {
    try {
      child.retireOne(child_task_id)
    } catch {
      // 子 Conveyor 可能已经销毁，忽略
    }
  })

  try {
    return await child_promise
  } finally {
    cancelAbortWatcher()
  }
}

const road_a = Conveyor(async (payload: 'asd' | 'abc') => {
  // ...
})

const road_b = Conveyor(async (payload: 'asd' | 'abc') => {
  // ...
})

const tra = Traffic(function *(payload: 'asd' | 'abc') {
  if (payload === 'asd') {
    const result = yield road_a
    // result: ConveyorSendResult<void>
    if (result.scene === 'done') {
      // 子任务成功
    }
  } else {
    const result = yield road_b
    result.scene
  }
})

// 外层默认并发是 1，如果希望路由本身并发，需要放开
tra.setValve(Infinity)

tra.send('asd').then(result => {
  if (result.scene === 'done') {
    // result.return_value 是 generator 的返回值（这里默认 void）
  }
})
