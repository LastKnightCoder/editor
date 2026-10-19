# 文本格式扩展

`@tau/editor/extensions/text-formatting` 拥有标准 marks 的渲染、工具条、命令、快捷键、行内代码输入、类型增强和纯文本 codec。核心只组合 marks，不识别具体格式字段。

```ts
import { createEditorKit } from "@tau/editor";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import "@tau/editor/extensions/text-formatting/styles.css";

export const kit = createEditorKit({ extensions: [textFormattingExtension] });
```

- `/markdown` 导出 textFormattingCodec，显式加入处理器的 textCodecs；不会加载 React 或 Editor。
- `/palette` 是纯色板/渐变数据与计算，供下划线和宿主导出共用。
- `/panels` 是编辑器选区友好的色板面板组件，供关联行内功能复用；引用它不等于安装格式扩展。
- `/types` 持有 Mark/HighlightColor 与 TextMarkMap 增强。
- `/styles.css` 持有内容色板与渐变变量，保留原明暗取值。宿主需要显式导入。

命令 id、持久字段与 fallback 热键顺序保持。工具条使用核心公开的 useToolbarState、ToolbarSubmenu 和 EditorTooltip；compactGroup 由条目声明，核心不保存格式 id 名单。无服务的基础 Kit 仍可编辑段落，是否安装格式由宿主决定。
