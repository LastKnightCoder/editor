# 编辑器扩展

编辑器扩展让你在 Tau 的文档里添加自己的块：交互演示、图表、特殊格式的卡片等等。用户从块菜单（输入 `/`）插入你的块，它和 Tau 自带的块一样可以拖动、复制、保存，还会出现在用户发布的博客里。

这一篇先用一个完整的例子走一遍，再逐项介绍扩展能声明的内容。

## 第一个块：计数器

### 1. 在 manifest 中声明

```json
{
  "editor": true
}
```

把这一行加进 `manifest.json`。没有它，Tau 不会加载插件里的编辑器扩展。

### 2. 定义节点和扩展

```tsx
import { useState } from "react";
import { definePlugin, defineEditorElement, defineEditorExtension } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

// 节点的数据结构：除了 type 和 children，其余字段都会随文档保存
interface CounterElement {
  type: "yourname.counter";
  initial: number;
  children: { type: "formatted"; text: string }[];
}

// 登记节点类型，让 TypeScript 认识它
declare module "@tau/plugins" {
  interface EditorElementMap {
    "yourname.counter": CounterElement;
  }
}

function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div className="yourname-counter" contentEditable={false}>
      <button onMouseDown={event => event.preventDefault()} onClick={() => setCount(n => n + 1)}>
        计数：{count}
      </button>
    </div>
  );
}

function CounterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export default definePlugin({
  ...__PLUGIN_META__,
  editorExtensions: [
    defineEditorExtension({
      id: "yourname.counter",
      elements: [
        defineEditorElement<CounterElement>({
          type: "yourname.counter",
          kind: "block",
          isVoid: true,
          drag: true,
          render: ({ attributes, element, children }) => (
            <div {...attributes}>
              <Counter initial={element.initial} />
              {children}
            </div>
          ),
        }),
      ],
      blockPanel: [
        {
          icon: CounterIcon,
          title: "计数器",
          keywords: ["counter", "计数"],
          description: "一个可以点击计数的块",
          onClick: editor =>
            editor.insertNode({
              type: "yourname.counter",
              initial: 0,
              children: [{ type: "formatted", text: "" }],
            }),
        },
      ],
    }),
  ],
});
```

### 3. 构建、安装、重启

`pnpm build` 并安装后，**完全退出并重新打开 Tau**。编辑器扩展在启动时装配，启用、停用和更新都要重启才生效。之后在文档里输入 `/计数器`，就能插入这个块。

这个只有编辑器扩展的插件没有写 `create`。如果插件还需要命令、页面或设置，照常提供 `create` 和 `activate`，两者可以共存。

## 节点

节点是文档里的一块数据。你定义它的结构，Tau 负责保存、复制、撤销和协作。

### 节点数据与组件状态

- **节点字段**（例子中的 `initial`）是文档内容，会随文档保存、同步、发布。
- **组件状态**（例子中的 `useState`）只是这一次显示的状态，刷新后就没了。

需要持久保存的东西放进节点字段。不要把文档内容放进插件的私有存储，那样复制、导出、发布时都会丢失。

### 节点类型的命名

节点 `type` 和扩展 `id` 在所有插件之间必须唯一，建议用你的插件 ID 作前缀，例如 `yourname.counter`、`yourname.chart`。一旦有文档用了这个类型，就不要再改名，否则已有的块会失效。

### 节点的声明

