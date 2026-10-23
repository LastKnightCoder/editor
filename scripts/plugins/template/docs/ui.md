# 界面

跨端开发包的通用入口用 `context.navigation.registerEntry`，不使用桌面 sidebar API。页面注销会回收相关入口，展示位置由宿主决定；环境与可选能力见[跨端契约](portability.md)。下面的侧边栏、通知等桌面能力不自动包含在 web-v1 中。

下述四种位置描述桌面呈现。移动只有页面/语义入口和插件自己的设置页；commands.v1 提供注册与回收，不自动增加手机命令面板；通知、旧 sidebar、首页/对象/详情扩展未接。具体见 [API 支持矩阵](api-support.md)。

桌面插件可以通过四种方式出现在界面里：

- **命令**：出现在 Ctrl+K 命令面板中，用户搜索后执行。
- **页面**：一个完整的 React 页面，和 Tau 自己的页面一样参与前进、后退。
- **侧边栏入口**：在侧边栏放一个条目，点击打开某个页面。
- **设置**：插件详情页「设置」中的一个区域。

另外，插件可以随时发送**通知**。

这些都在 `activate(context)` 里注册，插件停用时自动撤销。

## 命令

```ts
context.commands.register({
  id: "reset-count",
  title: "重置计数",
  run: async () => {
    await context.storage.set("count", 0);
    return null;
  },
});
```

