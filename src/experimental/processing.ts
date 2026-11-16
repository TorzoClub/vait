// 使用 TS 5.0+ 的 const 泛型
function Processing<
  const R1,
  const R2,
  const R3
>(
  step1: () => R1 | Promise<R1>,
  step2: (ctx: Awaited<R1>) => R2 | Promise<R2>,
  step3: (ctx: Awaited<R1> & Awaited<R2>) => R3 | Promise<R3>
): () => Promise<Awaited<R3>> {
  return async () => {
    const r1 = await step1()
    const r2 = await step2(r1)

    // 合并上下文
    const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null
    const ctx = (isObj(r1) && isObj(r2) ? { ...r1, ...r2 } : r2) as Awaited<R1> & Awaited<R2>

    return await step3(ctx)
  }
}

// 你的调用（注意：去掉了 async 和手动定义的 ctx 类型）
const pr = Processing(
  () => ({ abc: true }),
  (ctx) => {
    // ctx 被自动推导为: { readonly abc: true }
    return { bcd: 233 }
  },
  (ctx) => {
    // ctx 被自动推导为: { readonly abc: true } & { readonly bcd: 233 }
    // do something
    return 'END'
  }
)

async function run() {
  const val = await pr()
  // val 的类型被精确推导为: "END"
  console.log(val === 'END') // true
}
