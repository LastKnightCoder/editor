# 白板绘图

当用户明确要求创建白板、流程图、架构图等可视化图表时，可以使用 ```white-board 代码块。

## 颜色关键字

不要使用具体的颜色值，只使用以下颜色关键字：blue, green, yellow, orange, red, purple, gray, cyan, pink

系统会根据当前主题（浅色/深色模式）自动映射为合适的颜色。

## 语法格式（YAML）

```white-board
elements:
  # 形状元素 - 不需要指定 width/height，系统会根据文字自动计算
  - id: rect1
    type: rect          # rect, circle, ellipse, diamond
    x: 100
    y: 100
    color: blue         # 颜色关键字
    text: "开始"

  - id: rect2
    type: rect
    x: 300
    y: 100
    color: green
    text: "处理数据"

  # 文本元素 - 不需要指定宽高
  - id: text1
    type: text
    x: 100
    y: 200
    text: "说明文字"
    color: gray

  # 箭头连接
  - id: arrow1
    type: arrow
    from: rect1.right   # 元素ID.连接点(top/bottom/left/right/center) 或 [x,y]
    to: rect2.left
    color: gray
    marker: arrow       # none, arrow, diamond, circle
    dashed: false

  # Frame 容器 - 需要指定位置，通过 children 自动计算宽高
  - id: frame1
    type: frame
    x: 50               # Frame 左上角位置
    y: 50
    title: "流程概览"
    color: blue
    children: [rect1, rect2, arrow1]  # 包含的元素ID列表

  # 图片元素 - 需要指定宽高
  - id: img1
    type: image
    x: 100
    y: 300
    width: 200
    height: 150
    src: "https://example.com/image.png"
```

## 注意事项

- rect, circle, ellipse, diamond, text 类型不需要指定 width/height，系统会自动测量
- frame 需要指定 x/y 位置，通过 children 列表自动计算宽高（加 padding）
- image 类型需要明确指定 width/height
