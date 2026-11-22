import { Executor } from './executor'
import { ConveyorError } from './conveyor'
import { timeout } from './timeout'
import { Wait } from './wait'

test('Executor 默认并发为 1，按调用顺序执行', async () => {
  const executor = Executor()
  const order: number[] = []

  const tasks = Array.from({ length: 5 }, (_, i) => (
    executor(async () => {
      order.push(i)
      await timeout(5)
      return i
    })
  ))

  expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3, 4])
  expect(order).toEqual([0, 1, 2, 3, 4])
})

test('Executor({ concurrency }) 控制并发上限', async () => {
  const executor = Executor({ concurrency: 3 })
  let active = 0
  let max_active = 0

  const tasks = Array.from({ length: 10 }, (_, i) => (
    executor(async () => {
      active += 1
      max_active = Math.max(max_active, active)
      await timeout(10)
      active -= 1
      return i
    })
  ))

  expect(await Promise.all(tasks)).toEqual(
    Array.from({ length: 10 }, (_, i) => i)
  )
  expect(max_active).toBe(3)
})

test('setConcurrency 动态调整并发上限', async () => {
  const executor = Executor()
  const waits = Array.from({ length: 3 }, () => Wait())
  const started: number[] = []

  const tasks = waits.map(([waiting], i) => (
    executor(async () => {
      started.push(i)
      await waiting
      return i
    })
  ))

  await timeout(10)
  expect(started).toEqual([0])

  executor.setConcurrency(3)
  await timeout(10)
  expect(started).toEqual([0, 1, 2])

  for (const [, done] of waits) {
    done()
  }
  expect(await Promise.all(tasks)).toEqual([0, 1, 2])
})

test('Executor({ backlogs_limit: 0 }) 将 overflow 转为 ConveyorError', async () => {
  const executor = Executor({ backlogs_limit: 0 })

  const error = await executor(async () => 1).then(
    () => undefined,
    err => err,
  )

  expect(error).toBeInstanceOf(ConveyorError)
  expect((error as ConveyorError).cause).toEqual({ scene: 'overflow' })
  expect(Object.isFrozen(executor.conveyor)).toBe(true)
  expect(executor.conveyor.getState()).toBe('idle')
})

test('Executor({ processing_timeout }) 将 timeout/in_processing 转为 ConveyorError', async () => {
  const [waiting, release] = Wait()
  const executor = Executor({ processing_timeout: 10 })

  const error = await executor(() => waiting).then(
    () => undefined,
    err => err,
  )

  expect(error).toBeInstanceOf(ConveyorError)
  expect((error as ConveyorError).cause).toMatchObject({
    scene: 'timeout/in_processing',
  })

  release()
})

test('Executor({ waiting_timeout }) 将 timeout/in_waiting 转为 ConveyorError', async () => {
  const [waiting, release] = Wait()
  const executor = Executor({ waiting_timeout: 10 })

  const running = executor(() => waiting)
  const error = await executor(async () => 2).then(
    () => undefined,
    err => err,
  )

  expect(error).toBeInstanceOf(ConveyorError)
  expect((error as ConveyorError).cause).toMatchObject({
    scene: 'timeout/in_waiting',
  })

  release()
  await running
})

test('任务失败 / 同步抛错只拒绝自身，不阻断后续任务', async () => {
  const executor = Executor()
  const err = new Error('boom')

  const failure = executor(async () => {
    throw err
  })
  const sync_failure = executor(() => {
    throw err
  })
  const success = executor(async () => 'ok')

  await expect(failure).rejects.toBe(err)
  await expect(sync_failure).rejects.toBe(err)
  expect(await success).toBe('ok')
})

test('destroy 结算排队与执行中任务，并阻止后续调用', async () => {
  const executor = Executor()
  const [waiting, release] = Wait()

  const running = executor(async () => {
    await waiting
    return 1
  })
  const queued = executor(async () => 2)

  // 先挂上拒绝处理器，避免 destroy 之后的 unhandled rejection
  const running_result = running.then(() => undefined, err => err)
  const queued_result = queued.then(() => undefined, err => err)

  executor.destroy()

  const queued_error = await queued_result
  expect(queued_error).toBeInstanceOf(ConveyorError)
  expect((queued_error as ConveyorError).cause).toEqual({ scene: 'destroyed/in_waiting' })

  const running_error = await running_result
  expect(running_error).toBeInstanceOf(ConveyorError)
  expect((running_error as ConveyorError).cause).toEqual({ scene: 'destroyed/in_processing' })

  await expect(executor(async () => 3)).rejects.toThrow(ConveyorError)
  expect(() => executor.setConcurrency(2)).toThrow(ConveyorError)
  expect(executor.conveyor.getState()).toBe('destroyed')
  expect(() => executor.destroy()).not.toThrow()

  release()
})

test('ExecutorOptions 参数校验', () => {
  expect(() => Executor({ concurrency: 1.5 })).toThrow(TypeError)
  expect(() => Executor({ concurrency: -1 })).toThrow(RangeError)
  expect(() => Executor({ backlogs_limit: -1 })).toThrow(RangeError)
  expect(() => Executor({ waiting_timeout: Infinity })).toThrow(TypeError)
  expect(() => Executor({ processing_timeout: -2 })).toThrow(RangeError)
})
