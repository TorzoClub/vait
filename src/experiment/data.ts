type ValGetter<D> = () => D;

type Val<D> = ValGetter<D> & {
  get: ValGetter<D>,
  map: <R>(fn: (d: D) => R) => Val<R>
};

export const Val = <D>(data: D): Val<D> => {
  const getter = () => data;

  const functor = Object.assign(getter, {
    get: getter,
    map: <R>(fn: (d: D) => R): Val<R> => Val(fn(data)),
  })

  return Object.freeze(functor)
}
