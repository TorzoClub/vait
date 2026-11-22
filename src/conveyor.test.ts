import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { Conveyor, ConveyorError, ConveyorInstance, type AbortCause, type ConveyorSendResult } from './conveyor' // 请替换为你的实际导出路径
import { timeout } from './timeout'

// 每次测试前开启假定时器
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// 辅助函数：用于模拟异步操作
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ============================================================================
// 1. 基础流程与信号测试
// ============================================================================

test('基础发送与成功流程，并触发所有基础 Signal', async () => {
  const sigSendBefore = vi.fn()
  const sigWillProcess = vi.fn()
  const sigDone = vi.fn()
  const sigProcessed = vi.fn()

  const con = Conveyor<string, string>(async (payload) => {
    await sleep(100) // 模拟耗时操作
    return `processed-${payload}`
  })

  con.signals.sig_send_before.receive(sigSendBefore)
  con.signals.sig_processor_will_process.receive(sigWillProcess)
  con.signals.sig_processor_done.receive(sigDone)
  con.signals.sig_processor_processed.receive(sigProcessed)

  const sendPromise = con.send('A')

  expect(sigSendBefore).toHaveBeenCalledWith('A')

  // 推进时间，让 processor 执行完毕
  await vi.advanceTimersByTimeAsync(100)

  const result = await sendPromise

  expect(result).toEqual({ scene: 'done', return_value: 'processed-A' })
  expect(sigWillProcess).toHaveBeenCalledTimes(1)
  expect(sigDone).toHaveBeenCalledTimes(1)
  expect(sigProcessed).toHaveBeenCalledTimes(1)
})

// ============================================================================
// 2. 并发控制 (Valve) 与 背压 (Backlog)
// ============================================================================

test('并发控制：setValve 限制同时执行的任务数量', async () => {
  let activeCount = 0
  let maxActive = 0

  const con = Conveyor(async () => {
    activeCount++
    maxActive = Math.max(maxActive, activeCount)
    await sleep(100)
    activeCount--
  })

  con.setValve(2) // 最大并发 2

  // 瞬间塞入 4 个任务
  const p1 = con.send(1)
  const p2 = con.send(2)
  const p3 = con.send(3)
  const p4 = con.send(4)

  await vi.advanceTimersByTimeAsync(200)
  await Promise.all([p1, p2, p3, p4])

  expect(maxActive).toBe(2) // 峰值并发绝对不能超过 2
})

test('setValve(Infinity) 表示不限制并发', async () => {
  let active = 0
  let maxActive = 0

  const con = Conveyor(async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await sleep(100)
    active -= 1
  })

  con.setValve(Infinity)

  const promises = [1, 2, 3, 4, 5].map(n => con.send(n))
  await vi.advanceTimersByTimeAsync(10)
  expect(maxActive).toBe(5)

  await vi.advanceTimersByTimeAsync(100)
  const results = await Promise.all(promises)
  expect(results.every(result => result.scene === 'done')).toBe(true)
})

test('背压控制：setBacklogsLimit 超过阈值直接返回 overflow', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  con.setValve(1)
  con.setBacklogsLimit(1) // 只能排队 1 个

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中 (长度 1)
  const p3 = con.send(3) // 触发 overflow

  expect(await p3).toEqual({ scene: 'overflow' })

  await vi.advanceTimersByTimeAsync(200)
  await Promise.all([p1, p2])
})

test('setBacklogsLimit(Infinity) 允许无限积压', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  con.setValve(0)
  con.setBacklogsLimit(Infinity)

  const promises = Array.from({ length: 100 }, (_, i) => con.send(i))
  expect(con.getBacklogs()).toHaveLength(100)

  con.destroy()
  const results = await Promise.all(promises)
  expect(results.every(result => result.scene === 'destroyed/in_waiting')).toBe(true)
})

test('setBacklogsLimit 参数校验', () => {
  const con = Conveyor(async () => {})

  expect(() => con.setBacklogsLimit(-1)).toThrow(RangeError)
  expect(() => con.setBacklogsLimit(-1)).toThrow('backlogs_limit should >= 0')
  expect(() => con.setBacklogsLimit(1.5)).toThrow(TypeError)
  expect(() => con.setBacklogsLimit(1.5)).toThrow('backlogs_limit should be integer or Infinity')
  expect(() => con.setBacklogsLimit(NaN)).toThrow(TypeError)
  expect(() => con.setBacklogsLimit(Infinity)).not.toThrow()
})

// ============================================================================
// 3. 超时机制 (Waiting & Processing) - 重点适配了 timeout=0 的逻辑
// ============================================================================

test('默认无超时限制：默认值为 -1，不显式 set 时任务永远不会因为超时被干掉', async () => {
  const con = Conveyor(async () => { await sleep(5000) }) // 耗时 5 秒

  con.setValve(1)
  // 注意：我们不调用 setWaitingTimeout 和 setProcessingTimeout

  const p1 = con.send(1)
  const p2 = con.send(2) // 排队中，理论上需要等 5 秒

  // 快进 10 秒，p2 依然在排队，绝对不应该超时
  await vi.advanceTimersByTimeAsync(10000)

  // p1 此时已经执行完了，p2 也执行完了
  const result1 = await p1
  const result2 = await p2

  expect(result1.scene).toBe('done')
  expect(result2.scene).toBe('done')
})

test('等待超时：setWaitingTimeout 显式设置后，排队的任务超时', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  con.setValve(1)
  con.setWaitingTimeout(50) // 激活排队超时

  const p1 = con.send(1) // 会占据 100ms
  const p2 = con.send(2) // 排队，会在 50ms 时超时

  // 快进 50ms，此时 p2 应该触发等待超时
  await vi.advanceTimersByTimeAsync(50)

  const result2 = await p2
  expect(result2).toEqual({ scene: 'timeout/in_waiting', elapsed_time: 50 })

  // 再快进 50ms 让 p1 完成
  await vi.advanceTimersByTimeAsync(50)
  await p1
})

