/**
 * 判断一个值是否为 thenable（有可调用的 `then` 方法）。
 *
 * 同时覆盖：原生 Promise、跨 realm 的 Promise、手写 thenable、库返回的类 Promise 对象。
 * 注意：不覆盖极端情况下 `then` getter 会抛错的畸形对象（那种对象 `await` 也会抛，属于使用者问题）。
 */
function isThenable(x: unknown): x is PromiseLike<unknown> {
  return (
    x != null &&
    (typeof x === 'object' || typeof x === 'function') &&
    typeof (x as { then?: unknown }).then === 'function'
  )
}

/**
 * 内部原语：条件求值。
 *
 * - `cond` 为真时执行 `fn()` 并把其结果返回；结果是 thenable 时经 `Promise.resolve` 同化为
 *   当前 realm 的原生 `Promise`。
 * - `cond` 为假时**不**调用 `fn`，直接返回 `undefined`。
 *
 * @remarks
 * 这就是之前的「新 tap」语义。`detour` 基于它构建：需要「条件求值 + 丢弃返回值」时用 `detour`；
 * 需要把求值结果直接暴露给调用方时，可以把这个函数导出并改名为 `when`。
 */
function evaluate<T>(
  cond: boolean,
  fn: () => T | PromiseLike<T>,
): T | Promise<Awaited<T>> | undefined {
  if (!cond) return undefined
  const res = fn()
  return isThenable(res) ? Promise.resolve(res) : res
}

// ==========================================
// 1. tap：条件满足时执行副作用，并原样透传 value
// ==========================================

/**
 * 条件满足时执行副作用操作，并原样返回传入的 `value`。
 *
 * - `cond` 为 `false` 时直接返回 `value`，**不会**调用 `fn`。
 * - `cond` 为 `true` 时执行 `fn(value)`；若返回 thenable，则等其结束后再把 `value` 透传出去。
 *   返回值会经 `Promise.resolve(...)` 同化，保证是当前 realm 的原生 `Promise`。
 *
 * @template T 透传值的类型
 * @param cond 是否执行副作用
 * @param value 需要原样透传的值
 * @param fn 副作用函数，接收 `value`，返回 `PromiseLike<unknown>`
 * @returns 异步版本的 `tap`，类型为 `Promise<T>`
 * @example
 * const user = await tap(is_debug, await fetchUser(), (u) => console.log('user:', u))
 * @remarks
 * 用 `PromiseLike<unknown>` 而不是 `Promise<unknown>`，是为了兼容跨 realm 的 Promise 和库级 thenable；
 * 当 `cond` 为 `false` 时，实际返回的是 `value` 本身（非 Promise），用 `await` 兼容即可。
 * @see {@link detour} 只执行副作用、不需要透传返回值时使用
 */
export function tap<T>(
  cond: boolean,
  value: T,
  fn: (val: T) => PromiseLike<unknown>,
): Promise<T>

/**
 * 条件满足时执行副作用操作，并原样返回传入的 `value`（同步版本）。
 *
 * `fn` 不返回 thenable 时，`tap` 会直接返回 `value`。
 *
 * @template T 透传值的类型
 * @param cond 是否执行副作用
 * @param value 需要原样透传的值
 * @param fn 副作用函数，接收 `value`，返回 `void` 或 thenable
 * @returns 同步版本的 `tap`，类型为 `T`；当 `fn` 返回 thenable 时，实际运行时返回 `Promise<T>`
 * @example
 * const user = tap(is_debug, fetchUserSync(), (u) => console.log('user:', u))
 * @see {@link detour} 只执行副作用、不需要透传返回值时使用
 */
export function tap<T>(
  cond: boolean,
  value: T,
  fn: (val: T) => PromiseLike<unknown> | void,
): Promise<T> | T

/** 实现签名，仅内部使用，调用方看到的是上面的重载 */
export function tap<T>(
  cond: boolean,
  value: T,
  fn: (val: T) => PromiseLike<unknown> | void,
): Promise<T> | T {
  if (!cond) return value
  const res = fn(value)
  // Promise.resolve 而非 res.then：保证返回值是当前 realm 的原生 Promise，
  // 同时兼容非 Promise 的 thenable（其 .then 返回值类型不可信）。
  return isThenable(res) ? Promise.resolve(res).then(() => value) : value
}

// ==========================================
// 2. detour：基于「新 tap」语义（evaluate）实现，绕道执行后舍弃返回值
// ==========================================

/**
 * 条件满足时执行一次「绕道」操作，并丢弃其返回值，最终返回 `void`。
 *
 * 与 `tap` 的区别：`detour` 不关心副作用函数的返回值，也不透传业务值，
 * 典型场景是打日志、上报埋点、发送通知等。
 *
 * @param cond 是否执行副作用
 * @param fn 无参副作用函数，返回 `PromiseLike<unknown>`
 * @returns 异步版本：`Promise<void> | undefined`；`!cond` 时返回 `undefined`
 * @example
 * await detour(is_debug, () => reportAnalytics('page_view'))
 * @see {@link tap} 需要透传返回值时使用 `tap`
 */
export function detour(
  cond: boolean,
  fn: () => PromiseLike<unknown>,
): Promise<void> | undefined

/**
 * 条件满足时执行一次「绕道」操作，并丢弃其返回值（同步版本）。
 *
 * @param cond 是否执行副作用
 * @param fn 无参副作用函数，返回 `void`
 * @returns `undefined`
 * @example
 * detour(is_debug, () => console.log('debug'))
 * @see {@link tap} 需要透传返回值时使用 `tap`
 */
export function detour(
  cond: boolean,
  fn: () => void,
): undefined

/** 实现签名，仅内部使用，调用方看到的是上面的重载 */
export function detour(
  cond: boolean,
  fn: () => PromiseLike<unknown> | void,
): Promise<void> | undefined {
  const res = evaluate(cond, fn)
  return isThenable(res) ? Promise.resolve(res).then(() => undefined) : undefined
}


const cold = true

// --- tap：透传 value ---
const u = { name: 'Ada' }
const a = await tap(cold, u, () => console.log('tap'))
a === u                                            // ✅ true
const b = tap(false, u, () => { throw new Error() })
b === u                                            // ✅ true，副作用没执行

// --- detour：条件求值 + 丢弃 ---
await detour(cold, () => Promise.resolve(233))     // ✅ Promise<void> | undefined
detour(cold, () => console.log('detour'))          // ✅ undefined（同步）
const c = detour(false, () => { throw new Error() })
c === undefined                                    // ✅ true，fn 不会被调用

// --- 之前的三个例子，逻辑搬到 evaluate 上（如果导出可对外验证）---
// const a = evaluate(cold, () => 233)              // 233 | undefined
// const b = await evaluate(cold, async () => 233)  // 233 | undefined
// const c = await evaluate(cold, () => Promise.resolve(233)) // 233 | undefined
// 实际对外时走 detour（丢弃）或后续把 evaluate 导出为 when（取回）
