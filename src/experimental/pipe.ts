type AnyFn = (...args: any[]) => any;

// ---------- 核心工具类型 ----------
type GetArgs<Fns extends readonly AnyFn[]> =
  Fns extends readonly [infer First, ...AnyFn[]]
    ? First extends AnyFn ? Parameters<First> : never
    : never;

type GetReturn<Fns extends readonly AnyFn[]> =
  Fns extends readonly [...AnyFn[], infer Last]
    ? Last extends AnyFn ? Awaited<ReturnType<Last>> : never
    : never;


// ==========================================
// 1. 纯同步管道：Pipe
// ==========================================
export function Pipe<const Fns extends readonly AnyFn[]>(
  ...fns: Fns
): (...args: GetArgs<Fns>) => GetReturn<Fns>;

export function Pipe<T, First extends (arg: T) => any, const Rest extends readonly AnyFn[]>(
  data: T,
  firstFn: First,
  ...restFns: Rest
): GetReturn<[First, ...Rest]>;

// 核心：实现签名使用 ...args: any[]，彻底规避兼容性报错
export function Pipe(...args: any[]): any {
  const [dataOrFn, ...restFns] = args;

  if (typeof dataOrFn === 'function') {
    const fns = [dataOrFn, ...restFns];
    return (...callArgs: any[]) => {
      const initArg = callArgs.length > 0 ? callArgs[0] : undefined;
      return fns.reduce((acc, fn) => fn(acc), initArg);
    };
  }

  return restFns.reduce((acc, fn) => fn(acc), dataOrFn);
}


// ==========================================
// 2. 异步管道：Processing
// ==========================================
export function Processing<const Fns extends readonly AnyFn[]>(
  ...fns: Fns
): (...args: GetArgs<Fns>) => Promise<GetReturn<Fns>>;

export function Processing<T, First extends (arg: T) => any, const Rest extends readonly AnyFn[]>(
  data: T,
  firstFn: First,
  ...restFns: Rest
): Promise<GetReturn<[First, ...Rest]>>;

// 核心：实现签名使用 ...args: any[]，彻底规避兼容性报错
export function Processing(...args: any[]): any {
  const [dataOrFn, ...restFns] = args;

  if (typeof dataOrFn === 'function') {
    const fns = [dataOrFn, ...restFns];
    return async (...callArgs: any[]) => {
      let acc = callArgs.length > 0 ? callArgs[0] : undefined;
      for (const fn of fns) {
        acc = await fn(acc);
      }
      return acc;
    };
  }

  return (async () => {
    let acc = dataOrFn;
    for (const fn of restFns) {
      acc = await fn(acc);
    }
    return acc;
  })();
}