test('处理超时：setProcessingTimeout 显式设置后，执行超时并触发中断', async () => {
  const abortFn = vi.fn()

  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(100) // 故意耗时太久
  })

  con.setProcessingTimeout(30) // 激活执行超时

  const p = con.send(1)

  // 快进 30ms，触发执行超时
  await vi.advanceTimersByTimeAsync(30)

  const result = await p
  expect(result).toEqual({ scene: 'timeout/in_processing', elapsed_time: 30 })
  expect(abortFn).toHaveBeenCalledWith('timeout')

  // 确保底层的 processor 之后跑完也不会影响状态
  await vi.advanceTimersByTimeAsync(100)
})

test('超时动态调整：可以在任务执行中动态修改超时时间', async () => {
  const abortFn = vi.fn()

  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(1000)
  })

  con.setProcessingTimeout(500) // 初始 500ms

  const p = con.send(1)

  // 走了 200ms
  await vi.advanceTimersByTimeAsync(200)
  expect(abortFn).not.toHaveBeenCalled()

  // 动态把超时缩短到 100ms（已经过了 200ms，所以应该立刻触发超时）
  con.setProcessingTimeout(100)

  // 推进 1ms 让微任务执行
  await vi.advanceTimersByTimeAsync(1)

  const result = await p
  expect(result.scene).toBe('timeout/in_processing')
  expect(abortFn).toHaveBeenCalledWith('timeout')

  // 确保底层跑完
  await vi.advanceTimersByTimeAsync(1000)
})

test('处理超时只结算一次：超时后再调整超时不会重复扣减并发', async () => {
  const abortFn = vi.fn()
  const started: number[] = []
  let active = 0
  let maxActive = 0

  const con = Conveyor(async (payload: number, { abort_signal }) => {
    abort_signal.receive(abortFn)
    started.push(payload)
    active += 1
    maxActive = Math.max(maxActive, active)
    await sleep(1000)
    active -= 1
  })

  con.setValve(1)
  con.setProcessingTimeout(100)

  const p1 = con.send(1)
  await vi.advanceTimersByTimeAsync(100)

  expect(await p1).toEqual({ scene: 'timeout/in_processing', elapsed_time: 100 })
  expect(abortFn).toHaveBeenCalledTimes(1)

  // 任务已经超时，但 processor 还没结束；此时再调小超时不应二次触发超时回调
  con.setProcessingTimeout(50)
  await vi.advanceTimersByTimeAsync(1)
  expect(abortFn).toHaveBeenCalledTimes(1)

  // 阀门为 1，且此前只超时了 1 个任务，因此只应再启动 1 个任务
  con.send(2)
  con.send(3)
  await vi.advanceTimersByTimeAsync(10)

  expect(started).toEqual([1, 2])
  expect(maxActive).toBe(2)

  // 收尾：让 processor 全部结束
  await vi.advanceTimersByTimeAsync(3000)
})

test('处理超时 0 表示 0ms', async () => {
  const abortFn = vi.fn()
  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(1000)
  })

  con.setProcessingTimeout(0)
  const p = con.send(1)

  await vi.advanceTimersByTimeAsync(1)

  const result = await p
  expect(result.scene).toBe('timeout/in_processing')
  expect(abortFn).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(1000)
})

test('等待超时 0 表示 0ms', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  con.setWaitingTimeout(0)
  await vi.advanceTimersByTimeAsync(1)

  const r2 = await p2
  expect(r2.scene).toBe('timeout/in_waiting')

  await vi.advanceTimersByTimeAsync(100)
  expect((await p1).scene).toBe('done')
})

test('处理超时 -1 会取消已运行的定时器', async () => {
  const abortFn = vi.fn()
  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(100)
  })

  con.setProcessingTimeout(50)
  const p = con.send(1)

  await vi.advanceTimersByTimeAsync(20)
  con.setProcessingTimeout(-1)
  await vi.advanceTimersByTimeAsync(200)

  expect(await p).toEqual({ scene: 'done', return_value: undefined })
  expect(abortFn).not.toHaveBeenCalled()
})

test('等待超时 -1 会取消已运行的定时器', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)
  con.setWaitingTimeout(50)

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  await vi.advanceTimersByTimeAsync(10)
  con.setWaitingTimeout(-1)
  await vi.advanceTimersByTimeAsync(200)

  expect(await p2).toEqual({ scene: 'done', return_value: undefined })
  await p1
})

test('超时从 -1 改为正数后，为已存在任务补建 Timer 并从启用时刻计时', async () => {
  const con = Conveyor(async () => { await sleep(500) })

  con.setProcessingTimeout(-1)
  const p = con.send(1)

  await vi.advanceTimersByTimeAsync(100)
  con.setProcessingTimeout(200)
  await vi.advanceTimersByTimeAsync(200)

  expect(await p).toEqual({ scene: 'timeout/in_processing', elapsed_time: 200 })

  await vi.advanceTimersByTimeAsync(500)
})

test('等待超时从 -1 改为正数后，为排队任务补建 Timer', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)
  con.setWaitingTimeout(-1)

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  await vi.advanceTimersByTimeAsync(10)
  con.setWaitingTimeout(50)
  await vi.advanceTimersByTimeAsync(50)

  expect(await p2).toEqual({ scene: 'timeout/in_waiting', elapsed_time: 50 })

  await vi.advanceTimersByTimeAsync(100)
  await p1
})