| 字段        | 说明                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- |
| `type`      | 节点类型                                                                                  |
| `kind`      | `"block"`（块级）或 `"inline"`（行内）                                                    |
| `render`    | 渲染组件，见下文                                                                          |
| `isVoid`    | 可选。为 `true` 时节点没有可编辑的文字，内容完全由组件渲染（如图表、演示）                |
| `drag`      | 可选。为 `true` 时显示拖动手柄，用户可以拖动这个块。不声明就不能拖动                      |
| `isEmpty`   | 可选。判断节点是否为空。内容保存在自定义字段（如源码）里时，用它告诉 Tau 什么情况下算空块 |
| `behaviors` | 可选。光标在节点内时，接管回车、退格、输入等行为，见[行为](#行为)                         |

### 渲染组件

`render` 组件收到三个属性：`attributes`、`element`、`children`。

```tsx
render: ({ attributes, element, children }) => (
  <div {...attributes}>
    <MyWidget data={element} />
    {children}
  </div>
);
```

- `attributes` 必须展开到最外层元素上，`children` 必须渲染出来。即使是 `isVoid` 节点也一样，这是编辑器追踪光标所需要的。
- 组件里不可编辑的部分加上 `contentEditable={false}`。
- 组件里的按钮在 `onMouseDown` 中调用 `event.preventDefault()`，避免点击时编辑器失去光标。

### 修改节点字段

组件里需要修改节点数据（例如保存用户调整后的参数）时，使用 `useSourceBlock` 返回的 `update`：

```tsx
import { useSourceBlock } from "@tau/plugins";

function Counter({ element }: { element: CounterElement }) {
  const { update } = useSourceBlock(element);
  return (
    <button
      onMouseDown={event => event.preventDefault()}
      onClick={() => update({ initial: element.initial + 1 })}
    >
      计数：{element.initial}
    </button>
  );
}
```

`update` 把传入的字段合并进节点，这次修改会进入撤销记录并同步给协作者。

## 扩展能声明的内容

`defineEditorExtension` 接收：

| 字段              | 说明                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `id`              | 扩展 ID，全局唯一                                                       |
| `elements`        | 节点声明，至少一个                                                      |
| `blockPanel`      | 块菜单（`/` 菜单）中的条目                                              |
| `commands`        | 编辑器命令                                                              |
| `hotkeys`         | 快捷键，绑定到命令                                                      |
| `menu`            | 块的手柄菜单和右键菜单中的条目                                          |
| `behaviorsFor`    | 挂在其他节点类型上的行为，用来实现快捷语法                              |
| `styleSources`    | 节点里的 Tailwind 源码字段，见[动态 Tailwind 样式](#动态-tailwind-样式) |
| `htmlSerializers` | 静态 HTML 导出，见 [HTML 导出](#html-导出)                              |

### 块菜单

`blockPanel` 的每一项会出现在用户输入 `/` 后弹出的菜单里：

| 字段          | 说明                                         |
| ------------- | -------------------------------------------- |
| `icon`        | 图标组件，接收 `className`                   |
| `title`       | 标题                                         |
| `description` | 说明                                         |
| `keywords`    | 搜索关键词，用户输入这些词时会匹配到这一项   |
| `onClick`     | 选中时调用，收到当前编辑器，通常用来插入节点 |
| `children`    | 可选。子菜单                                 |

`onClick` 收到的 `editor` 提供 `insertNode`、`setNodes`、`removeNodes` 等编辑器方法。插入后需要立即编辑的源码类块，用 `insertSourceBlock`，见[源码预览块](#源码预览块)。

`blockPanel` 也可以是一个函数 `(editor) => items`，每次打开菜单时求值。

### 命令与快捷键

命令是编辑器里的动作，快捷键和菜单都通过命令 ID 触发它：

```tsx
defineEditorExtension({
  id: "yourname.counter",
  elements: [/* ... */],
  commands: [
    {
      id: "yourname.counter.reset",
      title: "重置计数",
      run: (editor, { path }) => {
        if (path) editor.setNodes({ initial: 0 }, { at: path });
      },
    },
  ],
  hotkeys: [{ key: "mod+shift+0", command: "yourname.counter.reset" }],
  menu: [{ id: "yourname.counter.reset", title: "重置计数", command: "yourname.counter.reset" }],
});
```

| 命令字段 | 说明                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`     | 命令 ID，全局唯一，建议以扩展 ID 作前缀                                                                                           |
| `title`  | 可选。显示名称                                                                                                                    |
| `when`   | 可选。`(editor) => boolean`，返回 `false` 时快捷键跳过、菜单项变灰                                                                |
| `run`    | `(editor, context) => void`。`context` 包含触发它的 `event`、调用方的 `payload`，从菜单触发时还有目标节点 `element` 和它的 `path` |

| 快捷键字段 | 说明                                                                             |
| ---------- | -------------------------------------------------------------------------------- |
| `key`      | 按键组合，如 `"mod+shift+k"`，`mod` 在 macOS 上是 ⌘，其他系统是 Ctrl；可以传数组 |
| `command`  | 要执行的命令 ID                                                                  |
| `fallback` | 可选。为 `true` 时只在其他扩展的快捷键都没有处理时才尝试                         |

命令执行出错时，Tau 会隔离错误，不影响编辑器的其他功能。异步命令返回 Promise 即可。

### 菜单

`menu` 中的条目出现在你的块的手柄菜单和右键菜单里：

| 字段             | 说明                                                  |
| ---------------- | ----------------------------------------------------- |
| `id`             | 条目 ID，同一份菜单内唯一                             |
| `title`          | 标题，可以是函数 `(ctx) => string`，打开菜单时求值    |
| `icon`           | 可选。图标，同样可以是函数                            |
| `command`        | 点击时执行的命令 ID；只有子菜单的父条目可以省略       |
| `payload`        | 可选。传给命令的参数，命令在 `context.payload` 中读取 |
| `when`           | 可选。返回 `false` 时不显示这一项                     |
| `disabled`       | 可选。返回 `true` 时这一项变灰                        |
| `group`、`order` | 可选。分组与排序                                      |
| `danger`         | 可选。危险操作，以警示色显示                          |
| `children`       | 可选。子菜单                                          |

函数形式的字段收到 `{ editor, element, path }`，即菜单针对的块。

### 行为

`behaviors` 写在节点声明里，在光标位于该节点内时接管按键：

| 行为                                         | 时机               |
| -------------------------------------------- | ------------------ |
| `insertBreak(editor, [node, path])`          | 按回车             |
| `deleteBackward(editor, [node, path], unit)` | 按退格             |
| `insertText(editor, [node, path], text)`     | 输入文字           |
| `normalize(editor, [node, path])`            | 编辑器规范化节点时 |

每个函数返回 `true` 表示已经处理，返回 `false` 交给外层节点和默认行为。

`behaviorsFor` 写在扩展上，把行为挂到**其他**节点类型上。典型用途是快捷语法：用户在段落里输入某个标记后回车，把段落替换成你的块。

```ts
behaviorsFor: {
  paragraph: {
    insertBreak: (editor, [node, path]) => {
      // 检查段落文字，满足条件时替换成自己的节点并返回 true
      return false;
    },
  },
},
```

## 块会在哪里显示

你的块会出现在两个地方：

- **Tau 桌面端**的编辑器。
- **用户发布的博客**。博客使用同一个 `render` 组件，你不需要另写一份。

移动端和浏览器扩展不运行插件，遇到你的块时保留数据，并显示一个通用的占位。

因为同一份代码要在博客里运行，渲染相关的代码需要满足：

- 模块顶层和渲染组件只使用浏览器能力，不导入 Node.js 模块。
- 不依赖 `activate` 里才赋值的变量，也不使用 `context`（存储、页面、服务等只在桌面端的插件运行时里存在）。需要编译服务时，用 [`usePluginServices`](services.md#在编辑器块中使用服务)，并处理拿不到服务的情况。
- JS 和 CSS 自包含：React、`@tau/plugins`、`@tau/ui` 由 Tau 提供，其他依赖会被打进 `main.js`；图片等资源内联。
- 样式用插件自己的类名前缀，不修改 `body` 或 Tau 自身元素的样式。

博客里的文档是只读的，但组件自身的交互（按钮、缩放图表）照常可用；在只读文档里修改节点字段不会被保存。

## 停用与卸载

- 插件停用后，文档里已有的块会保留，显示为「不可用」的占位，不会被删除；重新启用后恢复显示。
- 卸载正在使用的编辑器插件前，需要先停用并重启 Tau。

## Markdown 导入导出

在插件定义上提供 `editorCodecs`，你的块就能参与 Markdown 导入导出、复制为 Markdown 和搜索摘要。没有 codec 的块在导出 Markdown 时会以 Tau 的扩展格式保留，其他工具未必认识。

```ts
export default definePlugin({
  ...__PLUGIN_META__,
  editorExtensions: [counterExtension],
  editorCodecs: [
    {
      type: "yourname.counter",
      isVoid: true,
      // 导出：节点 → Markdown
      serializer: { toMarkdown: element => `::yourname-counter{initial=${element.initial}}` },
      // 导入：Markdown → 节点
      directives: {
        "yourname-counter": attributes => ({
          type: "yourname.counter",
          initial: Number(attributes.initial) || 0,
          children: [{ type: "formatted", text: "" }],
        }),
      },
    },
  ],
});
```

| 字段         | 说明                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `type`       | 对应的节点类型，只能是本插件声明的类型                                                                  |
| `serializer` | 导出。`toMarkdown(element, childrenMarkdown)` 返回 Markdown 字符串                                      |
| `directives` | 导入。按 directive 名（`::name{...}`、`:::name`、`:name[...]`）解析成节点，返回 `null` 表示丢弃         |
| `fence`      | 导入。把指定语言的代码围栏（如 `mermaid` 代码块）认领为节点，源码放进 `property` 字段（默认 `content`） |
| `isVoid`     | 节点是 void 时设为 `true`                                                                               |

- 导入和导出要成对设计：只写 `serializer` 不会自动获得导入能力。
- codec 会在没有界面的环境中单独加载，必须是纯函数。模块顶层不要访问 `window`、`document`。

## 源码预览块

很多块的模式是"上面编辑源码，下面显示预览"，比如图表、公式、组件演示。`SourceBlockEditor` 提供了 Tau 统一的源码预览外壳：源码编辑、全屏、错误提示、删除，以及与相邻块之间的光标移动。

```tsx
import type { ReactNode } from "react";
import { SourceBlockEditor, useSourceBlock } from "@tau/plugins";
import { Code } from "lucide-react";

interface DiagramElement {
  type: "yourname.diagram";
  content: string;
  children: { type: "formatted"; text: string }[];
}

function DiagramBlock({ element, children }: { element: DiagramElement; children: ReactNode }) {
  const { update } = useSourceBlock(element);
  return (
    <SourceBlockEditor
      element={element}
      mode="jsx"
      title="图表"
      icon={Code}
      initValue={element.content}
      onChange={content => update({ content })}
    >
      <DiagramPreview source={element.content} />
      {children}
    </SourceBlockEditor>
  );
}
```

在节点的 `render` 里使用 `DiagramBlock`。`icon` 需要一个 lucide-react 图标，先 `pnpm add lucide-react`。

| `SourceBlockEditor` 属性 | 说明                                     |
| ------------------------ | ---------------------------------------- |
| `element`                | 当前节点                                 |
| `mode`                   | 源码编辑器的语言模式，如 `jsx`、`html`   |
| `title`、`icon`          | 块的标题和图标                           |
| `initValue`              | 源码初始值                               |
| `onChange`               | 源码变化时调用，通常用 `update` 写回节点 |
| `center`、`extend`       | 可选。预览居中、预览区域扩展到更宽       |
| `children`               | 预览内容                                 |

相关工具：

| 接口                                        | 用途                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `useSourceBlock(element)`                   | 返回 `update`（修改节点字段）、`theme`（当前主题）和 `compiler`（Tailwind 编译器，可能为空） |
| `useReportPreviewError(message, { stale })` | 预览出错时上报错误，传 `null` 清除；`stale` 表示是否保留了上一次成功的预览                   |
| `insertSourceBlock(editor, element, line?)` | 插入节点并把光标放进源码编辑器，适合在块菜单的 `onClick` 中使用                              |
| `sourceBlockParagraphBehavior(type)`        | 放进 `behaviorsFor.paragraph`，让用户在段首按退格时进入上方的源码块                          |

`theme.isDark` 表示当前是否为暗色主题，`theme.token(word)` 读取主题色值，预览应随主题变化。`compiler` 只在桌面编辑器中可用，在博客里为空，此时配合下文的 `styleSources` 使用预先生成的样式。

不要在插件里打包自己的编辑器、Slate 或源码编辑器，直接使用这些组件。

## 行内源码

行内的源码节点（如行内公式）使用另一组接口：

| 接口                                  | 用途                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| `useInlineSource(element)`            | 返回 `readOnly`、`compiler`、`update(properties)`、`remove()` |
| `insertInlineSource(editor, element)` | 插入行内节点，适合在菜单中使用                                |
| `InlineSourceBoundary`                | 渲染在行内节点组件里，处理光标进出节点的边界                  |

行内的源码输入弹层由你用 `@tau/ui` 组件实现。只读时只显示预览，不打开编辑弹层；只读状态下 `update` 和 `remove` 不会写入文档。

## 动态 Tailwind 样式

如果节点的源码里写了 Tailwind 类名（比如用户写的组件演示），在扩展上声明哪个字段是源码：

```ts
defineEditorExtension({
  id: "yourname.demo",
  elements: [/* ... */],
  styleSources: [{ type: "yourname.demo", field: "content", language: "tsx" }],
});
```

在博客等不能实时编译样式的地方，Tau 会读取这些字段，提前生成对应的样式。

- 字段的值必须是字符串，`language` 为 `html` 或 `tsx`，只能登记本插件的节点类型。
- 类名要完整地写在源码里。拼接出来的类名（如 `` `bg-${color}` ``）扫描不到。

## HTML 导出

用户把文档导出为 HTML、EPUB 或复制为 HTML 时，你的块默认按未知节点处理，交互组件不会执行。需要更好的导出效果时，提供 `htmlSerializers`：

```ts
defineEditorExtension({
  id: "yourname.counter",
  elements: [/* ... */],
  htmlSerializers: [
    {
      type: "yourname.counter",
      toHtml: element => `<p>计数：${Number(element.initial)}</p>`,
    },
  ],
});
```

`toHtml` 返回 HTML 字符串，文本内容要自己转义。它只用于静态导出，博客里的显示仍然使用 `render`。
