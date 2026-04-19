# 白板

当用户**明确要求**创建白板、流程图、结构图、分组图、关系图或希望在聊天中直接渲染可缩放的图示时，可以使用 ```whiteboard 代码块。

## 语法规则

- 使用受限的白板 DSL，不要输出 JSON、HTML、SVG 或坐标
- 顶层支持：
  - `board: 标题`
  - `layout: flow-right | flow-down | grid`
  - `theme: default`
  - `group: 分组标题 [tone=blue]`
  - `node: 节点ID [text="显示文本", kind=actor, tone=blue, shape=rounded]`
  - `edge: 起点ID -> 终点ID [label="说明", marker=end-arrow, line=solid, animated=true, sourceAnchor=right, targetAnchor=left]`
- `group` 只用于把节点放进一个 frame 中，`group` 不允许嵌套
- `edge` 始终通过节点 ID 绑定 `sourceId/targetId`，不会进入 frame.children
- `group` 下可以继续声明 `node`，也可以就近声明 `edge`，但 `edge` 的归属仍然是顶层白板
- 缩进使用 2 个空格
- 不允许输出 `x`、`y`、`width`、`height`、像素值
- 样式只允许受限枚举：
  - `tone`: `slate | red | orange | amber | green | teal | blue | indigo | pink`
  - `shape`: `square | rounded | pill`
  - `line`: `solid | dashed`
  - `marker`: `none | start-arrow | end-arrow | both-arrow | diamond-end | circle-end`
  - `route`: `straight | curve | orthogonal`
  - `sourceAnchor` / `targetAnchor`: `top | right | bottom | left | center`

## 示例

```whiteboard
board: TCP 三次握手
layout: flow-right
theme: default

group: 连接建立 [tone=blue]
  node: client [text="客户端", kind=actor, tone=blue, shape=rounded]
  node: server [text="服务端", kind=actor, tone=green, shape=rounded]
  edge: client -> server [label="SYN", marker=end-arrow, line=solid, animated=true]
  edge: server -> client [label="SYN-ACK", marker=end-arrow, line=dashed]
  edge: client -> server [label="ACK", marker=end-arrow, line=solid]
```

## 选择建议

- 单根树结构优先使用 `mind-map`
- 需要分组、流程、双向关系或多条连接时使用 `whiteboard`
- 节点文字尽量简短，长说明放在代码块外的正文中
