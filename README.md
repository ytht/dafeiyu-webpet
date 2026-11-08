# 大肥鱼网页宠物插件 dafeiyu-pet

免依赖、单脚本的网页桌面宠物。引入一行 `<script>`，页面底部就会有一条
自己溜达、发呆、睡觉、可拖动可甩出的蓝色大肥鱼。

## 文件结构

```
plugin/
├── dafeiyu-pet.js          插件主脚本（含样式与全部逻辑，自包含）
├── images/                 宠物素材（6 个，必须与脚本同级）
│   ├── dafeiyu_stand_front.png      站立/拖拽/纯垂直下落
│   ├── dafeiyu_air_side.png         空中侧身帧（向左飞自动镜像）
│   ├── dafeiyu_sleep.png            睡觉（躺枕盖被，静态）
│   ├── whale-maid-walk-front.gif    发呆呼吸摆动
│   ├── whale-maid-walk-right.gif    向右迈步
│   └── whale-maid-walk-left.gif     向左迈步
├── example.html            示例接入页（双击即可预览）
└── README.md               本说明
```

## 快速接入

把整个 `plugin/` 文件夹拷进你的网站，然后在页面任意位置（建议 `<head>` 或
`</body>` 前）加一行：

```html
<script defer src="plugin/dafeiyu-pet.js"></script>
```

完成。图片目录路径由脚本按自身 URL 自动定位，`images/` 保持与脚本同级即可，
不需要额外配置。

## 配置

### 方式一：data-pet-config（JSON）

```html
<script defer src="plugin/dafeiyu-pet.js"
        data-pet-config='{ "speed": 2, "floorOffset": 40 }'></script>
```

### 方式二：单个 data-* 属性

| 属性 | 对应配置 | 示例 |
|---|---|---|
| data-pet-speed | speed | `2` |
| data-pet-gravity | gravity | `0.3` |
| data-pet-jump-force | jumpForce | `-10` |
| data-pet-floor-offset | floorOffset | `40` |
| data-pet-floor-selector | floorSelector | `#my-footer` |
| data-pet-z-index | zIndex | `99999` |
| data-pet-lines | lines | `摸鱼中,饿了,别戳我`（逗号分隔） |
| data-pet-disabled | — | 出现即禁止自动启动（供手动 init） |

### 方式三：JS 传配置

```js
const pet = DafeiyuPet.init({ speed: 2, floorSelector: '#footer' });
```

### 全部配置项与默认值

| 配置 | 默认 | 说明 |
|---|---|---|
| speed | 1.2 | 行走速度 px/frame(60fps) |
| gravity | 0.25 | 重力（越小鱼越"轻"、甩得越高） |
| jumpForce | -9 | 起跳力度 |
| floorOffset | 0 | 地面离视口底部的距离 |
| floorSelector | null | 让鱼站在指定元素顶部 |
| autoDecideInterval | [800,2500] | 自主决策间隔 ms |
| dragThreshold | 4 | 超过该位移算拖动，否则算点击 |
| maxFlingSpeed | 20 | 甩出合成速度上限 px/frame |
| bounce | 0.62 | 边界碰撞恢复系数(0~1) |
| minBounceSpeed | 2.2 | 低于该垂直速度不再回弹 |
| groundFriction | 0.8 | 落地水平速度保留比例 |
| zIndex | 99999 | 容器层级 |
| lines | 9 句台词 | 被点击时随机说的台词 |

## API

```js
DafeiyuPet.init(cfg)        // 启动；幂等，重复调用返回同一实例
DafeiyuPet.destroy()        // 完全移除：停循环、摘事件监听、删 DOM
DafeiyuPet.getInstance()    // 取当前实例（可能为 null）
DafeiyuPet.defaults         // 默认配置（可临时改写作为全局默认）

const pet = DafeiyuPet.getInstance();
pet.say('台词', 2200);      // 让鱼说话（气泡 ms 毫秒后消失）
pet.react();               // 手动触发一次"被戳"反应
```

## 行为一览

- **自主 AI**：发呆（呼吸摆动）→ 溜达（迈步动画、碰边折返）→ 跳跃 → 睡觉（静态盖被图 + 💤），随机切换。
- **点击**：弹跳 + 随机吐槽台词。
- **拖动**：按住拖到视口任意位置，拖拽中暂停物理。
- **松手**：自由落体；甩动会继承手部速度（合成限速 20）；碰四面墙按 0.62 系数弹性衰减，直至静止回到自主行为。

## 与宿主页面的兼容性设计

- 容器 `position: fixed` + `pointer-events: none`（仅宠物本体可点），不遮挡宿主页面任何点击。
- 仅宠物区域 `touch-action: none`，不影响页面其他部分滚动/缩放。
- 样式全部限定在 `#dafeiyu-pet` 作用域内，动画/ID/类名均带 `dq-` 前缀，不与宿主样式冲突。
- 页签切后台自动停算省电；`resize` 自动重算地面。
- `destroy()` 会注销全部事件监听与 rAF，不留泄漏，适合 SPA 路由挂载/卸载。
- 无全局变量污染：只挂一个 `window.DafeiyuPet`。

## 浏览器要求

支持 Pointer Events 的现代浏览器（Chrome/Edge/Firefox/Safari 13+）。
