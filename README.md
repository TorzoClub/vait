
一个 Promise 相关的轮子。

------

# 安装

```bash
yarn add vait
# or
npm install --save vait
```

# 示例

```javascript
global.vait = require('vait')

const v = vait()

v.then(str => {
  // 如果不执行 v.pass, 此函数将永远不会执行
  console.log(str)
})


v.pass('hello, world') // 支持一个参数传入

v.pass() // 因为是调用了 Promise resolve，所以 console.log('hello') 只会执行一次
```

```javascript
// 抛出错误
const v = vait()

v.catch(err => {
  // 此处的 err 为下面的 new Error('fail')
  console.warn(err)
})

v.fail(new Error('fail'))
```

```javascript
// 一个卡住运行时的用法

const v = vait()

;(async () => {
  console.log('accept value is:', await v)
})()

setTimeout(() => {
  // 一秒后才会出现 accept value is: 3.1415926
  v.pass(3.1415926)
}, 1000)
```


# API

## timeout

`setTimeout` 的 Promise 封装

```javascript
// 一般写法
vait.timeout(1000).then(() => {
  console.log('hello')
})

// 取消定时器
const v = vait.timeout(1000)
v.clear()
```

## nextTick

相当于调用 `vait.timeout(0)`


# LICENSE

MIT
