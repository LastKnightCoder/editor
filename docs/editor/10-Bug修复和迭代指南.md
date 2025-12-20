# 10 - Bug 修复和功能迭代指南

> 本文档提供 Bug 修复和功能迭代的最佳实践，包括常见问题定位、调试技巧和测试策略。

[← 返回总览](../README-编辑器架构.md) | [← 上一章：核心工具函数](./09-核心工具函数.md)

---

## 10.1 常见问题定位

### 元素无法渲染

**症状**:

- 元素不显示
- 显示 "无法识别的类型 {type}"

**排查步骤**:

1. 检查类型是否添加到 `CustomElement` 联合类型

```typescript
// packages/editor/src/types/custom-element.ts
export type CustomElement =
  | ParagraphElement
  | CodeBlockElement
  | YourNewElement; // ← 是否添加？
```

2. 检查扩展是否注册

```typescript
// packages/editor/src/extensions/index.ts
export const yourExtension = new YourExtension();

export const startExtensions = [
  ai,
  paragraph,
  // ...
  yourExtension, // ← 是否添加？
];
```

3. 检查 `attributes` 和 `children` 是否正确传递

```typescript
// ✅ 正确
<div {...attributes}>
  {/* 内容 */}
  {children}
</div>

// ❌ 错误：缺少 attributes
<div>
  {/* 内容 */}
  {children}
</div>

// ❌ 错误：缺少 children
<div {...attributes}>
  {/* 内容 */}
</div>
```

### 插件不生效

**症状**:

- 快捷键不响应
- 粘贴处理不工作
- Markdown 语法不转换

**排查步骤**:

1. 检查插件是否在 `getPlugins()` 中返回

```typescript
override getPlugins() {
  return [
    myPlugin,  // ← 是否返回？
    createBlockElementPlugin(this.type),
    createVoidElementPlugin(this.type),
  ];
}
```

2. 检查插件顺序

```typescript
// ✅ 正确：自定义插件在前
override getPlugins() {
  return [
    pasteHandler,
    markdownSyntax,
    createBlockElementPlugin(this.type),
  ];
}

// ❌ 错误：Block 插件在前可能被覆盖
override getPlugins() {
  return [
    createBlockElementPlugin(this.type),
    pasteHandler,
    markdownSyntax,
  ];
}
```

3. 检查插件实现

```typescript
export const myPlugin = (editor: Editor) => {
  const { insertText } = editor;

  editor.insertText = (text) => {
    // 自定义逻辑
    if (text === "/") {
      // ...
    }

    // ✅ 必须调用原始函数
    insertText(text);
  };

  // ✅ 必须返回 editor
  return editor;
};
```

### 快捷键不响应

**症状**:

- 按快捷键无反应

**排查步骤**:

1. 检查快捷键配置格式

```typescript
// ✅ 正确
{
  hotKey: "mod+b",
  action: (editor) => { /* ... */ }
}

// ❌ 错误：拼写错误
{
  hotkey: "mod+b",  // 应该是 hotKey
  action: (editor) => { /* ... */ }
}
```

2. 检查 `action` 函数实现

```typescript
// ✅ 正确：阻止默认行为
{
  hotKey: "mod+b",
  action: (editor, event) => {
    Editor.addMark(editor, "bold", true);
    event.preventDefault();  // ← 阻止默认行为
  }
}
```

3. 检查快捷键是否被其他扩展覆盖

```typescript
// 使用浏览器开发工具检查事件监听器
// 或添加日志
console.log("Hotkey configs:", optimizedExtensionData.hotkeyConfigs);
```

### 选区问题

**症状**:

- 光标位置错误
- 选区不正确
- 无法选中内容

**排查步骤**:

1. 检查 void 元素是否设置 `contentEditable={false}`

```typescript
// ✅ 正确
<div {...attributes} contentEditable={false}>
  {/* void 内容 */}
  {children}
</div>

// ❌ 错误：没有设置 contentEditable
<div {...attributes}>
  {/* void 内容 */}
  {children}
</div>
```

2. 检查是否渲染了 `children`

```typescript
// ✅ 正确
<div {...attributes}>
  {/* 内容 */}
  {children}  // ← 必须渲染
</div>

// ❌ 错误：忘记渲染 children
<div {...attributes}>
  {/* 内容 */}
</div>
```