test('超时参数校验：安全整数且 >= -1', async () => {
  const con = Conveyor(async () => { await sleep(500) })

  for (const v of [1.5, -1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => con.setWaitingTimeout(v)).toThrow(TypeError)
    expect(() => con.setProcessingTimeout(v)).toThrow(TypeError)
  }

  expect(() => con.setWaitingTimeout(-2)).toThrow(RangeError)
  expect(() => con.setProcessingTimeout(-2)).toThrow(RangeError)
  expect(() => con.setWaitingTimeout(-1)).not.toThrow()
  expect(() => con.setWaitingTimeout(0)).not.toThrow()
  expect(() => con.setProcessingTimeout(-1)).not.toThrow()
  expect(() => con.setProcessingTimeout(0)).not.toThrow()

  // 非法值不改变旧配置
  con.setProcessingTimeout(100)
  expect(() => con.setProcessingTimeout(1.5)).toThrow(TypeError)

  const p = con.send(1)
  const id = Conveyor.getTaskIDByPromise(p)!
  await vi.advanceTimersByTimeAsync(20)
  expect(con.getTaskStatus(id)).toBe('processing')

  await vi.advanceTimersByTimeAsync(80)
  expect((await p).scene).toBe('timeout/in_processing')

  await vi.advanceTimersByTimeAsync(500)
})

// ============================================================================
// 4. 生命周期与状态管理 (Retire & Destroy)
// ============================================================================

test('retireOne：从队列中精准退役任务', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  const taskId2 = Conveyor.getTaskIDByPromise(p2)

  expect(con.getTaskStatus(taskId2!)).toBe('waiting')

  const retireResult = con.retireOne(taskId2!)
  expect(retireResult).toEqual({ scene: 'retired' })

  const result2 = await p2
  expect(result2).toEqual({ scene: 'retired/in_waiting' })
  expect(con.getTaskStatus(taskId2!)).toBe('retired/in_waiting')

  await vi.advanceTimersByTimeAsync(100)
  await p1
})

test('retireOne：退役正在执行的任务，触发 outside 中断', async () => {
  const abortFn = vi.fn()
  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(100)
  })

  const p = con.send(1)
  await vi.advanceTimersByTimeAsync(10) // 让它开始执行

  const taskId = Conveyor.getTaskIDByPromise(p)

  expect(con.getTaskStatus(taskId!)).toBe('processing')

  const retireResult = con.retireOne(taskId!)
  expect(retireResult).toEqual({ scene: 'in_processing' })
  expect(abortFn).toHaveBeenCalledWith('outside')

  // send() 立即结算为 retired；processor 仍会继续跑，但其结果会被忽略
  expect(await p).toEqual({ scene: 'retired/in_processing' })
  expect(con.getTaskStatus(taskId!)).toBe('retired/in_processing')
  // retire 后工位立即释放，不等待 processor 结束
  expect(con.getProcessing()).toEqual([])

  await vi.advanceTimersByTimeAsync(100)
  expect(con.getTaskStatus(taskId!)).toBe('retired/in_processing')
  expect(con.getProcessing()).toEqual([])
})

test('retireOne 先释放工位再触发 outside 中断', async () => {
  let seen: number[] | undefined
  let con: ConveyorInstance<number, number>

  con = Conveyor<number, number>(async (n, { abort_signal }) => {
    abort_signal.receive(() => {
      seen = con.getProcessing().map(task => task.payload)
    })
    await sleep(100)
    return n
  })

  const p = con.send(1)
  await vi.advanceTimersByTimeAsync(10)

  con.retireOne(Conveyor.getTaskIDByPromise(p)!)

  // outside 回调里看到的已是释放后的工位
  expect(seen).toEqual([])

  await p
  await vi.advanceTimersByTimeAsync(100)
})

test('retireOne 立即释放工位并调度下一个任务', async () => {
  const started: number[] = []
  const con = Conveyor(async (n: number) => {
    started.push(n)
    await sleep(100)
  })
  con.setValve(1)

  const p1 = con.send(1)
  const p2 = con.send(2)
  await vi.advanceTimersByTimeAsync(10)

  const taskId1 = Conveyor.getTaskIDByPromise(p1)!
  expect(started).toEqual([1])

  expect(con.retireOne(taskId1)).toEqual({ scene: 'in_processing' })
  expect(await p1).toEqual({ scene: 'retired/in_processing' })

  // 工位已经立即空出，p2 应该已经进入 processing
  expect(started).toEqual([1, 2])
  expect(con.getProcessing().map(task => task.payload)).toEqual([2])
  expect(con.getState()).toBe('working/controlled')

  await vi.advanceTimersByTimeAsync(100)
  await p2
})

test('retireOne 排队任务会取消 waiting timer', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)
  con.setWaitingTimeout(50)

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  const taskId2 = Conveyor.getTaskIDByPromise(p2)!
  await vi.advanceTimersByTimeAsync(10)
  expect(con.retireOne(taskId2)).toEqual({ scene: 'retired' })

  expect(await p2).toEqual({ scene: 'retired/in_waiting' })

  // 已经超过原 waiting timeout 时长，但 timer 已被取消，状态不应被改写
  await vi.advanceTimersByTimeAsync(100)
  expect(con.getTaskStatus(taskId2)).toBe('retired/in_waiting')

  await p1
})

