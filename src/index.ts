type VaitReturn<T extends unknown, ErrorType = Error> = Promise<T> & {
  __isVait__: true;
  __finally__: boolean;
  __value__: T;
  __error__?: ErrorType;
  pass(val: T): void;
  fail(err: Error): void;
};
type TimeoutReturn<T extends unknown> = VaitReturn<T, Error> & { clear(): void }
interface IVait {
  <T extends unknown, ErrorType>(): VaitReturn<T, ErrorType>;

  timeout<T extends unknown>(timing: string | number, value?: T): TimeoutReturn<T>;
  nextTick(): TimeoutReturn<undefined>;
  wait<T extends unknown>(promise: Promise<T>): VaitReturn<T>;
}

const Vait: IVait = <T extends unknown, ErrorType = Error>() => {
  let pass, fail

  const promise = new Promise<T>((resolve, reject) => {
    pass = (value: T) => {
      promise.__finally__ = true
      promise.__value__ = value
      resolve(value)
    }

    fail = (error: ErrorType) => {
      promise.__finally__ = true
      promise.__error__ = error
      reject(error)
    }
  }) as VaitReturn<T, ErrorType>;

  Object.assign(promise, {
    __isVait__: true,
    __finally__: false,
    pass,
    fail
  })

  return promise
}

Vait.timeout = <T extends unknown>(timing: string | number, value = undefined) => {
  const v = Vait<T, Error>();

  const timeout_handle = setTimeout(v.pass, parseInt(`${timing}`), value)

  const vv: TimeoutReturn<T> = Object.assign(v, {
    clear: () => clearTimeout(timeout_handle)
  });

  return vv;
}

Vait.nextTick = () => Vait.timeout<undefined>(0);

Vait.wait = <T extends unknown>(promise: Promise<T>) => {
  const v = Vait<T, Error>()
  promise.then(v.pass).catch(v.fail)
  return v
}

export default Vait;
// // module.exports = Vait