| 字段    | 说明                                                                |
| ------- | ------------------------------------------------------------------- |
| `id`    | 局部 ID，见 [ID 规则](plugin-basics.md#id-规则)                     |
| `title` | 命令标题，用户在命令面板里按它搜索                                  |
| `run`   | 执行函数，可以是异步的。返回值必须是 JSON 值，没有结果时返回 `null` |

- 注册时不会执行命令，用户选中它时才调用 `run`。
- `run` 的参数 `input` 不保证有内容，命令面板执行时不会传自定义参数。需要用户输入时，打开一个页面或设置让用户填写。
- `run` 抛出异常表示执行失败。耗时较长的命令应该在界面上给出进度或结果反馈。

## 页面

```tsx
import type { PluginPageProps } from "@tau/plugins";

function StatsPage({ context }: PluginPageProps) {
  return <h1>统计</h1>;
}

// activate 内
const stats = context.pages.register({ id: "stats", title: "统计", component: StatsPage });
await stats.open();
```

| 字段        | 说明                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| `id`        | 局部 ID                                                                    |
| `title`     | 页面标题                                                                   |
| `component` | React 组件，收到 `context`、`params`、`pageContext` 三个属性               |
| `match`     | 可选。默认 `"single"`，页面只有一个实例；`"params"` 表示按参数区分多个实例 |
| `getId`     | 可选。`match: "params"` 时，用它从参数算出实例身份；默认按全部参数区分     |

`register` 返回页面句柄，提供 `open(params?)` 和 `dispose()`。用 `open` 打开页面，不要自己操作浏览器地址或历史记录。

### 带参数的页面

同一个页面需要展示不同对象（例如不同的书）时，使用 `match: "params"`：

```tsx
function BookPage({ params }: PluginPageProps) {
  return <h1>书籍：{String(params.bookId)}</h1>;
}

const book = context.pages.register({
  id: "book",
  title: "书籍",
  component: BookPage,
  match: "params",
  getId: params => String(params.bookId),
});

await book.open({ bookId: "42" });
```

- 参数是一个扁平对象，值只能是字符串、有限数字或布尔值，不支持数组、嵌套对象和 `null`。
- 已经打开的同一实例会被复用，不会重复打开。
- 有了 `getId`，`{ bookId: "42", tab: "notes" }` 和 `{ bookId: "42" }` 会打开同一个实例；没有 `getId` 时它们是两个实例。

### 向 AI 提供页面上下文

用户在你的页面上和 AI 对话时，AI 可以通过 Tau 内置的「获取当前上下文」工具了解用户正在看什么。用 `pageContext.register` 告诉 AI 当前页面的状态：

```tsx
import { useEffect, useState } from "react";
import type { PluginPageProps } from "@tau/plugins";

function BookPage({ params, pageContext }: PluginPageProps) {
  const [chapter, setChapter] = useState(1);

  useEffect(() => {
    const registration = pageContext.register(() => ({
      bookId: String(params.bookId),
      chapter,
    }));
    return () => {
      registration.dispose();
    };
  }, [pageContext, params.bookId, chapter]);

  // ...
}
```

- 提供函数返回任意 JSON 值，内容和形状完全由你决定。它应该只读取现有状态，不发起请求，也不修改数据。
- 状态变化时像示例一样重新注册，避免提供函数读到旧值。
- 每个页面实例同一时间只有一个提供函数。页面隐藏、卸载或插件停用时会自动清理。
- 只有当前显示的页面实例会被读取。

页面上下文只是让 AI 知道用户在看什么。需要让 AI 能对页面执行操作，另外用 [MCP 工具](mcp.md)提供。

### 页面显示状态与 Esc

页面切走后会保留状态，回来时原样恢复。页面隐藏时组件的 effect 会被清理，回到前台时重新执行，所以把键盘监听、轮询和订阅写在 effect 里，就会自动随页面暂停与恢复。

在 effect 之外的回调里（例如插件命令被执行时），用 `pageContext.isActive()` 判断这个页面是不是当前显示的那一个。

页面里自己做的浮层（非模态抽屉、弹出面板等）要接 Esc 关闭时，用 `pageContext.registerDismiss` 登记，不要自己监听 Esc：

```tsx
function BookPage({ pageContext }: PluginPageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const registration = pageContext.registerDismiss(() => setDrawerOpen(false));
    return () => registration.dispose();
  }, [drawerOpen, pageContext]);

  // ...
}
```

- 用户按 Esc 时，Tau 先关最后登记的浮层，再依次往前；没有浮层时 Esc 不做任何事，不会后退页面。
- 只在页面显示时生效：页面切走后，它登记的浮层不会响应 Esc；回来后自动恢复。插件停用时全部清除。
- `@tau/ui` 的模态 `Dialog`、`Drawer` 和 `Popover`、`Select`、`Menu` 已经自己处理 Esc，不需要登记。

## 侧边栏

侧边栏条目关联一个已注册的页面，点击时打开它，并在该页面显示时高亮。

```ts
import { SIDEBAR_GROUPS } from "@tau/plugins";

const page = context.pages.register({ id: "counter", title: "计数", component: CounterPage });
context.sidebar.registerItem({
  id: "counter",
  title: "计数",
  icon: CounterIcon,
  group: SIDEBAR_GROUPS.daily,
  page,
});
```

| 字段     | 说明                                   |
| -------- | -------------------------------------- |
| `id`     | 局部 ID                                |
| `title`  | 入口名称                               |
| `page`   | 本次启用中注册的页面句柄               |
| `params` | 可选。点击时传给页面的参数             |
| `icon`   | 可选。图标组件，省略时使用默认插件图标 |
| `group`  | 可选。所在分组，省略时放进「插件」分组 |

### 分组

放进 Tau 已有的分组时，使用 `SIDEBAR_GROUPS` 常量：

| 常量                       | 分组 |
| -------------------------- | ---- |
| `SIDEBAR_GROUPS.daily`     | 日常 |
| `SIDEBAR_GROUPS.knowledge` | 知识 |
| `SIDEBAR_GROUPS.learning`  | 学习 |
| `SIDEBAR_GROUPS.ai`        | AI   |
| `SIDEBAR_GROUPS.sharing`   | 分享 |
| `SIDEBAR_GROUPS.plugins`   | 插件 |

也可以创建自己的分组，它会显示在 Tau 的分组之后：

```ts
const group = context.sidebar.registerGroup({ id: "habits", title: "习惯" });
context.sidebar.registerItem({ id: "water", title: "喝水", group: group.id, page });
```

引用自建分组时使用返回的 `group.id`，不要直接写 `"habits"`。没有条目的分组不显示；分组被撤销后，其中的条目移到「插件」分组。

同一个带参数的页面可以注册多个入口，分别传不同的 `params`。

### 角标与子项

`registerItem` 返回的句柄有 `update`，用来显示角标和条目下方的子项。只改传入的字段，可以随时调用：

```ts
const item = context.sidebar.registerItem({ id: "groups", title: "分组", page });

item.update({
  badge: 3,
  children: groups.map(group => ({
    id: group.id,
    title: group.title,
    params: { group: group.id },
    tone: "blue",
    count: group.openCount,
    menu: [
      { title: "编辑分组", run: () => page.open({ group: group.id, edit: true }) },
      { title: "删除分组", danger: true, run: () => removeGroup(group.id) },
    ],
    onDrop: { type: "note", run: noteId => moveNote(noteId, group.id) },
  })),
  action: { title: "新建分组", run: () => page.open({ create: true }) },
});
```

| 字段       | 说明                                                   |
| ---------- | ------------------------------------------------------ |
| `badge`    | 条目右侧的数字，`0` 或 `null` 隐藏；侧栏收起时不显示   |
| `children` | 子项列表，最多 200 个；传 `[]` 清空                    |
| `action`   | 子项列表末尾的一行动作，缺省图标为加号；传 `null` 移除 |

子项的字段：

| 字段     | 说明                                                                      |
| -------- | ------------------------------------------------------------------------- |
| `id`     | 在同一条目内唯一                                                          |
| `title`  | 名称                                                                      |
| `params` | 点击时用这组参数打开条目的页面                                            |
| `tone`   | 可选。色点：`rose`、`orange`、`yellow`、`green`、`blue`、`purple`、`gray` |
| `count`  | 可选。右侧的计数，`0` 不显示                                              |
| `menu`   | 可选。右键菜单，最多 8 条；`danger: true` 显示为红色，并与前面的条目隔开  |
| `onDrop` | 可选。接收拖放：`type` 是拖拽类型，`run` 收到拖拽数据                     |

- 子项只在条目的页面显示、并且侧栏展开时出现。当前页面参数包含子项的 `params` 时，子项显示为选中；再点一次选中的子项，回到条目本身的 `params`。
- 回调出错时，Tau 显示一条通知，侧栏照常工作。插件停用后，回调不会再被调用。
- 拖放只接收本插件拖出的数据。在页面里拖起时，用 `context.sidebar.dragType` 生成拖拽类型：

```tsx
<div
  draggable
  onDragStart={event => event.dataTransfer.setData(context.sidebar.dragType("note"), note.id)}
>
  {note.title}
</div>
```

`dragType` 的参数是局部 ID，大小写不敏感。

### 图标

`icon` 接收组件本身（`icon: CounterIcon`），不是 `<CounterIcon />`，也不是图片地址。图标是一个线性单色的 SVG 组件：

```tsx
import type { PluginIconProps } from "@tau/plugins";

export function WaterDropIcon({ size = 24, strokeWidth = 2, ...props }: PluginIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z" />
    </svg>
  );
}
```

- Tau 会传入 `size`、`strokeWidth`、`className` 和 `aria-hidden`，图标要把它们透传给 `<svg>`。
- 颜色用 `currentColor`，这样会跟随明暗主题和选中状态。不要写死宽高和颜色。
- 也可以直接使用 [lucide-react](https://lucide.dev) 等图标库的组件（先 `pnpm add lucide-react`）。

## 首页面板

在 Tau 的「今日」首页放一块面板，适合展示进度、待处理的条目这类每天会看一眼的内容：

```tsx
import { useEffect, useState } from "react";
import type { PluginHomePanelProps } from "@tau/plugins";

function WeekPanel({ context }: PluginHomePanelProps) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void context.entities.count({ kind: "book" }).then(setCount);
  }, [context]);
  if (count === null) return null;
  return <p>在读 {count} 本书</p>;
}

context.home.registerPanel({
  id: "week",
  title: "本周阅读",
  component: WeekPanel,
  size: "compact",
});
```

| 字段        | 说明                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `id`        | 局部 ID                                                                |
| `title`     | 面板标题，由 Tau 显示在面板顶部                                        |
| `component` | 面板正文，收到 `context`；返回 `null` 时整块不显示                     |
| `size`      | 可选。`wide`（默认）占整行；`compact` 宽度足够时与其他紧凑面板并排显示 |

- Tau 画面板的外框和标题，组件只负责正文，不要再套一层卡片。
- 新面板排在首页末尾。用户点首页右上角的「调整首页」后可以拖动面板调整位置或隐藏，布局随笔记库保存；插件停用后面板消失，重新启用后回到原来的位置。
- 正文渲染出错时，这块面板显示错误和「重试」，不影响首页其他内容。
- 首页只在主窗口显示，打开首页时组件才会渲染；需要随时更新的数据在组件里订阅（如 `context.events`），卸载时取消。

## 对象动作

在卡片、文章、项目文档、材料（划线、PDF 标注、剪藏）、对话消息与命令面板里加一项操作，用户点击时插件收到这个对象：

```ts
import { MessageCircleQuestion } from "lucide-react";

context.actions.register({
  id: "to-question",
  title: "转为问题",
  icon: MessageCircleQuestion,
  targets: ["card", "article", "document"],
  run: async target => {
    const [info] = await context.app.describe([target]);
    // …用 target 新建插件内容并关联
  },
});
```

| 字段      | 说明                                                        |
| --------- | ----------------------------------------------------------- |
| `id`      | 局部 ID                                                     |
| `title`   | 菜单里显示的名称                                            |
| `icon`    | 可选。图标组件（同[侧边栏图标](#图标)），省略时使用默认图标 |
| `targets` | 挂在哪类对象上，见下表                                      |
| `run`     | 用户点击时调用，收到这个对象；参数类型随 `targets` 收窄     |

| 目标           | 出现在                                                           | `run` 收到                                                  |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `card`         | 卡片的「⋯」菜单（卡面、列表、预览、详情）                        | `{ kind: "card", id }`                                      |
| `article`      | 文章的「⋯」菜单（列表、详情）                                    | `{ kind: "article", id }`                                   |
| `document`     | 项目文档树里文档的「⋯」菜单                                      | `{ kind: "document", id }`                                  |
| `material`     | PDF 标注的工具条与标注列表、网页剪藏的「⋯」菜单                  | `{ kind: "material", id }`                                  |
| `chat-message` | 对话消息动作行末尾的「⋯」（主对话、PDF、视频笔记、Notebook）     | `{ kind: "chat-message", session, messageIds, role, text }` |
| `text`         | 命令面板：输入任何文字后，「记录」组末尾出现「标题：输入的文字」 | `{ kind: "text", text }`                                    |

- 插件动作排在 Tau 自己的操作之后、删除之前，几个插件的动作按启用顺序排列。只有图标按钮的地方（PDF 标注、对话消息）由 Tau 加一个「⋯」，插件动作收在里面。
- 用户点过的对象和 `pick` 选中的一样：之后不需要读取权限就能用 `describe` 取标题、用 `EntityRef` 显示、用 `links` 关联；读正文仍需要对应的读取权限。
- 对话消息登记的是所在会话 `session`。消息正文 `text` 由用户亲手交给插件，不需要权限；`messageIds` 是这条消息在会话里的记录 ID，一条回答可能有多条。消息还在生成、尚未保存时不列插件动作。
- 引用了卡片或文章的项目文档，收到的是被引用的卡片或文章。
- 命令面板里的文字由用户亲手输入，不需要权限，也不会登记为引用。
- 只在主窗口出现，独立编辑窗口不列插件动作。`run` 出错时 Tau 显示一条通知。
- `context.materials.actions` 只给 Tau 自己的材料操作，不包含其他插件注册的对象动作。

## 详情区块

在卡片、文章、项目文档详情的正文上方放一小块内容，例如列出关联到这张卡片的插件内容：

```tsx
import type { PluginEntityPanelProps } from "@tau/plugins";

function RelatedNotes({ context, target }: PluginEntityPanelProps) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void context.entities.count({ kind: "note", where: { targetId: target.id } }).then(setCount);
  }, [context, target.id]);
  if (!count) return null;
  return <p>有 {count} 条笔记提到了它</p>;
}

context.views.registerEntityPanel({
  id: "related",
  kinds: ["card", "article", "document"],
  component: RelatedNotes,
});
```

| 字段        | 说明                                                               |
| ----------- | ------------------------------------------------------------------ |
| `id`        | 局部 ID                                                            |
| `kinds`     | 挂在哪类对象的详情里：`card`、`article`、`document`（项目文档）    |
| `component` | 收到 `context` 与 `target`（`{ kind, id }`）；返回 `null` 时不占位 |

- 区块渲染在 AI 洞见报告之后、正文之前，几个插件的区块按启用顺序排列。Tau 不加外框和标题，区块宜小而轻。
- `target` 只是引用：读标题、正文仍按权限，挂在详情里不会自动获得读取权限。引用了卡片或文章的项目文档，收到的是被引用的卡片或文章。
- 用户在详情页之间切换时，组件不会重新挂载，只换 `target`；按 `target` 取数据的 effect 要把它放进依赖。
- 渲染出错时这一块显示错误和「重试」，不影响详情页其他内容。只在主窗口出现，独立编辑窗口不显示。

## 设置

```tsx
import type { PluginSettingsProps } from "@tau/plugins";

function Preferences({ context }: PluginSettingsProps) {
  // 用 context.storage 读写设置值
}

const preferences = context.settings.register({
  id: "preferences",
  title: "计数设置",
  description: "调整计数的步长",
  component: Preferences,
});
```

| 字段          | 说明                                                            |
| ------------- | --------------------------------------------------------------- |
| `id`          | 局部 ID                                                         |
| `title`       | 设置区域的标题                                                  |
| `description` | 可选。说明文字                                                  |
| `component`   | React 组件，收到 `context`                                      |
| `target`      | 服务提供方的配置表单才需要，见[服务提供方](providers/README.md) |

设置区域显示在插件详情页的「设置」里。`register` 返回的句柄提供 `open()`，可以从命令或页面里跳转过去：

```ts
context.commands.register({
  id: "open-preferences",
  title: "打开计数设置",
  run: async () => {
    await preferences.open();
    return null;
  },
});
```

设置值不会自动保存，组件需要自己用 [`context.storage`](storage-and-network.md) 读写。页面和设置同时显示同一份数据时，保存后要刷新另一处的状态，`storage` 本身不会通知变化。模板用 React Query 管理读取、保存和失败状态，可以照着写。

## 通知

```ts
context.notifications.send({
  title: "导入完成",
  body: "新增了 12 条摘录。",
  tone: "ok",
});
```

| 字段      | 说明                                           |
| --------- | ---------------------------------------------- |
| `title`   | 标题，必填，最多 200 字                        |
| `body`    | 可选。正文，最多 5000 字                       |
| `tone`    | 可选。`neutral`（默认）、`ok`、`danger`        |
| `mode`    | 可选。通知出现的位置，见下表                   |
| `sticky`  | 可选。为 `true` 时一直显示，直到用户处理或关闭 |
| `actions` | 可选。最多两个按钮，其中最多一个主按钮         |

| `mode`         | 出现的位置                                             |
| -------------- | ------------------------------------------------------ |
| `auto`（默认） | Tau 窗口在前台时显示在窗口内，否则显示在独立的通知窗口 |
| `in-app`       | 总是显示在窗口内                                       |
| `system`       | 总是显示在独立的通知窗口                               |

通知的来源固定显示为你的插件名称。

### 带按钮的通知

```ts
context.notifications.send({
  title: "扫描完成",
  body: "发现 3 处断开的链接。",
  sticky: true,
  actions: [
    {
      label: "查看",
      primary: true,
      onClick: async () => {
        await reportPage.open();
      },
    },
  ],
});
```

| 按钮字段       | 说明                                                      |
| -------------- | --------------------------------------------------------- |
| `label`        | 按钮文字，最多 100 字                                     |
| `onClick`      | 点击时执行，可以是异步的；执行期间按钮显示加载状态        |
| `primary`      | 可选。是否为主按钮                                        |
| `resolvedText` | 可选。`onClick` 成功后在通知里显示的结果文字，最多 500 字 |

`onClick` 失败时，错误显示在通知里。插件停用后，旧通知上的按钮不再可用。

### 撤销通知

`send` 返回一个 `Disposable`，调用 `dispose()` 撤销这一条通知。插件停用时，它发出的通知会自动撤销。

发送通知不需要权限，也不需要用户操作触发，适合在异步任务完成时提醒用户。返回句柄只表示通知已经发出，不代表用户已经看到。

## 界面组件与样式

插件界面用 React 编写，可以使用 `@tau/ui` 提供的组件，它们会自动适配 Tau 的主题：

```tsx
import { useState } from "react";
import { Button, Dialog, DialogBody, Panel } from "@tau/ui";

export function Help() {
  const [open, setOpen] = useState(false);
  return (
    <Panel>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        查看说明
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="使用说明">
        <DialogBody>数据保存在当前工作区。</DialogBody>
      </Dialog>
    </Panel>
  );
}
```

| 组件         | 常用属性                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `onClick`、`disabled`、`loading`、`loadingText`；`variant` 可选 `primary`、`secondary`、`soft`、`ghost`、`danger`、`danger-soft`                  |
| `Panel`      | 内容容器                                                                                                                                          |
| `Dialog`     | `open`、`onOpenChange`、`title`，`footer` 放操作按钮                                                                                              |
| `DialogBody` | 弹窗正文                                                                                                                                          |
| `Sortable`   | 拖动排序：`items`、`getKey`、`onMove(from, to)`、`renderItem(item, state)`，把 `state.handleProps` 展开到拖动手柄上；手柄获得焦点时方向键前后移动 |

完整的组件列表和属性见 `@tau/ui` 的类型提示。

自己写的样式放在 CSS 文件里，在入口中 `import`：

- 选择器加上插件专属前缀（如 `.yourname-counter`），不要修改 `body` 或 Tau 自身元素的样式。
- 颜色、圆角等使用 Tau 的主题变量（如 `var(--tau-accent)`），这样会跟随用户的主题切换。
- SVG 图片可以直接在 CSS 里用 `url()` 引用，构建时会内联进样式，不需要额外复制文件。
- 如果你用 Tailwind 构建插件样式，可以导入 `@tau/plugins/tailwind.css`，它把 Tau 的主题变量映射成 Tailwind 语义类（如 `bg-surface`、`text-ink-1`）。Tau 不会替插件生成 Tailwind 样式，需要你在构建时自己编译，并按下一节给类名加前缀。

### 用 Tailwind 时加前缀

插件的样式和 Tau、用户的博客模板加载在同一个页面里。Tailwind 的工具类名是通用的：你的 `.flex`、`.hidden` 和宿主的同名类是两条规则，插件样式加载得更晚，会把宿主 `hidden md:flex` 这类响应式写法覆盖掉，表现为宿主或博客的界面在某些宽度下错乱，而且只在用到你的插件的页面出现。

所以 Tailwind 的类名要加插件专属的前缀，和前面说的「选择器加插件专属前缀」是同一条规则。Tailwind 4 在导入主题时声明前缀：

```css
/* src/tailwind.css */
@import "tailwindcss/theme.css" layer(theme) prefix(yourname);
@import "tailwindcss/utilities.css" layer(utilities) source(none);
@import "@tau/plugins/tailwind.css";
@source "./";
```

组件里的类名都写成带前缀的形式，前缀写在最前面，变体跟在后面：

```tsx
<div className="yourname:flex yourname:items-center yourname:gap-2 yourname:md:hidden">
  <span className="yourname:text-ink-2 yourname:hover:text-accent">说明</span>
</div>
```

- 前缀只能用小写字母，取插件名的简写即可，如图册用 `ig`。
- 没写前缀的类名不会生成样式，开发时就能看出来。
- 传给 `@tau/ui` 组件的 `className` 也写带前缀的类名；组件自身的样式由 Tau 提供，不受影响。
- 不在 JSX 里的字符串（如 `style={{ overflow: "hidden" }}`、字段名 `kind: "block"`）不会再被当成类名生成多余的样式。

建议在构建脚本里检查编译结果：Tailwind 产物里出现不带前缀的类选择器就报错，避免漏改的配置把通用类名发布出去。