test('retireOne 执行中任务会取消 processing timer，终态不被超时覆盖', async () => {
  const abortFn = vi.fn()
  const sigProcessed = vi.fn()

  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(500)
  })

  con.signals.sig_processor_processed.receive(sigProcessed)
  con.setProcessingTimeout(50)

  const p = con.send(1)
  await vi.advanceTimersByTimeAsync(10)

  const taskId = Conveyor.getTaskIDByPromise(p)!
  expect(con.retireOne(taskId)).toEqual({ scene: 'in_processing' })
  expect(abortFn).toHaveBeenCalledWith('outside')

  expect(await p).toEqual({ scene: 'retired/in_processing' })
  expect(con.getProcessing()).toEqual([])

  // 超过 processing timeout 时长后，状态仍应保持 retired/in_processing
  await vi.advanceTimersByTimeAsync(100)
  expect(con.getTaskStatus(taskId)).toBe('retired/in_processing')
  expect(abortFn.mock.calls).toEqual([['outside']])

  // 工位已在 retire 时释放；processor 真正结束后仍会触发 processed
  await vi.advanceTimersByTimeAsync(500)
  expect(sigProcessed).toHaveBeenCalledTimes(1)
})

test('retireOne 执行中任务后 destroy 不再触发 abort_signal', async () => {
  const abort_calls: AbortCause[] = []
  let release_processor!: () => void

  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(cause => abort_calls.push(cause))
    await new Promise<void>(resolve => {
      release_processor = resolve
    })
  })

  const p = con.send(1)
  const task_id = Conveyor.getTaskIDByPromise(p)!

  expect(con.getTaskStatus(task_id)).toBe('processing')

  expect(con.retireOne(task_id)).toEqual({ scene: 'in_processing' })
  expect(await p).toEqual({ scene: 'retired/in_processing' })
  expect(abort_calls).toEqual(['outside'])

  con.destroy()
  expect(abort_calls).toEqual(['outside'])
  expect(con.getTaskStatus(task_id)).toBe('retired/in_processing')

  release_processor()
  await vi.advanceTimersByTimeAsync(0)
  expect(abort_calls).toEqual(['outside'])
})

test('sig_processor_will_process 中 destroy：终态后 timer 不再触发', async () => {
  const sigProcessed = vi.fn()
  let destroyed = false

  const con = Conveyor(async () => {
    await sleep(100)
  })

  con.setProcessingTimeout(50)
  con.signals.sig_processor_processed.receive(sigProcessed)
  con.signals.sig_processor_will_process.receive(() => {
    if (!destroyed) {
      destroyed = true
      con.destroy()
    }
  })

  const p = con.send(1)
  const taskId = Conveyor.getTaskIDByPromise(p)!

  expect(await p).toEqual({ scene: 'destroyed/in_processing' })
  expect(con.getTaskStatus(taskId)).toBe('destroyed/in_processing')

  await vi.advanceTimersByTimeAsync(100)

  expect(con.getTaskStatus(taskId)).toBe('destroyed/in_processing')
  expect(sigProcessed).toHaveBeenCalledTimes(1)
})

test('destroy 排队任务结算 destroyed/in_waiting，processing 任务结算 destroyed/in_processing', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  const p1 = con.send(1) // 处理中
  const p2 = con.send(2) // 排队中

  const taskId1 = Conveyor.getTaskIDByPromise(p1)!
  const taskId2 = Conveyor.getTaskIDByPromise(p2)!

  con.destroy()
  expect(() => con.destroy()).not.toThrow()

  expect(await p2).toEqual({ scene: 'destroyed/in_waiting' })
  expect(con.getTaskStatus(taskId2)).toBe('destroyed/in_waiting')

  expect(await p1).toEqual({ scene: 'destroyed/in_processing' })
  expect(con.getTaskStatus(taskId1)).toBe('destroyed/in_processing')

  await vi.advanceTimersByTimeAsync(100)
})

test('destroy：排队任务 resolve destroyed/in_waiting，销毁后 send 被拒绝', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  const p1 = con.send(1) // 处理中
  const p2 = con.send(2) // 排队中

  const taskId1 = Conveyor.getTaskIDByPromise(p1)!
  const taskId2 = Conveyor.getTaskIDByPromise(p2)!

  con.destroy()

  // 排队任务不再 reject，而是以 destroyed/in_waiting 结算
  expect(await p2).toEqual({ scene: 'destroyed/in_waiting' })
  expect(con.getTaskStatus(taskId2)).toBe('destroyed/in_waiting')

  // 销毁后再次 send 会直接抛错
  await expect(() => con.send(3)).rejects.toThrow(ConveyorError)

  await vi.advanceTimersByTimeAsync(100)
  expect(await p1).toEqual({ scene: 'destroyed/in_processing' })
  expect(con.getTaskStatus(taskId1)).toBe('destroyed/in_processing')
})

// ============================================================================
// 5. 异常捕获
// ============================================================================

test('processor 抛出异常返回 processor_failure，不污染事件循环', async () => {
  const sigFailure = vi.fn()
  const presetError = new Error('boom')

  const con = Conveyor(async () => {
    throw presetError
  })

  con.signals.sig_processor_failure.receive(sigFailure)

  const p = con.send(1)
  const result = await p

  expect(result.scene).toBe('processor_failure')
  if (result.scene === 'processor_failure') {
    expect(result.error).toBe(presetError)
  }

  expect(sigFailure).toHaveBeenCalledTimes(1)
  expect(sigFailure.mock.calls[0][0].task_id).toBeDefined()
  expect(sigFailure.mock.calls[0][0].error).toBe(presetError)
})

test('processor 同步抛错会转成 processor_failure', async () => {
  const presetError = new Error('sync boom')

  const con = Conveyor<number, void>(() => {
    throw presetError
  })

  const p = con.send(1)
  const taskId = Conveyor.getTaskIDByPromise(p)!

  expect(await p).toEqual({
    scene: 'processor_failure',
    error: presetError,
  })
  expect(con.getTaskStatus(taskId)).toBe('failure')
})