3. 检查规范化逻辑

```typescript
// 使用编辑器的 normalize 方法
Editor.normalize(editor, { force: true });
```

---

## 10.2 调试技巧

### 查看编辑器内容

```typescript
// 打印编辑器内容
console.log(JSON.stringify(editor.children, null, 2));

// 打印选区
console.log(editor.selection);

// 打印当前节点
const [node] = Editor.node(editor, editor.selection.anchor.path);
console.log("Current node:", node);
```

### 监控编辑器操作

```typescript
// 在插件中监控所有操作
export const debugPlugin = (editor: Editor) => {
  const { apply } = editor;

  editor.apply = (op) => {
    console.log("Operation:", op);
    apply(op);
  };

  return editor;
};
```

### 使用 React DevTools

- 查看组件树
- 检查 props 和 state
- 分析渲染性能

### 使用 Slate DevTools

```bash
npm install slate-devtools
```

```typescript
import { withDevTools } from "slate-devtools";

const editor = withDevTools(createEditor());
```

---

## 10.3 测试策略

### 单元测试

**测试工具函数**:

```typescript
import { insertHeader } from "./utils/insertElement";
import { createEditor } from "slate";

describe("insertHeader", () => {
  it("should insert header at empty paragraph", () => {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ];

    insertHeader(editor, 1);

    expect(editor.children).toEqual([
      { type: "header", level: 1, children: [{ type: "formatted", text: "" }] },
    ]);
  });
});
```

### 集成测试

**测试扩展功能**:

```typescript
import { render, fireEvent } from "@testing-library/react";
import { Editor } from "./Editor";

describe("CodeBlock Extension", () => {
  it("should insert code block on Cmd+`", () => {
    const { container } = render(<Editor />);
    const editable = container.querySelector("[data-slate-editor]");

    // 模拟快捷键
    fireEvent.keyDown(editable, { key: "`", metaKey: true });

    // 检查是否插入代码块
    expect(container.querySelector("[data-type='code-block']")).toBeTruthy();
  });
});
```

### E2E 测试

**使用 Playwright**:

```typescript
import { test, expect } from "@playwright/test";

test("should create and edit document", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // 输入文本
  await page.type("[data-slate-editor]", "Hello World");

  // 按快捷键加粗
  await page.keyboard.press("Meta+B");

  // 检查是否加粗
  const bold = await page.locator("strong").innerText();
  expect(bold).toBe("Hello World");
});
```

---

## 10.4 性能分析

### 使用 React Profiler

```typescript
import { Profiler } from "react";

<Profiler
  id="Editor"
  onRender={(id, phase, actualDuration) => {
    console.log(`${id} (${phase}) took ${actualDuration}ms`);
  }}
>
  <Editor />
</Profiler>
```

### 使用 Chrome DevTools

1. 打开 Performance 面板
2. 录制渲染过程
3. 分析火焰图
4. 找出性能瓶颈

### 检查渲染次数

```typescript
const Component = (props) => {
  const renderCount = useRef(0);
  renderCount.current++;

  console.log(`Render count: ${renderCount.current}`);

  return <div>{props.children}</div>;
};
```

---

## 10.5 最佳实践

### 开发流程

1. **理解需求**: 明确要实现的功能和预期行为
2. **设计方案**: 确定实现方案和技术选型
3. **编写代码**: 遵循代码规范和最佳实践
4. **编写测试**: 覆盖核心逻辑和边界情况
5. **代码审查**: 团队成员 review
6. **提交代码**: 提交清晰的 commit message

### 代码规范

**命名规范**:

```typescript
// 组件使用 PascalCase
const CodeBlock = (props) => {
  /* ... */
};

// 函数使用 camelCase
const insertCodeBlock = (editor) => {
  /* ... */
};

// 常量使用 UPPER_SNAKE_CASE
const DEFAULT_LANGUAGE = "javascript";

