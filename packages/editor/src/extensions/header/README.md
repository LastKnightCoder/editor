# 标题扩展

`@tau/editor/extensions/header` 拥有标题模型、渲染、折叠、插入、快捷语法/快捷键、转换菜单和 Markdown codec，核心不认识标题类型。

```ts
import { createEditorKit } from "@tau/editor";
import headerExtension, { createHeaderExtension } from "@tau/editor/extensions/header";
import { headerCodec } from "@tau/editor/extensions/header/markdown";

export const kit = createEditorKit({ extensions: [headerExtension] });
export const expandedKit = createEditorKit({
  extensions: [createHeaderExtension({ disableCollapse: true })],
});
```

- /markdown 提供纯 headerCodec，宿主显式加入 processor.codecs；无 DOM 类型检查与 Node 加载独立验证。
- /types 提供 HeaderElement，保留级别、折叠字段与行内子节点类型。其类型引用核心公开映射；不要把渲染类型声明当作无 DOM codec 入口。
- insertHeader 保留空段落替换/后方插入规则，无选区或只读时不写入。
- resolveHeaderAnchor(editor, index) 按当前文档的顶层标题序号解析 DOM；无编辑器、越界或未挂载返回 null。
- scrollHeaderIntoView(editor, index) 使用同一定位并平滑滚动。原 EditorRef.scrollHeaderIntoView 已移除，宿主传 ref.getEditor()。

宿主样式扫描包含本模块 src，不增加独立 CSS 文件。禁用折叠时持久 collapsed 字段不影响展示；只读折叠保留为当前视图状态，不写文档。折叠动画在状态变化与卸载时取消旧计时器，避免旧回调重新隐藏正文。

生产源码只使用核心公开 API。getParagraphShortcutEntry 只查询段落首文本，标题自己判断快捷语法；块导航查询及折叠图标为通用能力。列表、表格和容器的领域实现不随本模块安装。