test('send 后同步 destroy：同步订阅 abort 的 processor 能收到中断', async () => {
  const abortFn = vi.fn()
  let release!: () => void

  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await new Promise<void>(resolve => {
      release = resolve
    })
  })

  const p = con.send(1)

  con.destroy()

  expect(await p).toEqual({ scene: 'destroyed/in_processing' })
  expect(abortFn).toHaveBeenCalledWith('destroy')

  release()
  await vi.advanceTimersByTimeAsync(0)
})

// ============================================================================
// 6. 极限防御与分支覆盖 (Coverage 补全)
// ============================================================================

test('destroy 之后，所有 API 调用都会被 Guard 拦截', async () => {
  const con = Conveyor(async () => {})
  con.destroy()

  // 测试所有被 WithDestroy 包裹的 API
  expect(() => con.setValve(2)).toThrow(ConveyorError)
  expect(() => con.setValve(2)).toThrow('This Conveyor is destroyed')
  expect(() => con.setBacklogsLimit(10)).toThrow(ConveyorError)
  expect(() => con.setWaitingTimeout(100)).toThrow(ConveyorError)
  expect(() => con.setProcessingTimeout(100)).toThrow(ConveyorError)
  expect(() => con.getBacklogs()).toThrow(ConveyorError)
  expect(() => con.getTaskStatus(Symbol('fake') as any)).toThrow(ConveyorError)
  expect(() => con.retireOne(Symbol('fake') as any)).toThrow(ConveyorError)
  expect(() => con.retireOneIgnoreProcessing(Symbol('fake') as any)).toThrow(ConveyorError)
})

test('getTaskStatus 查询不存在的任务会抛错', () => {
  const con = Conveyor(async () => {})
  const fakeId = Symbol('fake_id') as any
  expect(() => con.getTaskStatus(fakeId)).toThrow(ConveyorError)
})

test('retireOneIgnoreProcessing 的各种场景', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)

  const fakeId = Symbol('fake_id') as any
  expect(con.retireOneIgnoreProcessing(fakeId)).toEqual({ scene: 'not_found' })

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  const taskId1 = Conveyor.getTaskIDByPromise(p1)!
  const taskId2 = Conveyor.getTaskIDByPromise(p2)!

  // 忽略处理中：因为正在跑，所以找不到，直接返回 not_found
  expect(con.retireOneIgnoreProcessing(taskId1)).toEqual({ scene: 'not_found' })

  // 正常退役排队中的
  expect(con.retireOneIgnoreProcessing(taskId2)).toEqual({ scene: 'retired' })
  expect(await p2).toEqual({ scene: 'retired/in_waiting' })

  await vi.advanceTimersByTimeAsync(100)
})

test('Valve 设置为 0 时，任务会无限期挂起，直到调整 Valve', async () => {
  const con = Conveyor(async () => { await sleep(10) })
  con.setValve(0) // 关闭阀门

  const p = con.send(1)

  // 推进时间，任务不动
  await vi.advanceTimersByTimeAsync(100)

  // 检查状态
  const taskId = Conveyor.getTaskIDByPromise(p)!
  expect(con.getTaskStatus(taskId)).toBe('waiting')

  // 打开阀门
  con.setValve(1)
  await vi.advanceTimersByTimeAsync(10)
  expect(await p).toEqual({ scene: 'done', return_value: undefined })
})

test('Timer 动态缩减：当新的超时时间小于已经流逝的时间时，立刻触发超时', async () => {
  const abortFn = vi.fn()
  const con = Conveyor(async (_, { abort_signal }) => {
    abort_signal.receive(abortFn)
    await sleep(1000)
  })

  con.setProcessingTimeout(500) // 初始 500ms

  const p = con.send(1)

  // 已经过了 200ms
  await vi.advanceTimersByTimeAsync(200)

  // 动态设为 100ms (已超时)
  con.setProcessingTimeout(100)

  // 推进 1ms 触发 Timer 内部的 Memo.watch 回调
  await vi.advanceTimersByTimeAsync(1)

  expect(abortFn).toHaveBeenCalledWith('timeout')
  expect(await p).toEqual({ scene: 'timeout/in_processing', elapsed_time: 200 })

  await vi.advanceTimersByTimeAsync(1000)
})

// ============================================================================
// 7. 覆盖率极致补全 (Edge Cases for Coverage)
// ============================================================================

test('排队超时定时器触发时，任务如果已被移出队列，应当静默处理 (覆盖 rm_result === "not_found" 分支)', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)
  con.setWaitingTimeout(50)

  const p1 = con.send(1) // 正在跑
  const p2 = con.send(2) // 排队

  // 让 p1 开始执行，p2 继续排队
  await vi.advanceTimersByTimeAsync(10)

  // 手动用 retireOne 干掉 p2
  const taskId2 = Conveyor.getTaskIDByPromise(p2)!
  con.retireOne(taskId2)

  // 强行快进 50ms，此时 p2 已经不在队列，它的 waitingTimer 应该触发并走 else 分支
  await vi.advanceTimersByTimeAsync(50)

  // 确保 p1 能跑完
  await vi.advanceTimersByTimeAsync(100)
  await p1
})

test('当 Queue 为空且触发 startProcessing 时，应直接返回 (覆盖 tasks.length === 0 分支)', async () => {
  // 这里利用一个已经执行完毕的空 Conveyor
  const con = Conveyor(async () => {})
  const p = con.send(1)
  await p // 跑完

  // 此时队列为空，再次设置 valve 会触发 startProcessing
  con.setValve(2)
  expect(true).toBe(true) // 只要不报错就证明安全退出了
})

