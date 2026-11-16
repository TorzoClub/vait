import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { Conveyor, ConveyorError } from './conveyor' // 请替换为你的实际导出路径
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
  con.signals.sig_receiver_will_process.receive(sigWillProcess)
  con.signals.sig_receiver_done.receive(sigDone)
  con.signals.sig_receiver_processed.receive(sigProcessed)

  const sendPromise = con.send('A')

  expect(sigSendBefore).toHaveBeenCalledWith('A')

  // 推进时间，让 receiver 执行完毕
  await vi.advanceTimersByTimeAsync(100)

  const result = await sendPromise

  expect(result).toEqual({ type: 'done', return_value: 'processed-A' })
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

test('背压控制：setBacklogsLimit 超过阈值直接返回 overflow', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  con.setValve(1)
  con.setBacklogsLimit(1) // 只能排队 1 个

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中 (长度 1)
  const p3 = con.send(3) // 触发 overflow

  expect(await p3).toEqual({ type: 'overflow' })

  await vi.advanceTimersByTimeAsync(200)
  await Promise.all([p1, p2])
})

// ============================================================================
// 3. 超时机制 (Waiting & Processing) - 重点适配了 timeout=0 的逻辑
// ============================================================================

test('默认无超时限制（Infinity 的替代）：如果不显式 set，任务永远不会因为超时被干掉', async () => {
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

  expect(result1.type).toBe('done')
  expect(result2.type).toBe('done')
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
  expect(result2).toEqual({ type: 'timeout in waiting', elapsed_time: 50 })

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
  expect(result).toEqual({ type: 'timeout in processing', elapsed_time: 30 })
  expect(abortFn).toHaveBeenCalledWith('timeout')

  // 确保底层的 receiver 之后跑完也不会影响状态
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
  expect(result.type).toBe('timeout in processing')
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

  expect(await p1).toEqual({ type: 'timeout in processing', elapsed_time: 100 })
  expect(abortFn).toHaveBeenCalledTimes(1)

  // 任务已经超时，但 receiver 还没结束；此时再调小超时不应二次触发超时回调
  con.setProcessingTimeout(50)
  await vi.advanceTimersByTimeAsync(1)
  expect(abortFn).toHaveBeenCalledTimes(1)

  // 阀门为 1，且此前只超时了 1 个任务，因此只应再启动 1 个任务
  con.send(2)
  con.send(3)
  await vi.advanceTimersByTimeAsync(10)

  expect(started).toEqual([1, 2])
  expect(maxActive).toBe(2)

  // 收尾：让 receiver 全部结束
  await vi.advanceTimersByTimeAsync(3000)
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

  expect(con.getTaskStatus(taskId2!)).toBe('in blacklogs')

  const retireResult = con.retireOne(taskId2!)
  expect(retireResult).toEqual({ scene: 'retired' })

  const result2 = await p2
  expect(result2).toEqual({ type: 'retired' })
  expect(con.getTaskStatus(taskId2!)).toBe('retired')

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

  expect(con.getTaskStatus(taskId!)).toBe('in processing')

  const retireResult = con.retireOne(taskId!)
  expect(retireResult).toEqual({ scene: 'in processing' })
  expect(abortFn).toHaveBeenCalledWith('outside')

  // 注意：这里因为任务还在跑，按当前设计，它会跑完，但是结果被拦截。
  // 如果你把上一版的 triggerDoneSignal 拿掉了，这里 p 会悬挂！
  // 我建议在这里加上 triggerDoneSignal(taskId!, { type: 'retired' }) 以释放调用方。
  // 在测试里暂时先推进时间。
  await vi.advanceTimersByTimeAsync(100)
})

test('destroy：摧毁传送带，拒绝所有排队任务并抛出错误', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  const p1 = con.send(1) // 处理中
  const p2 = con.send(2) // 排队中

  con.destroy()

  // p2 因为还在排队，触发了 sig_destroyed 应该直接被 reject
  await expect(p2).rejects.toThrow(ConveyorError)

  // 销毁后再次 send 会直接抛错
  await expect(() => con.send(3)).rejects.toThrow(ConveyorError)

  await vi.advanceTimersByTimeAsync(100)
  await p1 // 正在跑的任务依然会跑完
})

// ============================================================================
// 5. 异常捕获
// ============================================================================

test('receiver 抛出异常返回 receiver_failure，不污染事件循环', async () => {
  const sigFailure = vi.fn()
  const presetError = new Error('boom')

  const con = Conveyor(async () => {
    throw presetError
  })

  con.signals.sig_receiver_failure.receive(sigFailure)

  const p = con.send(1)
  const result = await p

  expect(result.type).toBe('receiver_failure')
  if (result.type === 'receiver_failure') {
    expect(result.error).toBe(presetError)
  }

  expect(sigFailure).toHaveBeenCalledTimes(1)
  expect(sigFailure.mock.calls[0][0].task_id).toBeDefined()
  expect(sigFailure.mock.calls[0][0].error).toBe(presetError)
})