// 类型使用 PascalCase
interface CodeBlockElement {
  /* ... */
}
```

**文件组织**:

```
extensions/my-extension/
├── index.tsx                    # 扩展主文件
├── components/
│   └── MyComponent/
│       ├── index.tsx            # 组件
│       └── index.module.less    # 样式
├── plugins/
│   ├── plugin1.ts
│   └── plugin2.ts
├── block-panel-items/
│   └── index.ts
├── hotkeys/
│   └── index.ts
└── hovering-bar-configs/
    └── index.ts
```

### 错误处理

```typescript
// ✅ 正确：捕获错误并处理
try {
  const resource = await editor.services?.file.uploadFile(file);
  if (resource) {
    // 更新节点
  }
} catch (error) {
  console.error("Upload failed:", error);
  // 清理或回滚
  Transforms.removeNodes(editor, { at: path });
}

// ❌ 错误：不处理错误
const resource = await editor.services?.file.uploadFile(file);
// 如果失败会导致未处理的 Promise 拒绝
```

### 性能优化

```typescript
// ✅ 使用 React.memo
const MemoizedComponent = React.memo(Component);

// ✅ 使用 useMemo 缓存计算结果
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.order - b.order);
}, [items]);

// ✅ 使用 useCallback 缓存回调
const handleClick = useCallback(() => {
  // 处理逻辑
}, [dependencies]);

// ✅ 使用 useMemoizedFn (ahooks)
const handleChange = useMemoizedFn(() => {
  // 处理逻辑
});
```

---

## 10.6 常见陷阱

### 1. 直接修改状态

```typescript
// ❌ 错误：直接修改节点
const node = editor.children[0];
node.text = "new text"; // Slate 不可变数据模型

// ✅ 正确：使用 Transforms API
Transforms.setNodes(editor, { text: "new text" }, { at: [0] });
```

### 2. 忘记返回 editor

```typescript
// ❌ 错误：没有返回 editor
export const myPlugin = (editor: Editor) => {
  editor.insertText = (text) => {
    // 自定义逻辑
  };
  // 缺少 return editor;
};

// ✅ 正确：返回 editor
export const myPlugin = (editor: Editor) => {
  editor.insertText = (text) => {
    // 自定义逻辑
  };
  return editor;
};
```

### 3. 在渲染中创建新对象

```typescript
// ❌ 错误：每次渲染都创建新对象
const Component = (props) => {
  const style = { padding: "16px" };  // 每次渲染都创建
  return <div style={style}>{props.children}</div>;
};

// ✅ 正确：使用常量
const STYLE = { padding: "16px" };

const Component = (props) => {
  return <div style={STYLE}>{props.children}</div>;
};
```

### 4. 异步操作中使用过期的 path

```typescript
// ❌ 错误：异步操作后 path 可能已过期
const path = ReactEditor.findPath(editor, element);
setTimeout(() => {
  Transforms.setNodes(editor, { src: url }, { at: path }); // path 可能已过期
}, 1000);

// ✅ 正确：在异步操作前保存引用，使用时重新查找
const elementRef = element;
setTimeout(() => {
  try {
    const currentPath = ReactEditor.findPath(editor, elementRef);
    Transforms.setNodes(editor, { src: url }, { at: currentPath });
  } catch (e) {
    // 元素已被删除
  }
}, 1000);
```

---

## 10.7 问题排查检查清单

**元素渲染问题**:

- [ ] 类型是否添加到 `CustomElement`？
- [ ] 扩展是否注册到 `startExtensions`？
- [ ] `attributes` 和 `children` 是否正确传递？
- [ ] void 元素是否设置 `contentEditable={false}`？

**插件问题**:

- [ ] 插件是否在 `getPlugins()` 中返回？
- [ ] 插件顺序是否正确？
- [ ] 插件是否返回 `editor`？
- [ ] 是否调用了原始函数？

**快捷键问题**:

- [ ] 快捷键配置格式是否正确？
- [ ] `action` 函数是否正确实现？
- [ ] 是否调用 `event.preventDefault()`？
- [ ] 是否被其他快捷键覆盖？

**性能问题**:

- [ ] 是否使用 React.memo？
- [ ] 是否使用 useMemo/useCallback？
- [ ] 是否避免在渲染中创建新对象？
- [ ] 是否启用 Chunking？

---

[← 返回总览](../README-编辑器架构.md) | [← 上一章：核心工具函数](./09-核心工具函数.md)