test('destroy 时，执行中的任务立即结算为 destroyed/in_processing，processor 仍会跑完', async () => {
  let finished = false
  const sigDone = vi.fn()
  const sigProcessed = vi.fn()

  const con = Conveyor(async () => {
    await sleep(100)
    finished = true
  })

  con.signals.sig_processor_done.receive(sigDone)
  con.signals.sig_processor_processed.receive(sigProcessed)

  const p1 = con.send(1)
  const taskId = Conveyor.getTaskIDByPromise(p1)!

  // 推进时间，让 p1 进入 processing
  await vi.advanceTimersByTimeAsync(10)

  // 此时调用 destroy，p1 的状态是 processing
  con.destroy()

  // send() 立即结算为 destroyed/in_processing，而不是继续等 processor
  expect(await p1).toEqual({ scene: 'destroyed/in_processing' })
  expect(con.getTaskStatus(taskId)).toBe('destroyed/in_processing')
  expect(finished).toBe(false)

  // processor 仍会继续跑完；它的最终结果不再触发 done 信号
  await vi.advanceTimersByTimeAsync(100)
  expect(finished).toBe(true)
  expect(sigDone).not.toHaveBeenCalled()
  expect(sigProcessed).toHaveBeenCalledTimes(1)
  expect(con.getTaskStatus(taskId)).toBe('destroyed/in_processing')
})

test('Timer 的 set 与 unset 边界，以及动态调整的兜底', async () => {
  // 覆盖 setTimeoutWrap 中 >= 0 的 'set' 分支和 -1 的 unset 分支
  const con = Conveyor(async () => {})

  // 测 unset（-1 表示不使用定时器）
  con.setWaitingTimeout(-1)
  const p1 = con.send(1)
  await vi.advanceTimersByTimeAsync(1)
  await p1

  con.setValve(0)

  // 测 set + 动态调小
  con.setWaitingTimeout(100)
  const p2 = con.send(2)
  await vi.advanceTimersByTimeAsync(10)
  con.setWaitingTimeout(5) // 动态调小，触发 Timer 的 else 分支 (立刻超时)
  await vi.advanceTimersByTimeAsync(1)

  const r2 = await p2
  // 由于它还没开始跑，它应该超时
  expect(r2.scene).toBe('timeout/in_waiting')
})

// ============================================================================
// 8. 覆盖率死角打击 (Coverage 100%)
// ============================================================================

test('Valve 设置非法的并发值会触发校验报错', () => {
  const con = Conveyor(async () => {})

  // 覆盖 v < 0 的分支
  expect(() => con.setValve(-1)).toThrow(RangeError)

  // 覆盖非整数分支
  expect(() => con.setValve(1.5)).toThrow(TypeError)

  // Infinity 合法：表示不限制并发
  expect(() => con.setValve(Infinity)).not.toThrow()
})

test('超时之后，底层的 processor 才报错，应被拦截且不污染状态', async () => {
  const con = Conveyor(async () => {
    await sleep(100)
    // 👇 修改点：用 return Promise.reject 代替 throw
    return Promise.reject(new Error('延迟的异常'))
  })

  con.setProcessingTimeout(50)

  const p = con.send(1)

  await vi.advanceTimersByTimeAsync(50)
  const res = await p
  expect(res.scene).toBe('timeout/in_processing')

  await vi.advanceTimersByTimeAsync(100)
  expect(con.getTaskStatus(Conveyor.getTaskIDByPromise(p)!)).toBe('timeout/in_processing')
})

test('Timer 动态延长超时时间，覆盖重新挂载 setTimeout 的分支', async () => {
  // 👇 修改点：p1 拉长到 500ms
  const con = Conveyor(async () => { await sleep(500) })
  con.setValve(1)
  con.setWaitingTimeout(50)

  const p1 = con.send(1)
  const p2 = con.send(2)

  await vi.advanceTimersByTimeAsync(10)
  con.setWaitingTimeout(100)

  await vi.advanceTimersByTimeAsync(50)
  await vi.advanceTimersByTimeAsync(50)

  const r2 = await p2
  expect(r2.scene).toBe('timeout/in_waiting')

  await vi.advanceTimersByTimeAsync(500)
})

test('setValve的参数检查', () => {
  const con = Conveyor(async () => {})

  expect(() => con.setValve(1.1)).throw()
})

// ============================================================================
// ConveyorState / getProcessing
// ============================================================================

test('getState：初始 idle，Valve=0 为 paused', () => {
  const con = Conveyor(async () => {})

  expect(con.getState()).toBe('idle')

  con.setValve(0)
  expect(con.getState()).toBe('paused')

  con.setValve(1)
  expect(con.getState()).toBe('idle')
})

test('getState：processing 中为 working/controlled', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  const p = con.send(1)

  expect(con.getState()).toBe('working/controlled')
  expect(con.getProcessing().map(task => task.payload)).toEqual([1])

  await vi.advanceTimersByTimeAsync(100)
  await p

  expect(con.getState()).toBe('idle')
  expect(con.getProcessing()).toEqual([])
})

test('getState：backlog 满时为 working/swamped', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)
  con.setBacklogsLimit(1)

  const p1 = con.send(1)
  const p2 = con.send(2)

  expect(con.getBacklogs()).toHaveLength(1)
  expect(con.getState()).toBe('working/swamped')

  await vi.advanceTimersByTimeAsync(200)
  await Promise.all([p1, p2])
})

test('getState：Valve=0 且处理中为 working/in_paused', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  const p = con.send(1)

  con.setValve(0)
  expect(con.getState()).toBe('working/in_paused')

  await vi.advanceTimersByTimeAsync(100)
  await p

  expect(con.getState()).toBe('paused')
  expect(con.getProcessing()).toEqual([])
})

