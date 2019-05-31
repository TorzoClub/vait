'use strict';

function vaitBase() {
  var pass, fail;
  var promise = new Promise(function (resolve, reject) {
    pass = function pass(value) {
      promise.__finally__ = true;
      promise.__value__ = value;
      resolve(value);
      return promise;
    };

    fail = function fail(error) {
      promise.__finally__ = true;
      promise.__error__ = error;
      reject(error);
      return promise;
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

function Vait(input) {
  if (input instanceof Promise) {
    return Vait.connect(input);
  }

  return vaitBase();
}

Vait.connect = function (promise) {
  var v = Vait();
  promise.then(v.pass).catch(v.fail);
  return v;
};

Vait.timeout = function (timing, value) {
  var v = Vait();
  var timeout_handle = setTimeout(v.pass, timing, value);

  v.clear = function () {
    return clearTimeout(timeout_handle);
  };

  return v;
};

Vait.nextTick = function () {
  return Vait.timeout(0);
};

var src = Vait;

module.exports = src;
//# sourceMappingURL=vait.common.js.map
