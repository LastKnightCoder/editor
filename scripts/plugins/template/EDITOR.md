# 编辑器扩展与博客发布

本模板已锁定 SDK 0.6.0，需要 Tau 0.59.0 及支持编辑器插件的博客模板。基础计数页面示例没有使用本章接口；编写编辑器插件时，在 manifest 中加入 `"editor": true`。

## 作者只定义一份扩展

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

节点数据中的 `initial` 是文档数据，示例中的 `useState` 计数仅属于本次展示，不会修改原文。编辑节点时使用编辑器扩展的操作协议；不要通过插件私有存储替代文档正文。

`editorExtensions` 是静态贡献，与插件定义一起导出。纯编辑器插件可以省略 `create`；有命令、页面或设置时仍可提供 `create/activate`。博客只读取静态扩展，不调用这些桌面生命周期方法。

扩展可声明 `elements`、`commands`、`hotkeys`、`menu`、`blockPanel`、`behaviorsFor`。节点类型和扩展 ID 应使用自己的命名空间，不覆盖内置或其他插件的类型。块面板的 `onClick` 会收到当前编辑器，可使用其节点插入方法。当前不开放原始 Slate 包装器。

本版针对带内容节点的插件，至少需要声明一个节点类型；纯快捷键或工具栏增强不属于本轮发布协议。

`context.editor.register({ scene: "workbench", ... })` 仍只用于开发台实验，不参与正式正文或博客发布；正式扩展使用 `editorExtensions`。

## 清单与启停

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

完整性摘要和样式入口由模板构建脚本生成。无需额外维护 `render.js` 或在清单里重复列出节点类型；Tau 从这份扩展定义取得节点归属。

编辑器插件的启用、停用及升级在完整重启后生效。所有窗口使用同一次启动的贡献快照，避免替换正在编辑的文档、撤销历史和协作实例。停用后旧节点由编辑器保留并显示不可用占位，不自动删除。当前窗口正在使用的编辑器插件需要先停用并重启，再卸载。

编辑器贡献不依赖 `activate` 的完成结果。共享渲染组件不得读取 `activate` 才赋值的上下文；否则博客和辅助编辑窗口无法独立展示它。

## Markdown

可以在同一个定义中提供 `editorCodecs`，类型为 `EditorMarkdownCodec[]`，供桌面渲染端与博客的 Markdown 处理器装配。反序列化与序列化规则需要成对设计；声明一个输出函数不会自动获得导入能力。

已启用插件的 codec 会装配到桌面、主进程索引、转换线程与博客。后台读取同一个 main.js 中的定义，不调用 render/create/activate；codec 必须为纯转换函数，模块顶层不能依赖 window/document 或激活后的上下文。无需再提供 codec 文件或渲染入口。发布正文仍保留原始节点 JSON，不先转成 Markdown；发布搜索摘要等转换使用 codec。

## 发布时会发生什么

1. Tau 取得当前窗口启动时使用的插件版本、节点归属及 JS/CSS 摘要。
2. 发布器重新读取本地包；版本或摘要变化时要求重启，不悄悄换用新代码。
3. 从发布内容收集实际需要的插件，将同一个 main.js 和样式复制到站点的带版本与摘要的路径，向页面注入依赖清单。
4. 预编译博客模板先加载、验证这些文件，再创建 EditorKit 并显示原始节点。发布阶段不重编译模板。

没有对应扩展、包已变化或模板不支持协议时明确报错。已经发布的网站使用它携带的版本，不依赖读者安装 Tau，也不在访问时向插件中心请求最新版。

## 浏览器运行约束

- 模块顶层和内容渲染必须能在浏览器运行，不可直接导入 Electron、Node 或客户端内部路径。
- 使用模板已有的 external 配置，React、ReactDOM、@tau/plugins、@tau/ui 由宿主共享。其他浏览器兼容 npm 依赖随 main.js 打包。
- JS/CSS 需自包含；图片等静态资源可内联为 data URL。首期没有插件任意附件目录的发布协议。
- 样式使用插件自己的类名，避免覆盖 body 或宿主组件的全局样式；不同页面只加载实际需要的插件。
- 博客不提供桌面文件系统、私有存储、主进程编译服务和其他 PluginContext 能力。扩展不能通过渲染触发这些桌面调用。
- 只读指文档不可编辑，不禁止组件自己的交互；图表、按钮等可维护自己的展示状态。
- 当前 CJS 加载方式需要页面允许对应脚本求值。不要自行在站点配置中禁止它后假定插件仍可执行。

跨端共用渲染组件和同一插件版本，但完整视觉一致性仍需要在相同主题、字体和尺寸条件下验收。移动端和浏览器扩展已支持由通用分发加载器装配编辑器插件包，目前没有新增下载管理界面。分发构建直接包装同一个 main.js，不要求作者维护另一个入口。

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

`theme` 提供 `isDark` 和 `token(word)`；渲染应响应主题变化。桌面 `compiler.compile({source, language})` 返回 Tailwind CSS，language 为 html 或 tsx；博客不提供编译器，依赖发布阶段生成的 CSS。这些组件和 hook 由宿主提供，不要打包自己的编辑器、Slate React 或源码编辑器实例。

## 动态样式与静态导出

若节点源码中包含动态 Tailwind 类名，在同一个扩展上声明字段：

```ts
defineEditorExtension({
  id: "example.demo",
  elements: [/* 当前扩展的元素定义 */],
  styleSources: [{ type: "example.demo", field: "content", language: "tsx" }],
});
```

发布器读取节点的 content 字段并编译 CSS；源码字段应为字符串。只有本插件声明的节点类型可登记，不需要另写发布回调。动态拼接类名仍无法被 Tailwind 静态扫描。

可选 `htmlSerializers: [{type, toHtml(element)}]` 用于复制 HTML、HTML/EPUB 等静态导出，返回 HTML 字符串并自行转义文本。它不参与博客渲染；博客始终使用原来的 `elements.render`。不声明时遵循宿主未知节点导出规则，不承诺交互式组件可在 EPUB 中执行。

## 插件 Skill

在 `definePlugin` 的 `skills` 数组声明 `{id, name, description, content, invocation?}`。id 是插件内唯一标识，name 是显示名，description 用于 AI 判断何时加载，content 是完整 SKILL.md 文本；invocation 默认 auto，也可设 manual。

技能在插件启用成功后可用，停用或激活失败时回收。技能页显示「插件」来源，允许用户调整调用模式、停用或复制到自己的技能目录。AI 使用 `插件ID:技能ID` 寻址，可读取 SKILL.md；首版只提供单文档，不声明脚本和附件能力。

技能正文可以写在单独的 SKILL.md 中，构建时通过 esbuild 的 `.md: text` loader 导入到同一个 main.js。博客不会激活 Skill，不需要额外下载技能文件。