test('getState：destroy 后为 destroyed，getProcessing 抛错', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  const p = con.send(1)

  con.destroy()

  expect(con.getState()).toBe('destroyed')
  expect(() => con.getProcessing()).toThrow(ConveyorError)

  await expect(p).resolves.toEqual({ scene: 'destroyed/in_processing' })
  await vi.advanceTimersByTimeAsync(100)
})

test('getProcessing 只包含 processing 任务', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  con.setValve(1)

  const p1 = con.send(1)
  const p2 = con.send(2)

  expect(con.getProcessing().map(task => task.payload)).toEqual([1])

  await vi.advanceTimersByTimeAsync(100)
  await p1

  expect(con.getProcessing().map(task => task.payload)).toEqual([2])

  await vi.advanceTimersByTimeAsync(100)
  await p2

  expect(con.getProcessing()).toEqual([])
})

test('retireOne 执行中任务会立即释放 processing 工位', async () => {
  const con = Conveyor(async () => { await sleep(100) })
  const p = con.send(1)
  const taskId = Conveyor.getTaskIDByPromise(p)!

  con.retireOne(taskId)

  expect(await p).toEqual({ scene: 'retired/in_processing' })
  expect(con.getProcessing()).toEqual([])
  expect(con.getState()).toBe('idle')

  await vi.advanceTimersByTimeAsync(100)

  expect(con.getProcessing()).toEqual([])
  expect(con.getState()).toBe('idle')
  expect(con.getTaskStatus(taskId)).toBe('retired/in_processing')
})

test('处理超时后 getProcessing 立即不再包含任务', async () => {
  const con = Conveyor(async () => { await sleep(1000) })
  con.setProcessingTimeout(50)

  const p = con.send(1)
  await vi.advanceTimersByTimeAsync(50)

  expect(await p).toEqual({ scene: 'timeout/in_processing', elapsed_time: 50 })
  expect(con.getProcessing()).toEqual([])
  expect(con.getState()).toBe('idle')

  await vi.advanceTimersByTimeAsync(1000)
})

// ============================================================================
// 9. 与 Queue / concurrency 的行为对齐（Legacy 用例迁移）
// ============================================================================

test('队列排空与 FIFO：valve=3 下 50 个任务按 send 顺序出队并全部完成', async () => {
  const started: number[] = []

  const con = Conveyor(async (n: number) => {
    started.push(n)
    await sleep(10)
    return n
  })

  con.setValve(3)

  const tasks = Array.from({ length: 50 }, (_, i) => con.send(i))

  await vi.advanceTimersByTimeAsync(1000)

  const results = await Promise.all(tasks)

  // 出队顺序必须与 send 顺序一致（Queue keep sequence 的等价断言）
  expect(started).toEqual(Array.from({ length: 50 }, (_, i) => i))

  results.forEach((result, i) => {
    expect(result).toEqual({ scene: 'done', return_value: i })
  })

  // 排空后回到 idle（Queue ALL_DONE + getStatus('pause') 的可观察等价）
  expect(con.getBacklogs()).toEqual([])
  expect(con.getProcessing()).toEqual([])
  expect(con.getState()).toBe('idle')
})

test('processor 失败不阻断队列，done / failure / processed 信号按任务触发并携带 TaskID', async () => {
  const err = new Error('failure in the middle')
  const sigWillProcess = vi.fn()
  const sigDone = vi.fn()
  const sigFailure = vi.fn()
  const sigProcessed = vi.fn()

  const con = Conveyor<number, string>(async (n) => {
    await sleep(10)
    if (n === 1) {
      throw err
    }
    return `ok-${n}`
  })

  con.setValve(1)
  con.signals.sig_processor_will_process.receive(sigWillProcess)
  con.signals.sig_processor_done.receive(sigDone)
  con.signals.sig_processor_failure.receive(sigFailure)
  con.signals.sig_processor_processed.receive(sigProcessed)

  const p0 = con.send(0)
  const p1 = con.send(1)
  const p2 = con.send(2)

  const [id0, id1, id2] = [p0, p1, p2].map(p => Conveyor.getTaskIDByPromise(p)!)

  await vi.advanceTimersByTimeAsync(100)

  expect(await p0).toEqual({ scene: 'done', return_value: 'ok-0' })
  expect(await p1).toEqual({ scene: 'processor_failure', error: err })
  expect(await p2).toEqual({ scene: 'done', return_value: 'ok-2' })

  expect(con.getTaskStatus(id0)).toBe('done')
  expect(con.getTaskStatus(id1)).toBe('failure')
  expect(con.getTaskStatus(id2)).toBe('done')

  expect(sigWillProcess.mock.calls.map(call => call[0])).toEqual([id0, id1, id2])
  // 失败任务不应触发 done，成功任务也不应触发 failure
  expect(sigDone.mock.calls.map(call => call[0])).toEqual([id0, id2])
  expect(sigFailure).toHaveBeenCalledTimes(1)
  expect(sigFailure).toHaveBeenCalledWith({ task_id: id1, error: err })
  // PROCESSED 在成功与失败路径都会触发（对齐 Queue 的 finally 语义）
  expect(sigProcessed.mock.calls.map(call => call[0])).toEqual([id0, id1, id2])
})

