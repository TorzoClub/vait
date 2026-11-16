type Val<D> = Readonly<{
  value: () => D,
  map: <R>(fn: (d: D) => R) => Val<R>,
  ap: <R>(mfn: Val<(d: D) => R>) => Val<R>,
}>

export function Val<D>(getValue: () => D): Val<D> {
  return {
    value: getValue,

    map: <R>(fn: (d: D) => R): Val<R> => {
      return Val(() => fn(getValue()))
    },

    ap: <R>(mfn: Val<(d: D) => R>): Val<R> => {
      return Val(() => mfn.value()(getValue()))
    }
  }
}
