function Vait(input) {
  let pass, fail

  const promise = new Promise((resolve, reject) => {
    pass = value => {
      promise.__finally__ = true
      promise.__value__ = value
      resolve(value)
      return promise
    }

    fail = error => {
      promise.__finally__ = true
      promise.__error__ = error
      reject(error)
      return promise
    }
  })

  Object.assign(promise, {
    __isVait__: true,
    __finally__: false,
    pass,
    fail
  })

  return promise
}

Vait.timeout = (timing, value) => {
  const v = Vait()

  const timeout_handle = setTimeout(v.pass, timing, value)

  v.clear = () => clearTimeout(timeout_handle)

  return v
}

Vait.nextTick = () => Vait.timeout(0)

module.exports = Vait