test('动态调整 Valve：提高立即补位，降低只限制新派发且不打断已在执行的任务', async () => {
  const started: number[] = []

  const con = Conveyor(async (n: number) => {
    started.push(n)
    await sleep(100)
  })

  con.setValve(1)
  const tasks = [1, 2, 3, 4, 5].map(n => con.send(n))
  expect(started).toEqual([1])

  // 提高 Valve 立即补位
  con.setValve(3)
  expect(started).toEqual([1, 2, 3])

  // 降低 Valve 不打断已在执行的任务，也不立即补位
  con.setValve(1)
  await vi.advanceTimersByTimeAsync(99)
  expect(started).toEqual([1, 2, 3])

  await vi.advanceTimersByTimeAsync(1)
  expect(started).toEqual([1, 2, 3, 4])
  expect(con.getProcessing().map(task => task.payload)).toEqual([4])
  expect(con.getBacklogs().map(task => task.payload)).toEqual([5])

  await vi.advanceTimersByTimeAsync(100)
  expect(started).toEqual([1, 2, 3, 4, 5])

  await vi.advanceTimersByTimeAsync(100)
  const results = await Promise.all(tasks)
  expect(results.every(result => result.scene === 'done')).toBe(true)
})

test('processor 内同步 setValve + 连续 send 的重入不会超发', async () => {
  const started: number[] = []
  const inner_promises: Array<Promise<ConveyorSendResult<void>>> = []
  let active = 0
  let max_active = 0

  const con = Conveyor<number, void>(async (n) => {
    started.push(n)
    active += 1
    max_active = Math.max(max_active, active)

    if (n === 1) {
      con.setValve(2)
      inner_promises.push(con.send(2))
      inner_promises.push(con.send(3))
    }

    await sleep(100)
    active -= 1
  })

  con.setValve(1)
  const p1 = con.send(1)

  // 第一个 processor 同步改 Valve 并 send：槽位已被预占，第 3 个任务必须排队
  expect(started).toEqual([1, 2])
  expect(con.getProcessing().map(task => task.payload)).toEqual([1, 2])
  expect(con.getBacklogs().map(task => task.payload)).toEqual([3])

  const [p2, p3] = inner_promises

  await vi.advanceTimersByTimeAsync(100)
  expect(await p1).toEqual({ scene: 'done', return_value: undefined })
  expect(await p2).toEqual({ scene: 'done', return_value: undefined })
  expect(started).toEqual([1, 2, 3])

  await vi.advanceTimersByTimeAsync(100)
  expect(await p3).toEqual({ scene: 'done', return_value: undefined })
  // 重入 send 不能让并发峰值超过 Valve
  expect(max_active).toBe(2)
})

test('will_process 内退役积压任务：重入安全，当前出队任务仍会执行', async () => {
  const processed: number[] = []

  const con = Conveyor<number, void>(async (n) => {
    processed.push(n)
    await sleep(10)
  })

  con.setValve(1)
  con.signals.sig_processor_will_process.receive(() => {
    for (const task of [...con.getBacklogs()]) {
      if (task.payload % 2 === 1) {
        con.retireOne(task.id)
      }
    }
  })

  const tasks = Array.from({ length: 10 }, (_, i) => con.send(i))
  const taskIds = tasks.map(task => Conveyor.getTaskIDByPromise(task)!)

  await vi.advanceTimersByTimeAsync(500)

  const results = await Promise.all(tasks)

  // 1 在 will_process 触发前已经出队，无法在信号里撤回；
  // 3/5/7/9 还在积压中，可在信号里退役（对齐 Queue WILL_PROCESS + setTasks 的筛选场景）
  expect(processed).toEqual([0, 1, 2, 4, 6, 8])
  expect(results.map(result => result.scene)).toEqual([
    'done', 'done', 'done', 'retired/in_waiting',
    'done', 'retired/in_waiting', 'done', 'retired/in_waiting',
    'done', 'retired/in_waiting',
  ])

  for (const idx of [3, 5, 7, 9]) {
    expect(con.getTaskStatus(taskIds[idx])).toBe('retired/in_waiting')
  }

  expect(con.getBacklogs()).toEqual([])
  expect(con.getState()).toBe('idle')
})

test('send 返回前同步调用 processor（固化与 Queue「不会立即执行」相反的语义）', async () => {
  const called: number[] = []

  const con = Conveyor(async (n: number) => {
    called.push(n)
    await sleep(10)
  })

  const p = con.send(1)
  expect(called).toEqual([1])
  expect(con.getProcessing().map(task => task.payload)).toEqual([1])

  await vi.advanceTimersByTimeAsync(10)
  expect(await p).toEqual({ scene: 'done', return_value: undefined })
})

test('setValve 校验补齐：NaN / 非数字 / 小数 / -Infinity', () => {
  const con = Conveyor(async () => {})

  expect(() => con.setValve(NaN)).toThrow(TypeError)
  expect(() => con.setValve(0.9)).toThrow(TypeError)
  expect(() => con.setValve('0' as any)).toThrow(TypeError)
  expect(() => con.setValve(-1)).toThrow(RangeError)
  // 当前实现先判“非整数”再判负数，因此 -Infinity 抛 TypeError；
  // 与 concurrency.Valve（先判 v < 0，抛 RangeError）不同，此处只固化 Conveyor 现状
  expect(() => con.setValve(-Infinity)).toThrow(TypeError)
  expect(() => con.setValve(0)).not.toThrow()
  expect(() => con.setValve(Infinity)).not.toThrow()
})

test('Conveyor 实例与 signals 已冻结，避免运行时替换', () => {
  const con = Conveyor(async () => {})

  expect(Object.isFrozen(con)).toBe(true)
  expect(Object.isFrozen(con.signals)).toBe(true)

  expect(() => {
    (con as any).setValve = () => {}
  }).toThrow(TypeError)

  expect(() => {
    (con as any).signals = {}
  }).toThrow(TypeError)

  expect(() => {
    (con.signals as any).sig_processor_done = null
  }).toThrow(TypeError)
})
