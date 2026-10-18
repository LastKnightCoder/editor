# 编辑器扩展

在文档中添加自己的块：比如交互演示、图表、特殊格式的卡片。本文还介绍源码预览块和插件 Skill。需要 Tau 0.59.0 或更高版本。

## 定义一个块

先在 `manifest.json` 中加入 `"editor": true`（完整示例见下文），然后在插件定义里声明 `editorExtensions`：

```tsx
import { useState } from "react";
import { definePlugin, defineEditorElement, defineEditorExtension } from "@tau/plugins";

interface CounterElement {
  type: "example.counter";
  initial: number;
  children: { type: "formatted"; text: string }[];
}

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.counter": CounterElement;
  }
}

function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div contentEditable={false}>
      <button onMouseDown={event => event.preventDefault()} onClick={() => setCount(n => n + 1)}>
        计数：{count}
      </button>
    </div>
  );
}

export default definePlugin({
  id: "example.counter",
  name: "计数块",
  version: "1.0.0",
  editorExtensions: [
    defineEditorExtension({
      id: "example.counter",
      elements: [
        defineEditorElement<CounterElement>({
          type: "example.counter",
          kind: "block",
          isVoid: true,
          render: ({ attributes, element, children }) => (
            <div {...attributes}>
              <Counter initial={element.initial} />
              {children}
            </div>
          ),
        }),
      ],
    }),
  ],
});
```

几点说明：

- 节点上的字段（如 `initial`）是文档数据，会随文档保存；组件里的 `useState` 只是本次显示的状态，不会改动原文。不要把文档内容放进插件私有存储。
- `editorExtensions` 与插件定义一起静态导出。只提供编辑器扩展的插件可以省略 `create`；同时有命令、页面或设置时照常提供 `create/activate`。
- 扩展可声明 `elements`、`commands`、`hotkeys`、`menu`、`blockPanel`、`behaviorsFor`，至少包含一个节点类型。`blockPanel` 的 `onClick` 会收到当前编辑器，可用来插入节点。
- 节点类型和扩展 ID 使用自己的命名空间（如 `yourname.chart`），不要与内置或其他插件的类型重名。

完整的 manifest 示例：

```json
{
  "formatVersion": 1,
  "id": "example.counter",
  "name": "计数块",
  "description": "在文档中放入交互计数块。",
  "version": "1.0.0",
  "minAppVersion": "0.59.0",
  "apiVersion": 1,
  "platform": "desktop",
  "format": "cjs",
  "main": "main.js",
  "editor": true
}
```

`styles`、`integrity` 由构建脚本生成，不用手写。

## 启用、停用与卸载

- 编辑器插件的启用、停用和升级在完整重启 Tau 后生效。
- 停用后，文档里已有的节点会保留，并显示为不可用占位，不会被删除；重新启用后恢复显示。
- 卸载正在使用的编辑器插件前，需要先停用并重启。

## 块会在哪里显示

块显示在桌面编辑器和用户发布的博客中，两处直接使用 `elements.render` 中的同一个组件，不需要另写入口。移动端与浏览器扩展不加载插件，遇到插件节点保留原数据并显示通用占位。因此渲染代码要满足：

- 模块顶层和渲染组件能在浏览器中运行，不导入 Electron、Node 或 Tau 客户端内部路径。
- 不依赖 `activate` 中才赋值的变量，也不调用 `context` 的存储、页面、服务等桌面能力。
- React、ReactDOM、`@tau/plugins`、`@tau/ui` 由 Tau 提供，保持模板的 external 配置；其他浏览器兼容的 npm 依赖会打进 `main.js`。
- JS 与 CSS 自包含，图片等静态资源内联为 data URL。
- 样式使用插件自己的类名前缀，不覆盖 `body` 或 Tau 自身组件的样式。
- 只读场景下文档不可编辑，但组件自己的交互（按钮、图表缩放等）照常可用。

## Markdown

在插件定义中提供 `editorCodecs`（类型为 `EditorMarkdownCodec[]`），让自定义节点支持 Markdown 导入导出、复制和搜索摘要。序列化与反序列化需要成对设计，只写输出函数不会自动获得导入能力。

