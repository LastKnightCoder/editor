# 行内注释扩展

`@tau/editor/extensions/annotation` 持有注释节点、脚注编解码、插入命令和查看/编辑浮层，公开 insertAnnotation/isAnnotationActive。

```ts
import { createEditorKit } from "@tau/editor";
import annotationExtension from "@tau/editor/extensions/annotation";

export const kit = createEditorKit({ extensions: [annotationExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 annotationCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本模块 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。浮层使用已有 OverlayBackDismiss 仲裁；只读查看不写入文档。

## 交互

- 正文标记是按文档顺序编号的上标序号（`numbering.ts` 在渲染时计算，不存进数据），与 Markdown 导出的脚注编号一致。不用 CSS counter，因为分块渲染的 `content-visibility` 会让计数在每块重新开始。
- 桌面端：悬停显示只读预览，点击打开编辑卡片（输入即保存、复制、删除，Esc 或 ⌘↵ 关闭）；只读文档点击只能查看。
- 触屏端（`IEditorInteraction.touch`）：点按打开底部抽屉（查看 → 编辑），删除后给撤销提示。抽屉底部避让读 `--ed-overlay-bottom`，宿主按自己的键盘测量赋值；未赋值时只让出安全区。
- `insertAnnotation(editor)` 默认插入空内容并直接打开编辑；关闭时内容为空则移除该注解。
