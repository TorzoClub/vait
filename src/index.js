
function Vait() {
  let pass, fail

  const promise = new Promise((resolve, reject) => {
    pass = function () {
      resolve(...arguments)
      return promise
    }
    fail = function () {
      reject(...arguments)
      return promise
    }
  })

  return Object.assign(promise, {
    pass,
    fail,
  })
}

module.exports = Object.assign(Vait, {
  nextTick() {
    return this.timeout(0)
  },

  timeout(timing, value) {
    const vait = Vait()

    const timeout_handle = setTimeout(vait.pass, timing, value)

    vait.clear = () => clearTimeout(timeout_handle)

    return vait
  }
})
