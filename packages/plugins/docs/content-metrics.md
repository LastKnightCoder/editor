# 正文字数与空文档

SDK 0.44.0 提供 `EditorMetricRule`，在 `definePlugin` 的静态 `editorMetrics` 注册。它与 `editorCodecs` 并列，不依赖 Markdown 或 `activate`。

## 声明字段

```ts
import type { EditorMetricRule } from "@tau/plugins";

export const editorMetrics = [
  { type: "example.quiz", textFields: ["question", "answers[].text"] },
] as const satisfies readonly EditorMetricRule[];
```

将这份数组作为 `definePlugin({ ...meta, editorExtensions, editorMetrics })` 的字段；`editorExtensions` 必须注册 `example.quiz`。规则只能声明本插件拥有的节点类型，同类型只能声明一次。字段路径支持对象属性和数组项，例如 `answers[].text`；缺失或非字符串字段不计数。只声明正文，不声明 ID、URL、渲染缓存或编译产物。

题目“天空是什么颜色”、答案“蓝色”合计 9 字。HTML、公式、乐谱等源码节点可声明对应源码字段，文字的分词算法仍由宿主统一执行。纯图片节点可用 `textFields: []` 明确不统计资源元信息。

## 子树与口径

普通 `children` 自动递归，文本叶子的 `text` 自动计数。不要在父节点重新声明 `children[].text`，否则会重复统计。表格、列表与容器的普通子树无需专门规则。正文在其他位置时才使用 `additionalChildren`：

```ts
const foldedList = {
  type: "example.folded-list",
  textFields: [],
  additionalChildren: [{ path: "allContent", when: "isFold", skip: 1 }],
} satisfies EditorMetricRule;
```

`path` 指定附加节点或节点数组；`when` 要求当前节点的布尔字段为 true；`skip` 跳过开头指定项。包装数组可用 `childrenPath` 指定项内的正文；`exclude: { field, equalsField }` 排除项标识与父节点当前标识相同的项。这些声明用于仍有非 children 子树的模型，新增模型优先把全部正文放进 children。

规则是纯数据，不能传入函数，不读取 DOM、网络或生命周期状态。宿主校验后冻结快照，桌面窗口、主进程、移动保存与协作投影使用同一算法。规则换代会失效字数缓存；开发台的动态贡献通过 `metrics` 字段传入，只作用于该工作台。

缺少插件时只统计能解释的文本子树，不猜测私有字段、不把 JSON 序列化长度当字数；私有源码恢复插件后重新计入。规则按当前节点字段解释，不改变节点数据版本或正文。既有数据库 count 为派生缓存，正文再次保存时按当前规则重算。

## 空文档

`wordCount === 0` 不能用于判空、复用草稿或自动删除。图片、分割线、未知节点、只有标点的正文都可能为零字数。宿主自动清理只识别空文本和空段落，结构块及损坏数据保守保留。编辑器的 `ElementSpec.isEmpty` 属于交互语义，继续控制扩展内部的退格和导航，不作为文档自动清理依据。

## 验证

为节点提供普通文本、空文本、嵌套子树及缺少插件的样例。核对页面字数与保存返回值一致，切换折叠不改变总字数，纯媒体保存后不会被当作空草稿复用或删除。构建通过不代表客户端或真机验收通过。
