
function Vait() {
  var pass, fail

  var promise = new Promise(function(resolve, reject) {
    pass = function(value) {
      promise.__value__ = value
      resolve(value)
      return promise
    }
    fail = function(error) {
      promise.__error__ = error
      reject(error)
      return promise
    }
  })

  promise.pass = pass
  promise.fail = fail

  return promise
}

Vait.nextTick = function() {
  return this.timeout(0)
}

Vait.timeout = function(timing, value) {
  var vait = Vait()

  var timeout_handle = setTimeout(vait.pass, timing, value)

  vait.clear = function() {
    return clearTimeout(timeout_handle)
  }

  return vait
}

module.exports = Vait
