# 用户数据

插件可以读取和修改用户在 Tau 中的内容：卡片、文章、项目文档、待办和日程，也可以创建属于插件自己的内容。这一篇按以下顺序介绍：

1. [权限](#权限)：访问用户数据前必须了解的授权方式。
2. [读取](#读取)、[修改与删除](#修改与删除)、[读写正文](#读写正文)、[订阅变化](#订阅变化)。
3. [选择并打开已有内容](#选择并打开已有内容)：不需要权限，让用户亲手挑选。
4. [嵌入正文编辑器](#嵌入正文编辑器)和[导出、演示与共享](#导出演示与共享)。
5. [插件内容](#插件内容)：插件自己创建的、带正文的内容。

## 权限

### 声明

在 manifest 中列出插件可能用到的权限。这是插件能申请的上限，没有声明的权限永远无法获得：

```json
{ "permissions": ["cards:read", "todos:read", "todos:write"] }
```

| 权限                                                  | 允许                                                 |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `cards:read`、`articles:read`、`documents:read`       | 读取卡片、文章、项目文档及其正文，接收它们的变化事件 |
| `cards:write`、`articles:write`、`documents:write`    | 新建、修改，以及修改正文；项目文档还包括在项目内移动 |
| `cards:delete`、`articles:delete`、`documents:delete` | 删除                                                 |
| `todos:read`、`todos:write`、`todos:delete`           | 读取、新建与修改、删除待办                           |
| `calendar:read`、`calendar:write`、`calendar:delete`  | 读取、新建与修改、删除日程                           |
| `whiteboards:read`、`projects:read`                   | 读取白板、项目的信息                                 |
| `whiteboards:write`、`projects:write`                 | 新建和修改白板、项目（不含画板内容）                 |
| `whiteboards:delete`、`projects:delete`               | 删除白板、空项目                                     |
| `notebooks:read`                                      | 读取 Notebook 的标题                                 |
| `materials:read`                                      | 读取划线、PDF 标注和剪藏的标题                       |
| `chats:read`                                          | 读取 AI 对话的标题，不含消息内容                     |
| `flashcards:read`、`flashcards:write`                 | 闪卡，见[闪卡](flashcards.md)                        |
| `ai:<能力名>`                                         | 使用 Tau 已配置的大模型，见 [AI](ai.md)              |

### 用户如何授权

插件第一次调用需要权限的接口时，Tau 会弹窗询问用户：

- **仅这次**：在插件停用或 Tau 重启前有效。
- **始终允许**：一直有效，直到用户撤销。
- **拒绝**：本次运行内不再询问。连续拒绝 3 次后转为「已阻止」，需要用户到插件详情页手动解除。

Tau 不在前台时不会弹窗，请求会记在插件详情页的「权限」中，等用户回来处理。用户也可以随时在那里撤销授权。

### 处理拒绝

没有获得授权时，接口抛出 `PluginPermissionError`，`reason` 说明原因：

| `reason`      | 含义                                   |
| ------------- | -------------------------------------- |
| `undeclared`  | manifest 没有声明这项权限              |
| `denied`      | 用户拒绝了                             |
| `blocked`     | 用户已阻止，需要到插件详情页解除       |
| `unavailable` | 当前无法询问用户，请求已记入插件详情页 |

推荐的做法是：在页面里捕获这个错误，显示说明和一个「允许访问」按钮，而不是在启动时连续申请。

```tsx
import { PluginPermissionError } from "@tau/plugins";

try {
  setCards((await context.data.cards.query({ limit: 20 })).items);
} catch (error) {
  if (error instanceof PluginPermissionError) setNeedsPermission(error.reason);
  else throw error;
}
```

在用户点击按钮时，可以一次申请多项：

```ts
const granted = await context.permissions.request(["cards:read", "todos:read"]);
```

全部获准时返回 `true`，已获准的不会重复询问。`context.permissions.query(permission)` 查询当前状态（`granted`、`prompt` 或 `denied`），不会弹窗。

权限限制的是这些接口，不是安全隔离：读到的数据插件可以通过网络发送出去，Tau 在授权弹窗中也会如实告诉用户这一点。只申请功能确实需要的权限。

## 读取

### 卡片、文章、项目文档

`context.data.cards`、`context.data.articles`、`context.data.documents` 都提供 `get(id)` 和 `query(query)`：

```ts
const weekAgo = Date.now() - 7 * 86_400_000;
const page = await context.data.cards.query({ updatedAfter: weekAgo, limit: 50 });
for (const card of page.items) console.log(card.title, card.tags);

// 读取下一页
if (page.cursor) {
  const next = await context.data.cards.query({ updatedAfter: weekAgo, cursor: page.cursor });
}

const article = await context.data.articles.get(id); // 不存在时为 null
```

| 查询参数                        | 说明                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `createdAfter`、`createdBefore` | 创建时间范围，毫秒时间戳，包含起点、不包含终点                |
| `updatedAfter`、`updatedBefore` | 修改时间范围，正文的修改也计入                                |
| `tag`                           | 按标签筛选。层级标签按前缀匹配，「读书」也会匹配「读书/小说」 |
| `sort`                          | `updated`（默认）或 `created`，都是倒序                       |
| `limit`                         | 每页 1 至 200 条，默认 50                                     |
| `cursor`                        | 上一页返回的 `cursor`，原样传回即可读取下一页                 |

返回的每一项都有：

| 字段                     | 说明                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `id`                     | 标识                                                               |
| `revision`               | 版本号，修改和删除时要传回，见[修改与删除](#修改与删除)            |
| `title`                  | 标题。卡片本身没有标题字段，这里是 AI 生成的标题或正文开头         |
| `tags`                   | 标签                                                               |
| `wordCount`              | 字数                                                               |
| `createdAt`、`updatedAt` | 创建、修改时间（毫秒）                                             |
| `contentRef`             | 正文的引用，用于[读写正文](#读写正文)。非富文本的项目文档为 `null` |
| `pinned`                 | 卡片和文章：是否置顶                                               |
| `kind`、`projectIds`     | 项目文档：文档类型（如 `document`）、所属项目                      |

`id` 和 `contentRef` 是不透明的字符串，只用于传回 Tau，不要解析或自己拼接。

列表只需要展示几条时，用 `limit` 和时间范围控制读取量，不要一次读完全部数据再筛选。

### 白板与项目

`context.data.whiteboards`、`context.data.projects` 同样提供 `get(id)` 和 `query(query)`，查询参数与上表相同；项目没有标签，不能按 `tag` 查询。

```ts
const boards = await context.data.whiteboards.query({ tag: "课题", limit: 20 });
const projects = await context.data.projects.query({ sort: "created" });
```

| 类型 | 字段                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| 白板 | `id`、`revision`、`title`、`description`、`tags`、`pageCount`（画板页数）、`createdAt`、`updatedAt`        |
| 项目 | `id`、`revision`、`title`、`archived`、`pinned`、`documentCount`（根目录文档数）、`createdAt`、`updatedAt` |

- 画板内容不开放读写，由用户在 Tau 中编辑；白板的 `revision` 只随标题、说明和标签变化。
- 项目的 `revision` 在改名、归档、置顶以及增删文档时都会变化。
- 白板与项目暂没有变化事件，需要时重新查询。

### 项目目录

`projects.tree(id)` 返回项目的文档目录，项目不存在时为 `null`：

```ts
const tree = await context.data.projects.tree(projectId);
// [{ documentId, revision, title, kind, ref?, children: [...] }, ...]

// 新建一篇文档，挂在某篇文档下；省略 parentId 时挂在根目录末尾
const doc = await context.data.documents.create({
  projectId,
  parentId: tree![0].documentId,
  title: "读书笔记",
  content: { markdown: "第一段" },
});

// 把它移到根目录第一位
await context.data.documents.move(
  doc.id,
  { projectId, from: tree![0].documentId, to: null, index: 0 },
  { expectedRevision: doc.revision }
);
```

- 同一篇文档可以挂在多处（多个父文档或多个项目下），这时它在目录里出现多次，`documentId` 相同。`move` 用 `from` 指明移动的是哪一处，`from`、`to` 为父文档 ID，`null` 表示根目录。
- `move` 只在同一项目内移动；不能移到自己或自己的子文档下。`index` 是移动后的序号，从 0 开始，省略时放在末尾。返回文档的新 `revision`。
- 引用卡片或文章的条目带 `ref`，它的正文归被引用的卡片或文章，`documents.get` 读不到这一项，但可以移动。
- 读目录需要 `projects:read`，新建与移动需要 `documents:write`。

### 待办与日程

```ts
const todos = await context.data.todos.query({ completed: false, limit: 20 });
const events = await context.data.calendar.query({ start: "2026-10-19", end: "2026-10-26" });
```

`todos.query` 的参数：

| 参数              | 说明                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `source`          | `all`（默认）、`todo`（独立的待办）、`document`（正文里的勾选项） |
| `completed`       | 按完成状态筛选                                                    |
| `keyword`         | 按关键词筛选                                                      |
| `start`、`end`    | 按截止日期筛选，格式 `YYYY-MM-DD`                                 |
| `limit`、`cursor` | 分页，每页最多 100 条，默认 50                                    |

来自正文勾选项的待办带有 `source`，指明它在哪篇卡片、文章、项目文档或日记里。

`calendar.query` 的 `start`、`end` 必填，可以是 `YYYY-MM-DD` 或带时区的 ISO 时间，每页最多 100 条。

## 修改与删除

```ts
import { PluginConflictError } from "@tau/plugins";

const card = await context.data.cards.create({
  content: { markdown: "# 读书笔记\n\n第一段" },
  tags: ["读书"],
});

try {
  await context.data.cards.update(card.id, { pinned: true }, { expectedRevision: card.revision });
} catch (error) {
  if (error instanceof PluginConflictError) {
    // 用户刚在别处改过这张卡片：重新读取，再决定要不要重试
  } else throw error;
}
```

| 接口                                                      | 可以写的字段                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cards.create` / `cards.update`                           | 新建：`content`、`tags`、`pinned`；修改：`tags`、`pinned`                                            |
| `articles.create` / `articles.update`                     | 新建：`title`（必填）、`content`、`tags`；修改：`title`、`tags`、`pinned`                            |
| `documents.create` / `documents.update`                   | 新建：`projectId`、`parentId`（省略时挂在根目录）、`title`、`content`、`tags`；修改：`title`、`tags` |
| `documents.move(id, { projectId, from, to, index }, ...)` | 在同一项目内移动，见「项目目录」                                                                     |
| `whiteboards.create` / `whiteboards.update`               | `title`（新建时必填）、`description`、`tags`；新建的白板带一张空白画板页                             |
| `projects.create` / `projects.update`                     | 新建：`title`（必填），得到空项目；修改：`title`、`archived`、`pinned`                               |
| `todos.create` / `todos.update`                           | `title`、`dueAt`（`YYYY-MM-DD`、带时区的 ISO 时间或 `null`）                                         |
| `todos.setCompleted(id, completed, ...)`                  | 标记完成或未完成                                                                                     |
| `calendar.create` / `calendar.update`                     | `title`、`start`、`end`、`allDay`、`calendarId`（省略时为默认日历）                                  |
| `*.delete(id, ...)`                                       | 删除卡片、文章、白板、项目、项目文档、待办、日程，限制见下                                           |

全天日程的 `start`、`end` 用 `YYYY-MM-DD`，且 `end` 不包含当天：一个只占 10 月 21 日的全天日程，`end` 是 `2026-10-22`。定时日程用带时区的 ISO 时间。

### 用 revision 避免覆盖别人的修改

每一项数据都带有 `revision`。修改和删除时必须把读到的 `revision` 作为 `expectedRevision` 传回。如果这期间用户或其他插件改过这一项，调用会抛出 `PluginConflictError`，而不是悄悄覆盖。遇到冲突时重新读取，再决定是否重试。修改返回的新对象带有新的 `revision`，连续修改时用它。

修改正文不会改变实体的 `revision`，正文有自己的版本，见下一节。

### 写入后

- 打开中的页面、其他窗口、搜索和云同步都会自动更新，插件不需要做任何通知。
- 插件删除的内容，用户可以在 7 天内从插件详情页的「权限 → 最近删除」中恢复。
- 项目只能删除空项目，里面还有文档时会被拒绝。
- 项目文档会从它挂载的所有位置删除，有子文档时会被拒绝，视频笔记不能由插件删除。恢复时挂回仍然存在的原位置。
- 有子待办的待办不能删除。

## 正文输入

新建卡片、文章、插件内容，以及修改正文时，正文都用同一种写法 `content`，三选一：

```ts
// Markdown：适合 AI 生成或外部导入的文字
await context.data.cards.create({ content: { markdown: "# 标题\n\n正文" } });

// 编辑器节点：与 content.read({ format: "nodes" }) 读到的格式相同，格式完整保留
const source = await context.content.read(card.contentRef, { format: "nodes" });
await context.data.cards.create({ content: { nodes: source!.nodes! } });

// 复制一份已有正文：Tau 内部整份复制，插件拿不到正文内容
await context.data.articles.create({ title: "副本", content: { copyOf: card.contentRef } });
```

| 写法       | 什么时候用                                                                 | 注意                                                 |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `markdown` | 写入纯文字、AI 输出、外部导入                                              | 高亮、颜色、白板嵌入等 Markdown 表达不了的格式会丢失 |
| `nodes`    | 把读到的正文改写后写回，或在多份正文之间搬运内容                           | 结构不对时报错并给出出错节点的路径                   |
| `copyOf`   | 把一份正文完整复制到新卡片、新文章或插件内容里，例如「把这条笔记存为卡片」 | 只需要目标的写入权限，不需要来源的读取权限           |

- `nodes` 只检查结构：顶层是元素，元素有 `type` 和非空的 `children`，文字节点有 `text`。Tau 不认识的节点类型（例如来自未安装的插件）原样保存，安装对应插件后即可正常显示。
- `content.read({ format: "nodes" })` 的结果带 `schemaVersion`。节点结构有不兼容的变化时它会增加，插件可以与 `EDITOR_NODE_SCHEMA_VERSION` 比较，判断自己是否认得这些节点。
- 正文中的待办勾选项由 Tau 维护身份，复制或搬运后各自独立，不需要插件处理。
- `copyOf` 的来源可以是卡片、文章、项目文档或任一插件内容的正文。复制的是当前内容，之后两份互不影响。
- 新建时省略 `content` 得到空正文。

## 读写正文

### 读取

```ts
const snapshot = await context.content.read(card.contentRef);
console.log(snapshot?.markdown, snapshot?.wordCount);
```

- 需要正文所属实体的读取权限，例如卡片正文需要 `cards:read`。正文不存在时返回 `null`。
- 默认返回 Markdown。`{ format: "nodes" }` 返回编辑器节点，可以原样作为 `content: { nodes }` 写回，格式不丢失；同时返回 `schemaVersion`，见「正文输入」。
- 读到的是已保存的内容，用户正在输入的部分最多晚约 1 秒。

### 修改

```ts
const snapshot = await context.content.read(card.contentRef);
const { revision } = await context.content.edit(
  card.contentRef,
  { op: "append", content: { markdown: "今天读完了第三章。" } },
  { expectedRevision: snapshot!.revision }
);
```

| `op`          | 参数               | 作用                                                                                                                            |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `append`      | `content`          | 在末尾加入新内容，原有内容不变；`content` 不能为空                                                                              |
| `prepend`     | `content`          | 在开头加入新内容，原有内容不变；`content` 不能为空                                                                              |
| `replaceAll`  | `content`          | 用新内容替换整篇；`content` 为空时清空正文                                                                                      |
| `replaceText` | `find`、`markdown` | 在 Markdown 文本中把 `find` 替换成 `markdown`，`find` 必须恰好出现一次；整篇会经 Markdown 重建，Markdown 表达不了的格式可能丢失 |

`content` 的三种写法见「正文输入」。

- 需要所属实体的写入权限，例如卡片正文需要 `cards:write`。
- 正文正在编辑器里打开时，修改会立即出现，协作者也能看到。
- **插件的修改不进入编辑器的撤销记录**，用户无法用撤销键退回。修改前确认这是用户想要的。
- `replaceText` 和 `replaceAll` 会把整篇按 Markdown 重建，Markdown 表达不了的格式可能会被简化。只是添加内容时，用 `append` 或 `prepend`。
- 返回新的 `revision`，连续修改时传给下一次调用。

## 订阅变化

```ts
context.events.on(["card.created", "card.updated", "card.deleted"], event => {
  queryClient.invalidateQueries({ queryKey: ["cards"] });
});
```

| 事件                                           | 说明                                        |
| ---------------------------------------------- | ------------------------------------------- |
| `card.created`、`card.updated`、`card.deleted` | 带 `id`。正文修改也算 `updated`             |
| `article.*`、`document.*`                      | 同上。文章移入回收站算 `deleted`            |
| `todos.changed`、`calendar.changed`            | 待办、日程有变化，不带 `id`，需要时重新查询 |
| `workspace.reset`                              | 同步下载替换了整个笔记库，应全部重新读取    |

- 事件只说明哪一项变了，不携带数据，需要时用 `context.data` 重新读取。
- `origin` 表示变化的来源：`{ kind: "plugin", pluginId }` 表示由插件写入，可以用它忽略自己写入引起的事件；其他情况是 `{ kind: "app" }`。待办与日程的事件总是 `app`。
- 同一项在短时间内的多次变化会合并成一次；用户持续输入时，最多每 2 秒一次。
- 接收事件需要对应的读取权限（`workspace.reset` 除外）。还没获得授权时事件不会送达，也不会因此弹窗。
- 订阅在插件停用时自动注销。

## 选择并打开已有内容

插件的页面（如画布、看板）需要引用用户已有的卡片、日记、待办时，用 Tau 的搜索窗口让用户亲手挑选，显示时交给 `EntityRef`，点击时交给 Tau 打开。**这不需要任何权限**：用户亲手选择，就等于同意插件引用这些内容，之后也能随时读到它们的最新标题。

```tsx
import { EntityRef, type PluginEntityRef } from "@tau/plugins";

async function linkExisting() {
  const picked = await context.app.pick({ kinds: ["card", "diary", "todo"], multiple: true });
  // [{ ref: { kind: "card", id: "12" }, title: "读书笔记" }, ...]，用户取消时为空数组
  await context.storage.set("links", picked);
}

// 图标、类型名、最新标题与「已删除」由 Tau 显示，点击即打开
function LinkChip({ link }: { link: { ref: PluginEntityRef } }) {
  return <EntityRef target={link.ref} />;
}
```

| `kind`          | 内容                             | `open` 打开的位置                                                    |
| --------------- | -------------------------------- | -------------------------------------------------------------------- |
| `card`          | 卡片                             | 卡片详情                                                             |
| `article`       | 文章                             | 文章详情                                                             |
| `document`      | 项目文档                         | 所在项目，并选中该文档                                               |
| `diary`         | 日记里的一条记录                 | 当天的日记，并定位到这一条                                           |
| `whiteboard`    | 白板                             | 白板                                                                 |
| `todo`          | 待办                             | 待办详情；正文里的勾选项会打开所在文档并定位                         |
| `event`         | 日程                             | 日程详情                                                             |
| `project`       | 项目                             | 项目                                                                 |
| `notebook`      | Notebook                         | Notebook                                                             |
| `material`      | 划线、PDF 标注、剪藏             | 原处：书中位置、PDF 页面或网页                                       |
| `chat-session`  | AI 对话                          | 对话页；PDF、视频笔记和 Notebook 里的对话不能单独打开，`open` 会抛错 |
| `plugin-entity` | 插件创建的内容（包括其他插件的） | 创建它的插件页面                                                     |

- `pick` 的 `kinds` 决定可选的类型，顺序就是弹窗里的分组顺序；`title` 可以自定义弹窗标题。
- `pick` 和 `open` 都只能在用户操作（点击、按键）之后调用。在定时器或事件回调里调用会抛错。
- 插件拿到的只有引用和选择时的标题，以及之后用 `describe` 读到的最新标题。要读取正文，仍然需要对应的读取权限。
- `ref` 是普通对象，可以存进插件自己的数据；它的 `id` 与 `context.data` 中同类内容的 `id` 一致。
- 目标被删除后，`open` 会抛出「内容不存在」，可以据此提示用户移除这条关联。

### 显示引用

```tsx
// 列表里直接放组件：同一次渲染的引用会合并成一次查询
links.map(link => <EntityRef key={link.ref.id} target={link.ref} />);

// 需要自己排版或排序时，批量读取当前状态，每次最多 200 项
const states = await context.app.describe(links.map(link => link.ref));
// [{ ref, status: "ok", title }, { ref, status: "missing" }, { ref, status: "denied", permission }]
```

| `status`  | 含义                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`      | `title` 为最新标题                                                                                                                              |
| `missing` | 内容已删除                                                                                                                                      |
| `denied`  | 用户没有为这个插件选择过这项内容，插件也没有 `permission` 这项读取权限；`permission` 为 `null` 的类型（日记、其他插件的内容）只能经用户选择获得 |

- 用户选择过的内容、本插件自己创建的内容不需要权限。
- `describe` 不会弹窗。遇到 `denied` 时，可以提示用户，由用户点击后再调用 `context.permissions.request([permission])`。`EntityRef` 在这种情况下自带「允许访问」按钮。
- 不想让用户点击打开时，传 `openable={false}`。`EntityRef` 只能在插件页面里使用。
- 用户卸载插件并选择清除数据时，Tau 会忘记这些选择。

## 嵌入正文编辑器

插件页面里可以直接嵌入 Tau 的正文编辑器，和卡片详情里的编辑器完全一样：实时协作、已安装的编辑器扩展、文档待办都会生效，修改自动保存。

```tsx
import { ContentEditor, ContentPreview, type PluginCard } from "@tau/plugins";

function CardPanel({ card }: { card: PluginCard }) {
  return <ContentEditor contentRef={card.contentRef} placeholder="写点什么" />;
}

function CardRow({ card }: { card: PluginCard }) {
  return <ContentPreview contentRef={card.contentRef} maxBlocks={3} />;
}
```

| 组件             | 属性                                          | 需要的权限                               |
| ---------------- | --------------------------------------------- | ---------------------------------------- |
| `ContentEditor`  | `contentRef`、`readonly`、`placeholder`、`at` | 可编辑时需要写入权限，只读时需要读取权限 |
| `ContentPreview` | `contentRef`、`maxBlocks`（默认 3）           | 读取权限                                 |

- `contentRef` 来自 `context.data` 或 `context.entities` 返回的数据。
- 组件挂载时不会弹窗。还没授权时显示「允许访问」按钮，用户点击后才询问；已拒绝时提示用户到插件详情页修改。
- 用户在组件里的编辑和在卡片详情里一样，可以撤销，产生的事件 `origin` 为 `app`。这一点和 `context.content.edit` 不同。
- `ContentPreview` 显示已保存的内容，编辑中的改动大约 1 秒后反映出来。
- 这两个组件只能在插件页面里使用。

## 导出、演示与共享

导出、全屏演示、协作共享这类自带界面的功能，用 `context.app.run` 交给 Tau 完成，界面与卡片详情中的相同：

```tsx
<button
  onClick={() => void context.app.run("content.export", { ref: card.contentRef, format: "pdf" })}
>
  导出 PDF
</button>
```

| 动作              | 参数                                                | 效果                                     |
| ----------------- | --------------------------------------------------- | ---------------------------------------- |
| `content.export`  | `ref`，`format`：`markdown`、`image`、`pdf`、`epub` | Markdown 直接保存文件，其余打开导出窗口  |
| `content.present` | `ref`                                               | 全屏演示                                 |
| `content.share`   | `ref`                                               | 打开「内容协作」窗口，由用户确认发起共享 |

- 不需要数据权限：界面和确认都由 Tau 提供，插件拿不到正文。
- 只能在用户操作之后调用。内容已删除时抛出「内容不存在」。
- 对应的界面打开后就返回，不等待用户完成导出或结束演示。

## 插件内容

插件可以创建属于自己的内容，例如每周一篇周记、看板上的卡片。每一项都带一份正文，和卡片正文一样实时保存、随云同步。**读写自己的内容不需要任何权限。**

### 一个周记的例子

```tsx
import { ContentEditor, type PluginOwnEntity, type PluginPageProps } from "@tau/plugins";
import { NotebookPen } from "lucide-react";

// activate 内：声明内容类型
context.entities.registerKind({
  kind: "note",
  label: "周记",
  icon: NotebookPen,
  open: { page: "review", params: note => ({ week: note.key }) },
});

// 按周次找到周记，没有就新建
async function noteOf(week: string) {
  return (
    (await context.entities.find("note", week)) ??
    (await context.entities.create({ kind: "note", key: week, title: `${week} 周记` }))
  );
}

// 页面里编辑正文
function NotePanel({ note, at }: { note: PluginOwnEntity; at?: string }) {
  return <ContentEditor contentRef={note.contentRef} at={at} placeholder="这一周想记下什么" />;
}
```

### 内容类型

先用 `registerKind` 声明类型，才能创建这种内容。在 `activate` 中声明，停用时自动撤销。

| 字段          | 说明                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `kind`        | 类型 ID，插件内唯一                                                                            |
| `label`       | 显示的类型名，如「周记」                                                                       |
| `icon`        | 可选。类型图标，写法与[侧边栏图标](ui.md#图标)相同                                             |
| `open`        | 用户在 Tau 中打开这项内容时进入的插件页面：`page` 是页面的局部 ID，`params` 从内容算出页面参数 |
| `mentionable` | 可选。为 `true` 时，用户可以在正文里用 @ 引用这类内容，默认不可以                              |

插件内容会出现在 Tau 的全局搜索、AI 检索、@ 面板、正文中的引用以及脉络与漫步里，并以你声明的 `label` 和 `icon` 显示：

- 用户点击时，Tau 按 `open` 打开你的插件页面。如果命中的是正文中间某处，页面参数会额外带上 `at`，把它原样传给 `<ContentEditor at={params.at}>` 就能滚动到命中位置。
- 插件停用时，Tau 用自带的只读页显示这项内容。
- 图标在声明时渲染一次并随笔记库保存，所以插件停用后、在其他设备上也能正常显示。图标必须是单个 `<svg>`，不超过 16 KB，只按形状显示，颜色跟随主题，多色、渐变和位图不会保留。

### 接口

| 方法                                                  | 说明                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `create({ kind, key, title?, meta?, content? })`      | 新建一项，`content` 为初始正文（写法见「正文输入」），省略时为空。同一类型下 `key` 已存在时抛出 `PluginConflictError` |
| `get(id)`、`find(kind, key)`                          | 读取一项，不存在时为 `null`                                                                                           |
| `query({ kind?, cursor?, limit? })`                   | 按创建时间倒序分页，默认 50 条，最多 200 条                                                                           |
| `update(id, { title?, meta? }, { expectedRevision })` | 修改标题或 `meta`                                                                                                     |
| `delete(id, { expectedRevision })`                    | 删除一项及其正文                                                                                                      |
| `backlinks(id)`                                       | 哪些卡片、文章、项目文档引用了这项内容                                                                                |

- `key` 由你决定，用来找回同一项内容，例如周记用周次 `2026-W43`。
- `meta` 保存少量结构化信息，是不超过 64 KB 的 JSON 对象。大段内容放在正文里。
- 正文用 `ContentEditor` 编辑，或用 `context.content` 读写，不需要权限。
- `delete` 不会弹出确认，需要确认时由插件自己询问用户。删除后，用户可以在插件详情页的「最近删除」中 7 天内恢复，恢复后 ID、`key` 和正文都不变；如果这期间插件用同一个 `key` 新建了内容，则无法恢复。
- `backlinks` 返回 `{ items: [{ ref, title, snippets }], omitted }`。它只列出插件已获准读取的类型（如有 `cards:read` 才列出卡片），不会弹窗询问，其余来源只计入 `omitted`。`ref` 可以直接交给 `context.app.open`。
- 卸载插件后，它创建的内容保留 7 天，期间重新安装就能找回，超过 7 天后删除。
