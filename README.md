
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

timeout(1000).then(() => {
  console.log('hello after 1000ms')
})
```

```javascript
import { Serial, timeout } from 'vait'

const serial = Serial()

function randomNumber(range) {
  Math.floor(Math.random() * range);
}

serial(async () => {
  await timeout(randomNumber(100))
  console.log('step one')
})
serial(async () => {
  await timeout(randomNumber(100))
  console.log('step two')
})
serial(async () => {
  await timeout(randomNumber(100))
  console.log('step three')
})

// 永远按调用顺序输出：
//   step one
//   step two
//   step three
```

```javascript
import { Wait } from 'vait'

const [wait, go] = Wait()

wait.then(str => {
  // 如果不执行 go, 此函数将永远不会执行
  console.log(str)
})

go('hello, world') // 支持一个参数传入

go() // 因为是调用了 Promise resolve，所以前面 console.log(str) 只会执行一次
```

```javascript
// 一个"卡"住运行时的用法
import { Wait } from 'vait'

const [wait, go] = Wait()

;(async () => {
  const value = await wait
  console.log('value accepted:', value)
})()

setTimeout(() => {
  // 一秒后才会出现 value accepted: 3.1415926
  go(3.1415926)
}, 1000)
```
