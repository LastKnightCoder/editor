# 界面

插件可以通过四种方式出现在 Tau 的界面里：

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

| 组件         | 常用属性                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `onClick`、`disabled`、`loading`、`loadingText`；`variant` 可选 `primary`、`secondary`、`soft`、`ghost`、`danger`、`danger-soft` |
| `Panel`      | 内容容器                                                                                                                         |
| `Dialog`     | `open`、`onOpenChange`、`title`，`footer` 放操作按钮                                                                             |
| `DialogBody` | 弹窗正文                                                                                                                         |

完整的组件列表和属性见 `@tau/ui` 的类型提示。

自己写的样式放在 CSS 文件里，在入口中 `import`：

- 选择器加上插件专属前缀（如 `.yourname-counter`），不要修改 `body` 或 Tau 自身元素的样式。
- 颜色、圆角等使用 Tau 的主题变量（如 `var(--tau-accent)`），这样会跟随用户的主题切换。
- SVG 图片可以直接在 CSS 里用 `url()` 引用，构建时会内联进样式，不需要额外复制文件。
- 如果你用 Tailwind 构建插件样式，可以导入 `@tau/plugins/tailwind.css`，它把 Tau 的主题变量映射成 Tailwind 语义类（如 `bg-surface`、`text-ink-1`）。Tau 不会替插件生成 Tailwind 样式，需要你在构建时自己编译。
