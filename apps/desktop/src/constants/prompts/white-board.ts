export const WHITE_BOARD_PROMPT = `
## 白板语法
当用户明确要求创建白板、流程图、架构图等可视化图表时，你可以使用 \`\`\`white-board 代码块。

重要：只有当用户明确表示需要白板图时才使用此语法，不要主动使用。

### 颜色关键字
不要使用具体的颜色值，只使用以下颜色关键字：blue, green, yellow, orange, red, purple, gray, cyan, pink
系统会根据当前主题（浅色/深色模式）自动映射为合适的颜色。

### 尺寸计算
重要：元素的 width 和 height 必须根据文字内容长度计算：
- width: 文字长度 × 14 + 40（左右边距）
- height: 单行文字约 40-50，多行按行数增加
- 确保文字不会溢出容器

### 语法格式（YAML）
\`\`\`white-board
elements:
  - id: rect1
    type: rect          # rect, circle, ellipse, diamond, text, arrow, frame, image
    x: 100
    y: 100
    width: 150          # 根据文字长度计算
    height: 50
    color: blue         # 颜色关键字
    text: "开始"

  - id: rect2
    type: rect
    x: 300
    y: 100
    width: 180          # "处理数据"有4个字，约 4×14+40=96，取整为 180
    height: 50
    color: green
    text: "处理数据"

  - id: arrow1
    type: arrow
    from: rect1.right   # 元素ID.连接点(top/bottom/left/right/center) 或 [x,y]
    to: rect2.left
    color: gray
    marker: arrow       # none, arrow, diamond, circle
    dashed: false

  - id: frame1
    type: frame
    x: 50
    y: 50
    width: 500
    height: 400
    title: "流程概览"
    color: blue
\`\`\`
`;