// ============================================================================
// 6. 极限防御与分支覆盖 (Coverage 补全)
// ============================================================================

test('destroy 之后，所有 API 调用都会被 Guard 拦截', async () => {
  const con = Conveyor(async () => {})
  con.destroy()

  // 测试所有被 WithDestroy 包裹的 API
  expect(() => con.setValve(2)).toThrow(ConveyorError)
  expect(() => con.setBacklogsLimit(10)).toThrow(ConveyorError)
  expect(() => con.setWaitingTimeout(100)).toThrow(ConveyorError)
  expect(() => con.setProcessingTimeout(100)).toThrow(ConveyorError)
  expect(() => con.getBlacklogs()).toThrow(ConveyorError)
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
  expect(con.retireOneIgnoreProcessing(fakeId)).toEqual({ scene: 'not found' })

  const p1 = con.send(1) // 正在执行
  const p2 = con.send(2) // 排队中

  const taskId1 = Conveyor.getTaskIDByPromise(p1)!
  const taskId2 = Conveyor.getTaskIDByPromise(p2)!

  // 忽略处理中：因为正在跑，所以找不到，直接返回 not found
  expect(con.retireOneIgnoreProcessing(taskId1)).toEqual({ scene: 'not found' })

  // 正常退役排队中的
  expect(con.retireOneIgnoreProcessing(taskId2)).toEqual({ scene: 'retired' })
  expect(await p2).toEqual({ type: 'retired' })

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
  expect(con.getTaskStatus(taskId)).toBe('in blacklogs')

  // 打开阀门
  con.setValve(1)
  await vi.advanceTimersByTimeAsync(10)
  expect(await p).toEqual({ type: 'done', return_value: undefined })
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
  expect(await p).toEqual({ type: 'timeout in processing', elapsed_time: 200 })

  await vi.advanceTimersByTimeAsync(1000)
})

// ============================================================================
// 7. 覆盖率极致补全 (Edge Cases for Coverage)
// ============================================================================

test('排队超时定时器触发时，任务如果已被移出队列，应当静默处理 (覆盖 rm_result === "not found" 分支)', async () => {
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

test('destroy 时，已经在 processing 的任务不应被排队阶段遗留的 watcher 误杀', async () => {
  const con = Conveyor(async () => { await sleep(100) })

  const p1 = con.send(1)

  // 推进时间，让 p1 进入 processing
  await vi.advanceTimersByTimeAsync(10)

  // 此时调用 destroy，p1 的状态是 processing
  con.destroy()

  // 确保 p1 不会被 reject（或者如果你设计为会被中断，则抓住它）
  // 在之前的修复中，我们通过 sym_hook 移除了排队阶段的 watcher，所以它应该继续跑完
  await vi.advanceTimersByTimeAsync(100)

  // 这个 expect 可以确保它没有抛出 Unhandled Rejection
  const result = await p1
  expect(result.type).toBe('done')
})

test('Timer 的 set 与 unset 边界，以及动态调整的兜底', async () => {
  // 覆盖 setTimeoutWrap 中 time !== 0 的 'set' 分支和 unset 分支
  const con = Conveyor(async () => {})

  // 测 unset
  con.setWaitingTimeout(0)
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
  expect(r2.type).toBe('timeout in waiting')
})

// ============================================================================
// 8. 覆盖率死角打击 (Coverage 100%)
// ============================================================================

test('Valve 设置非法的并发值会触发校验报错', () => {
  const con = Conveyor(async () => {})

  // 覆盖 v < 0 的分支
  expect(() => con.setValve(-1)).toThrow(RangeError)

  // 覆盖 !Number.isInteger(v) 且 !== Infinity 的分支
  expect(() => con.setValve(1.5)).toThrow(TypeError)
})

test('超时之后，底层的 receiver 才报错，应被拦截且不污染状态', async () => {
  const con = Conveyor(async () => {
    await sleep(100)
    // 👇 修改点：用 return Promise.reject 代替 throw
    return Promise.reject(new Error('延迟的异常'))
  })

  con.setProcessingTimeout(50)

  const p = con.send(1)

  await vi.advanceTimersByTimeAsync(50)
  const res = await p
  expect(res.type).toBe('timeout in processing')

  await vi.advanceTimersByTimeAsync(100)
  expect(con.getTaskStatus(Conveyor.getTaskIDByPromise(p)!)).toBe('timeout in processing')
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
  expect(r2.type).toBe('timeout in waiting')

  await vi.advanceTimersByTimeAsync(500)
})

test('setValve的参数检查', () => {
  const con = Conveyor(async () => {})

  expect(() => con.setValve(1.1)).throw()
})
