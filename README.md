
异步编程的一些实用函数。

------

# 安装

```bash
yarn add vait
# or
npm install --save vait
```

# 示例

```javascript
  import { timeout } from 'vait'
  (async function iife() {
    await timeout(1000)
    console.log('hello after 1000ms')
  })()
```

```javascript
import { Atomic, timeout } from 'vait'
const atomic = Atomic()

function randomNumber(range) {
  Math.floor(Math.random() * range);
}

atomic(async () => {
  await timeout(randomNumber(100))
  console.log('step one')
})
atomic(async () => {
  await timeout(randomNumber(100))
  console.log('step two')
})
atomic(async () => {
  await timeout(randomNumber(100))
  console.log('step three')
})

// output: 
//   step one
//   step two
//   step three
```

```javascript
import { Lock } from 'vait'

const [lock, unlock] = Lock()

lock.then(str => {
  // 如果不执行 unlock, 此函数将永远不会执行
  console.log(str)
})

unlock('hello, world') // 支持一个参数传入

unlock() // 因为是调用了 Promise resolve，所以前面 console.log(str) 只会执行一次
```

```javascript
// 一个卡住运行时的用法
import { Lock } from 'vait'

const [lock, unlock] = Lock()

;(async () => {
  console.log('accept value is:', await lock)
})()

setTimeout(() => {
  // 一秒后才会出现 accept value is: 3.1415926
  unlock(3.1415926)
}, 1000)
```
