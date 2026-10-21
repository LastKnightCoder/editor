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
| `resources` | 可选。节点里哪些字段是图片、视频、音频或文件，见[声明资源字段](#声明资源字段)             |

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

组件里需要修改节点数据（例如保存用户调整后的参数）时，使用 `useElement` 返回的 `update`：

```tsx
import { useElement } from "@tau/plugins";

function Counter({ element }: { element: CounterElement }) {
  const { update } = useElement(element);
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

`useElement(element)` 返回：

| 字段                 | 说明                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `readOnly`           | 编辑器是否只读。只读时 `update`、`remove` 不会写入                 |
| `update(properties)` | 把字段合并进节点                                                   |
| `remove()`           | 删除节点                                                           |
| `selected`           | 声明了[外框](#块的外框)的块是否被点选                              |
| `select()`           | 选中外框里的块                                                     |
| `openMenu(position)` | 在指定位置（视口坐标）打开块菜单，条目与右键、块手柄相同；需要外框 |

请始终传入当前渲染拿到的 `element`。节点被替换或组件卸载后，旧对象上的写入会被忽略，不会改到别的块。

### 块的外框

图表、画廊这类整块由组件渲染的节点（`isVoid: true` 的块），在节点声明上加 `frame` 即可得到 Tau 块的公共交互：点击选中并描边、点到别处取消、右键打开块菜单、选中时 Delete / Backspace 删除块并留下空段落、Esc 取消选中，以及块末尾的「添加段落」。

```tsx
defineEditorElement({
  type: "yourname.chart",
  kind: "block",
  isVoid: true,
  frame: { keys: { Enter: "yourname.chart.edit" } },
  render: Chart,
});
```

| 字段              | 说明                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `keys`            | 可选。选中时的按键对应的命令 id，命令收到这个节点（同菜单里的命令） |
| `appendParagraph` | 可选。为 `false` 时不显示末尾的「添加段落」                         |

声明外框后，`render` 只渲染内容：收到的 `attributes` 是空对象、`children` 为空，交给外框处理。组件里用 `useElement(element).selected` 决定是否显示属性条。

### 块的属性条

选中块后浮在块上方的属性条，用 `BlockToolbar`、`BlockToolbarButton`、`BlockToolbarGap` 组成，外观和 Tau 自带的图片块一致。上方放不下时自动翻到下方，点击按钮不会让编辑器失去光标。

```tsx
import { BlockToolbar, BlockToolbarButton, BlockToolbarGap, useElement } from "@tau/plugins";

function Chart({ element }: { element: ChartElement }) {
  const { selected, readOnly, update, openMenu } = useElement(element);
  return (
    <div className="relative">
      {selected && !readOnly && (
        <BlockToolbar label="图表属性">
          <BlockToolbarButton
            title="柱状图"
            active={element.kind === "bar"}
            icon={<BarChart3 size={15} />}
            onClick={() => update({ kind: "bar" })}
          />
          <BlockToolbarGap />
          <BlockToolbarButton
            title="更多"
            icon={<MoreHorizontal size={15} />}
            onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu({ x: rect.left, y: rect.bottom + 6 });
            }}
          />
        </BlockToolbar>
      )}
      <ChartView data={element.data} />
    </div>
  );
}
```

`BlockToolbarButton` 的 `title` 是按钮名称（纯图标按钮悬停时显示），`label` 是显示在图标旁的文字，`shortcut` 在提示里显示快捷键，`active` 表示当前选中的选项。

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
- 样式用插件自己的类名前缀，不修改 `body` 或 Tau 自身元素的样式。用 Tailwind 时同样要加前缀，见[用 Tailwind 时加前缀](ui.md#用-tailwind-时加前缀)；博客模板也是 Tailwind 写的，不加前缀的工具类会让含你的块的页面排版错乱。

博客里的文档是只读的，但组件自身的交互（按钮、缩放图表）照常可用；在只读文档里修改节点字段不会被保存。

在博客里，接口的行为有这些不同：

| 接口                                       | 在博客中                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `useElement`                               | `readOnly` 为 `true`；`selected` 始终为 `false`，按它显示的属性条不会出现 |
| `MediaImage` / `MediaVideo` / `MediaAudio` | 与博客里 Tau 自带的图片、视频、音频块显示方式相同                         |
| `useResource`                              | 原样返回节点里的地址                                                      |
| `useResourceUpload`                        | `undefined`，界面里应隐藏上传入口                                         |
| `useMediaAppearance`                       | 取用户在发布设置里配置的图片外观                                          |
| `useMediaViewer`                           | 打开博客里的图片查看器，浏览这篇正文里的全部图片                          |
| `frame` 外框                               | 只保留显示，不能选中、删除，也没有右键菜单和「添加段落」                  |

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

## 图片、视频与音频

节点里存的图片、视频、音频地址可能是本地路径、远程地址或共享文档里的资源，不能直接交给 `<img>`。用宿主的媒体组件显示，解析方式与 Tau 自带的图片块相同：本地路径转成可加载的地址，远程资源按用户的缓存设置下载，共享文档里的资源经协作服务解析。

```tsx
import { MediaImage, useMediaAppearance } from "@tau/plugins";

