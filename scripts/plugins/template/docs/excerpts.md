# 摘录

如果你的插件从外部服务读取划线、批注或收藏（读书笔记、网页高亮、文献批注等），可以把它们写成 Tau 的**摘录**。写入后，用户能在全局搜索和 AI 对话中找到它们，在文档中引用，也能把它们转为卡片或问题。

摘录属于用户：插件停用或卸载后，已经写入的摘录和引用都会保留。

## 注册提供方

写入摘录之前，先在 `activate` 中注册一次提供方：

```ts
const bookPage = context.pages.register({
  id: "book",
  title: "书籍",
  component: BookPage,
  match: "params",
});

context.excerpts.register({
  label: "我的读书笔记",
  open: ({ sourceKey, externalId }) => bookPage.open({ bookId: sourceKey, noteId: externalId }),
});
```

| 字段    | 说明                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| `label` | 摘录来源的显示名称，1 至 100 字。插件停用后仍用它显示来源                                  |
| `open`  | 可选。用户点「打开原处」时调用，通常打开插件自己的页面并定位；省略时打开摘录或来源的 `url` |

每次启用只能注册一次，没有注册就写入会报错。

## 写入

摘录按**来源**分组写入，一个来源可以是一本书、一个网页或一篇文献。写入有两种方式：

```ts
const source = { key: "book-42", title: "设计心理学", url: "https://example.com/books/42" };

// 全量：以这批条目为准，不在其中的已有条目会被移除
await context.excerpts.replace(source, [
  {
    externalId: "n1",
    quote: "好的设计是让人一眼就知道怎么用。",
    location: "第 1 章",
    time: 1760000000000,
  },
  { externalId: "n2", quote: "示能决定了可能的操作。", note: "和交互设计课的观点一致" },
]);

// 增量：只新增、更新或移除指定条目
await context.excerpts.patch(source, {
  upsert: [{ externalId: "n3", quote: "反馈要及时。" }],
  remove: ["n1"],
});
```

外部服务能一次给出某个来源的全部条目时用 `replace`，只拿到变化时用 `patch`。两者都返回 `{ inserted, updated, deleted }`。`replace` 传入空数组表示整个来源已经不存在。

| 来源字段 | 说明                                                    |
| -------- | ------------------------------------------------------- |
| `key`    | 来源在本插件内的稳定标识，必填，最长 512 字             |
| `title`  | 来源标题，最长 500 字                                   |
| `url`    | 可选。http(s) 地址，条目没有自己的 `url` 时用它打开原处 |

| 条目字段     | 说明                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| `externalId` | 条目在本插件内的唯一标识，必填，最长 512 字                                     |
| `quote`      | 摘录原文，必填，最长 20000 字                                                   |
| `note`       | 可选。用户写的想法或批注                                                        |
| `location`   | 可选。给人看的位置，如「第 3 章 · 标题」「第 12 页」，最长 500 字               |
| `url`        | 可选。条目级的 http(s) 深链，优先于来源的 `url`                                 |
| `anchor`     | 可选。插件自己的定位数据，JSON 对象，序列化后不超过 8000 字；Tau 只保存，不解读 |
| `color`      | 可选。划线颜色，最长 50 字                                                      |
| `time`       | 可选。在原服务中的创建时间（毫秒时间戳）                                        |

### externalId 要稳定

Tau 中对一条摘录的引用，靠 `externalId` 找到它。只要 `externalId` 不变，引用就一直有效。

- 用外部数据里稳定的标识生成 `externalId`，例如原服务的笔记 ID。改变生成规则，会让旧摘录被移除、用户的引用失效。
- 被移除的摘录不会真正删除：原文仍然保留，引用仍然能显示。以后同一个 `externalId` 再次写入时，它会恢复。

### 限制

- 单次写入最多 20000 条。同一批中 `externalId` 不能重复，同一次 `patch` 不能同时写入和移除同一条。
- 任何一条不合法时，整批拒绝。
- 外部服务分页返回时，确认拿到完整列表后再调用 `replace`。用不完整的结果覆盖，会误移除条目。

## 读回

```ts
const sources = await context.excerpts.sources(); // [{ key, title, count }]
const entries = await context.excerpts.items("book-42");
```

- `sources()` 列出本插件写入过的来源，`count` 是未移除的条目数。
- `items(sourceKey)` 返回该来源的全部条目，包括已移除的（`deleted: true`），可以用来离线展示，或与外部数据比对。
- 每个条目带有 `ref`，用于下面的材料动作。

## 材料动作

摘录等内容在 Tau 中统称**材料**。`context.materials.actions(ref)` 返回 Tau 当前能对这条材料执行的操作，例如「转为卡片」「转为问题」，适合放在插件自己的列表或详情页里：

```tsx
import { useEffect, useState } from "react";
import { Button } from "@tau/ui";
import type { PluginContext, PluginMaterialAction, PluginMaterialRef } from "@tau/plugins";

function NoteActions({ context, target }: { context: PluginContext; target: PluginMaterialRef }) {
  const [actions, setActions] = useState<PluginMaterialAction[]>([]);
  useEffect(() => {
    void context.materials.actions(target).then(list => {
      if (!context.signal.aborted) setActions(list);
    });
  }, [context, target]);
  return actions.map(action => (
    <Button key={action.id} variant="ghost" onClick={() => void action.run()}>
      {action.label}
    </Button>
  ));
}
```

- `ref` 来自 `excerpts.items()` 返回的条目，原样传回即可，不要自己构造或解析。
- 直接用 `label` 作为按钮文字，不要按 `id` 写死列表，Tau 以后可能增加新的动作。
- 动作执行后由 Tau 给出成功或失败的提示，插件不需要再提示。
