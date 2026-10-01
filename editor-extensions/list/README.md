# 列表扩展

`@tau/editor-list` 将有序列表、无序列表、普通列表项、任务列表及任务项放在同一个完整包，拥有模型、渲染、缩进/移动/退出、规范化、复制/转换、图标选择器和纯编解码。

```ts
import { createEditorKit } from "@tau/editor";
import { listExtensions } from "@tau/editor-list";
import { listMarkdownCodecs } from "@tau/editor-list/markdown";
import "@tau/editor-list/styles.css";

export const kit = createEditorKit({ extensions: listExtensions });
```

- listExtensions 保留五个既有扩展实例和装配顺序；仍可通过 bulletedList/numberedList/listItem/checkList/checkListItem 选择具体实例，需同时安装对应容器和列表项。
- insertBulletList/insertNumberedList/insertCheckList 公开插入操作，沿用空段落替换、非空段落后插入及选区落点，无选区/只读不写入。
- /markdown 提供 listMarkdownCodecs 和五个独立 codec，显式加入处理器；Node 加载与无 DOM 类型检查独立验证。已有类型、图标语法和命令 id 保持。
- /types 提供模型，块级子节点引用核心公开类型映射；这是渲染类型，不作为纯 codec 的依赖。
- /styles.css 拥有嵌套列表折叠悬停规则；宿主还需扫描本包 src 的工具类。

图标选择器自带 emoji-mart；图片上传可选消费 @tau/shared/host-services 的资源服务，普通列表不要求提供上传能力。浮层使用核心公开返回桥，写入验证原元素仍在当前文档。折叠保留图标及其他节点字段；既有 isFold/allContent 数据结构不更名，只读模式不执行结构变更或任务勾选。

核心提供通用节点/段落查询与容器规范化机制，不保留列表类型判断或列表操作。列表的整项/部分复制仍通过 ElementSpec.copy 贡献给核心。
