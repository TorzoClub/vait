'use strict';

function Vait(input) {
  var pass, fail;
  var promise = new Promise(function (resolve, reject) {
    pass = function pass(value) {
      promise.__finally__ = true;
      promise.__value__ = value;
      resolve(value);
    };

    fail = function fail(error) {
      promise.__finally__ = true;
      promise.__error__ = error;
      reject(error);
    };
  });
  Object.assign(promise, {
    __isVait__: true,
    __finally__: false,
    pass: pass,
    fail: fail
  });
  return promise;
}

Object.assign(Vait, {
  timeout: function timeout(timing, value) {
    var v = Vait();
    var timeout_handle = setTimeout(v.pass, timing, value);

    v.clear = function () {
      return clearTimeout(timeout_handle);
    };

    return v;
  },
  nextTick: function nextTick() {
    return this.timeout(0);
  },
  wait: function wait(promise) {
    var v = Vait();
    promise.then(v.pass).catch(v.fail);
    return v;
  }
});
var src = Vait;

module.exports = src;
//# sourceMappingURL=vait.common.js.map
