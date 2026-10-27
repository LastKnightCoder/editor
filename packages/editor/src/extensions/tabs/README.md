# Tabs 扩展

`@tau/editor/extensions/tabs` 持有 tabs/tab-pane 两个节点、规范化/退出、插入、面板切换/重命名/删除/拖拽及 DnD 适配，不拆为两个包。

```ts
import { createEditorKit } from "@tau/editor";
import { tabsExtensions } from "@tau/editor/extensions/tabs";

export const kit = createEditorKit({ extensions: tabsExtensions });
```

- 根入口提供 tabsExtensions、默认 tabsExtension、tabPaneExtension、insertTabs 与模型类型；/types 提供模型声明，块内容引用核心公开映射。
- 不新增专用 Markdown 语法或空 codec。现有通用 tau-node 载体保留活动 key、标题及全部面板内容；全部面板内容由 tab-pane 子树承载，不读取或换算旧 tabsContent。
- 宿主样式扫描包含 src，不增加单独 CSS。已有 DndProvider 会复用；每个 tabs 实例持有独立拖拽作用域，复制了相同 key 的其他实例不能重排本组。
- 编辑切换会把现有选区移到新面板；只读切换是本地视图状态，不写 activeKey。添加/删除/重命名验证当前节点，删除最后一个面板回到空段落及光标落点。
- 根级孤儿 pane 提升正文，重命名时输入法组合中的 Enter 不提交。

tabs 通过 ElementSpec.isolateBlockNavigation 声明后代默认块导航由本域接管。核心只读该声明，不识别 tabs 名称；其他扩展也可使用同一声明。它仅影响核心默认方向键和退格相邻块导航，不改变扩展自己调用导航函数的能力。