function Photo({ element }: { element: PhotoElement }) {
  const appearance = useMediaAppearance();
  return (
    <figure contentEditable={false} data-radius={element.borderRadius ?? appearance?.borderRadius}>
      <MediaImage url={element.url} alt={element.caption} />
    </figure>
  );
}
```

| 接口                         | 用途                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MediaImage`                 | 显示图片，参数为 `url`、`alt`、`className`、`style`、`loading`、`onLoadError` 等                                       |
| `MediaVideo` / `MediaAudio`  | 宿主的视频、音频播放器，参数为 `src` 与原生媒体属性                                                                    |
| `useResource(url, { kind })` | 自己绘制时使用：返回 `src`、`status`（`loading` / `ready` / `error`）与 `retry()`，元素加载失败时调用 `retry` 重新解析 |
| `useResourceUpload()`        | 返回上传函数，把用户选的文件存进当前的资源存储并返回可写入节点的地址；只读编辑器和博客里为 `undefined`                 |
| `useMediaAppearance()`       | 用户设置的媒体默认圆角与阴影（`none` / `sm` / `md` / `lg`）；博客里取发布设置。节点自己有设置时以节点为准              |

`kind` 取 `image`、`video`、`audio`、`file`，决定远程资源的缓存方式。上传的文件不需要自己判断本地还是远端存储，也不要把文件内容写进节点。

### 查看图片

`useMediaViewer(element)` 返回一个函数，调用后打开 Tau 的图片查看器，浏览文档里的全部图片，并定位到这个节点的第 `index` 张（按[声明的资源字段](#声明资源字段)计，从 0 开始）。

```tsx
const openViewer = useMediaViewer(element);
<MediaImage url={item.url} onDoubleClick={() => openViewer(index)} />;
```

### 声明资源字段

节点里存了图片、视频、音频或文件地址时，在节点声明上用 `resources` 写明是哪些字段。Tau 只按这份声明找资源：导出打包、共享给协作者时上传本地文件、灯箱里浏览图片、EPUB 取图，都靠它。没有声明的字段按普通文字原样保留，本地图片不会随内容导出，也不会上传给协作者。

```tsx
defineEditorElement({
  type: "yourname.gallery",
  kind: "block",
  isVoid: true,
  render: Gallery,
  resources: [{ path: "images[].url", kind: "image", alt: "desc", caption: "desc" }],
});
```

| 字段      | 说明                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `path`    | 资源字段的路径。`url` 是节点上的字段，`images[].url` 表示 `images` 数组每一项的 `url`    |
| `kind`    | `image`、`video`、`audio` 或 `file`                                                      |
| `preview` | 可选。同一资源的显示版本（如裁剪结果）所在的字段，与 `path` 末段同层，同样会被导出和上传 |
| `alt`     | 可选。替代文字所在的字段，与 `path` 末段同层，灯箱里显示                                 |
| `caption` | 可选。说明文字所在的字段，与 `path` 末段同层，灯箱里显示                                 |

声明会随笔记库保存，插件停用或在没装插件的设备上，这些资源照样能导出和共享。已经有文档用了的字段不要改名；新增资源字段时补进声明即可。

### 完整示例：图册

[图册插件](https://github.com/LastKnightCoder/tau-plugin-image-gallery)把这一篇里的能力组合成了一个完整的媒体块，可以对照它的源码写自己的块：

| 需要                     | 图册的做法                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| 点选、删除、右键菜单     | 节点声明 `frame`，Enter 绑定「编辑图册」命令，空格绑定「全屏预览」                                      |
| 选中后的属性条           | `useElement(element).selected` 为真时渲染 `BlockToolbar`，切换布局用 `update({ mode })`                 |
| 显示图片                 | 每张图用 `MediaImage`，圆角与阴影在节点没设置时取 `useMediaAppearance()`                                |
| 添加图片                 | 编辑弹窗里调用 `useResourceUpload()` 返回的函数，拿到地址写进 `images`；返回 `undefined` 时隐藏上传按钮 |
| 调整顺序                 | 编辑弹窗里的图片列表用 `@tau/ui` 的 `Sortable`                                                          |
| 看大图                   | 只读时单击、编辑时双击图片，调用 `useMediaViewer(element)(index)`；编辑时单击留给外框选中               |
| 导出、协作、灯箱找到图片 | `resources: [{ path: "images[].url", kind: "image", alt: "desc", caption: "desc" }]`                    |
| Markdown 与 HTML 导出    | `editorCodecs` 每张图导出一行图片链接，`htmlSerializers` 输出静态的横向滚动图片组                       |
| 样式                     | Tailwind 类名统一加 `ig:` 前缀，见[用 Tailwind 时加前缀](ui.md#用-tailwind-时加前缀)                    |

命令和外框按键只知道节点，打开弹窗却要用组件里的状态。图册的做法是：组件把「打开编辑」「预览」两个函数登记到以节点对象为键的 `WeakMap` 里，命令收到 `context.element` 后从这里取出来调用。节点被替换后旧键自然失效，不会打开别的图册。

```tsx
// actions.ts
export const galleryActions = new WeakMap<GalleryElement, { openSettings(): void }>();

// 组件里，登记当前渲染的节点，卸载或换节点时移除
useEffect(() => {
  galleryActions.set(element, { openSettings: () => setEditing(element) });
  return () => void galleryActions.delete(element);
});

// 命令
{ id: "yourname.gallery.edit", run: (_editor, { element }) => galleryActions.get(element)?.openSettings() }
```

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