codec 会在后台转换时单独加载，不经过 `create/activate`，所以必须是纯转换函数，模块顶层不能访问 `window`、`document` 或激活后的上下文。

## 源码预览块

`SourceBlockEditor` 复用 Tau 的源码预览组件，包括编辑、全屏、错误条、删除与相邻块导航。它不是第二份渲染入口，放在同一 `elements.render` 组件中使用。

```tsx
import type { ReactNode } from "react";
import { SourceBlockEditor, useSourceBlock } from "@tau/plugins";
import { Code } from "lucide-react";

interface SourceElement {
  type: "example.source";
  content: string;
  children: { type: "formatted"; text: string }[];
}
declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.source": SourceElement;
  }
}

function SourceView({ element, children }: { element: SourceElement; children: ReactNode }) {
  const { update } = useSourceBlock(element);
  return (
    <SourceBlockEditor
      element={element}
      mode="jsx"
      title="示例"
      icon={Code}
      initValue={element.content}
      onChange={content => update({ content })}
    >
      {children}
    </SourceBlockEditor>
  );
}
```

| API                                         | 用途                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SourceBlockEditor`                         | `element/mode/title/icon/initValue/onChange` 为必填；`center/extend/fluid` 控制预览布局，`children` 是预览内容 |
| `useSourceBlock(element)`                   | 返回当前主题 `theme`、可选样式编译器 `compiler` 与节点字段更新函数 `update`；只能在编辑器内调用                |
| `useReportPreviewError(message, {stale})`   | 向源码预览块上报错误，传 null 清除；stale 表示是否保留了上次预览                                               |
| `insertSourceBlock(editor, element, line?)` | 插入或替换空段落并聚焦源码，返回插入路径；不能插入时返回 undefined                                             |
| `sourceBlockParagraphBehavior(type)`        | 放入扩展 `behaviorsFor.paragraph`，支持段首退格聚焦前一源码块                                                  |

`theme` 提供 `isDark` 和 `token(word)`，渲染应响应主题变化。`compiler.compile({source, language})` 返回 Tailwind CSS，language 为 html 或 tsx；它只在桌面编辑器中可用，其他场景读不到编译器，需配合下文的 `styleSources` 使用。这些组件和 hook 由 Tau 提供，不要打包自己的编辑器、Slate React 或源码编辑器实例。

## 动态样式与静态导出

若节点源码中包含动态 Tailwind 类名，在同一个扩展上声明字段：

```ts
defineEditorExtension({
  id: "example.demo",
  elements: [/* 当前扩展的元素定义 */],
  styleSources: [{ type: "example.demo", field: "content", language: "tsx" }],
});
```

在无法运行时编译的场景（如发布的网页），Tau 会据此读取这些节点的 `content` 字段，预先生成样式。源码字段须为字符串，只能登记本插件声明的节点类型。拼接出来的类名（如 `` `bg-${color}` ``）扫描不到，类名要完整写在源码里。

可选 `htmlSerializers: [{type, toHtml(element)}]` 用于复制 HTML、HTML/EPUB 等静态导出，返回 HTML 字符串并自行转义文本。它只用于静态导出，网页显示仍使用 `elements.render`。不声明时按未知节点的默认规则导出，交互式组件在 EPUB 中不会执行。

## 插件 Skill

在 `definePlugin` 的 `skills` 数组中声明 `{id, name, description, content, invocation?}`，为 AI 提供与你的插件配套的写作规范：

| 字段          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| `id`          | 插件内唯一标识；AI 以 `插件ID:技能ID` 引用             |
| `name`        | Skill 页面显示的名称                                   |
| `description` | AI 据此判断何时加载，写清适用场景                      |
| `content`     | 完整的 SKILL.md 正文                                   |
| `invocation`  | 默认 `auto`（AI 自行加载），设为 `manual` 则仅手动点名 |

插件启用后 Skill 才可用，停用时自动移除。Skill 页面会标明它来自你的插件，用户可以调整调用方式、停用或复制到自己的 Skill 目录。目前每个 Skill 只有一份正文，不支持脚本和附件。

正文可以写在单独的 SKILL.md 中，构建时用 esbuild 的 `.md: text` loader 作为字符串导入。
