function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, basedir, module) {
	return module = {
		path: basedir,
		exports: {},
		require: function (path, base) {
			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
		}
	}, fn(module, module.exports), module.exports;
}

function commonjsRequire () {
	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
}

var src = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
var Vait = function () {
    var pass, fail;
    var promise = new Promise(function (resolve, reject) {
        pass = function (value) {
            promise.__finally__ = true;
            promise.__value__ = value;
            resolve(value);
        };
        fail = function (error) {
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
};
Vait.timeout = function (timing, value) {
    if (value === void 0) { value = undefined; }
    var v = Vait();
    var timeout_handle = setTimeout(v.pass, parseInt("" + timing), value);
    var vv = Object.assign(v, {
        clear: function () { return clearTimeout(timeout_handle); }
    });
    return vv;
};
Vait.nextTick = function () { return Vait.timeout(0); };
Vait.wait = function (promise) {
    var v = Vait();
    promise.then(v.pass).catch(v.fail);
    return v;
};
exports.default = Vait;
// // module.exports = Vait

});

var index = /*@__PURE__*/getDefaultExportFromCjs(src);

export default index;
//# sourceMappingURL=vait.esm.js.map
