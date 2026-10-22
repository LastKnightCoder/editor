# @tau/whiteboard

私有源码工作区包，包含通用画布、交互、基础文字、脑图、演示和导出。桌面通过 DesktopWhiteboard 显式组合受信任扩展。包架构、交互内核与扩展指南见 [docs/architecture.md](./docs/architecture.md)。

## 接入

从根入口导入画布、defineWhiteboardExtension、受控 API 与通用组件，从 `@tau/whiteboard/extensions` 导入通用扩展工厂；CSS 使用 `@tau/whiteboard/styles.css`，禁止私有深引。宿主提供 UiProvider、DndProvider 和主题运行时，Tailwind 扫描白板、UI、编辑器及格式/链接扩展源码。React、Slate 与 DnD 使用同一份运行时，完整配置参考 `examples/whiteboard`。

初始化参数只作为初始值；更换文档身份时由宿主更换 key，编辑经 onChange 回传。extensions 必须显式提供且在会话期间保持同一集合。Ref 提供视口适应、缩放、只读元素快照和定位。

```tsx
import WhiteBoard from "@tau/whiteboard";
import { createStandardWhiteboardExtensions } from "@tau/whiteboard/extensions";

const extensions = createStandardWhiteboardExtensions();
<WhiteBoard extensions={extensions} initData={[]} onChange={save} />;
```

## 扩展边界

- 声明包含唯一 id、apiVersion 和 create(api)。一个扩展可以贡献多个元素、命令、工具、菜单、快捷键、属性面板、导入规则和界面层。装配逐扩展先校验后提交，重复声明、命名空间非法、create 抛错或引用不存在的命令时只禁用该扩展并清理其贡献（先到先得），不中断整板装配。
- 正文与媒体的宿主能力经服务注册表注入（见「宿主服务」，D-134）：内置 richtext/mind/clipboard optional 声明 `IWhiteboardRichText`，媒体类扩展 optional 声明 `IResourceService`/`IMediaInfoService`/`IDownloadService`，缺失时回退嵌入式或浏览器实现；导出截图与选择器弹窗、媒体动作白名单、图片组件等纯 UI 配置仍为工厂参数。正文编辑、低缩放订阅和离屏测量共用 Kit 与文档绑定。界面层 position 为 canvas 或 outside；canvas 浮层根节点须带 `CANVAS_OVERLAY_ATTR`，其中的输入不归画布。
- 文档卡仍使用现有 entityRef 与 title 字段，由 createDocumentExtension 组合纸面与阅读层；已有元素 type 和数据格式不变。
- outline：受控开关与宽度；实际占宽回调归所属页面，避免实例串扰。
- API.captureSubmission：异步操作开始时捕获，提交前验证；只读切换、隐藏、卸载和目标删除使旧操作失效。

默认基础文字依赖 @tau/editor；URL 媒体可插入。业务能力缺失时隐藏创建入口，已有业务元素保留数据并显示占位。通用容器仅消费 @tau/ui。

本地上传入口由媒体扩展的 actions 显式声明，选择器通过扩展界面层装配；文件导入为单独扩展。隐藏时结束临时交互并清理 pointerId 归属，执行 activate 返回的清理函数；恢复重新激活，真正卸载执行 dispose。

工具组件只接收 run(payload)，执行声明的命令。菜单与快捷键引用命令 ID；导入规则按集合顺序认领，失败不交给后续规则重复插入。submit 支持 historyGroup，异步结果验证后一次同步提交，不跨 await 持有事务。

useBoard/useWhiteboardAPI 返回受控接口，不返回内核 Board。快照不可写且按对象身份共享副本；元素查询返回副本，修改走 updateElement 或操作提交。元素、界面层与回调异常独立隔离，先提交快照再通知。未知元素保留原始字段与子树，使用占位和元素树管理。

本轮只支持受信任扩展（同进程装配，Obsidian 式），不提供动态安装、沙箱或权限机制。扩展 API 按「将来可迁入 Worker」设计：数据读写一经受控 api、命令参数可序列化、不暴露内部对象引用。

## 第三方扩展数据契约

- 命名空间：扩展 id 必须形如 `<命名空间>.<名称>`，命名空间仅限小写字母、数字与连字符。`tau` 为保留命名空间（内置扩展，其元素可用无点裸 type）；其它命名空间声明的元素 type、命令 id 与贡献 id 必须以 `<命名空间>.` 开头。
- 数据归属：第三方元素的私有数据一律放 `element.data`，顶层字段（id/type/children 等）归内核，内置元素格式不变；`TypedBoardElement<TData>` 提供带类型的元素视图。
- 版本与迁移：元素定义声明 `schemaVersion`（正整数，缺省 1）与 `migrate[n]`（n→n+1，须覆盖 [1, schemaVersion) 全部步骤）。装配后对已加载数据迁移一次（不进历史、不发 change，随下次编辑落库）；插入路径（粘贴/submit/导入）先迁移再插入；数据版本高于扩展或迁移失败时占位渲染、数据原样保留。
- 写入校验：定义可带 `schema`（Standard Schema v1，仅同步返回，zod / valibot 可直接传入），只校验 `element.data`。提交时校验变化元素，不合规抛 `WhiteboardValidationError` 且整批操作不应用；undo/redo 重放不校验；加载只校验迁移产物（不合规回退迁移前原样）；粘贴不合规放弃本次粘贴。
- 冲突与错误报告：任一扩展装配失败只禁用该扩展并清理其 scope，先到先得；经 `WhiteBoard` 的 `onExtensionError` 回调与 console.error 报告（`WhiteboardExtensionError.reason` 见 api.ts），`getRejectedExtensions()` 可查被拒清单。
- 占位原因：未知或异常元素渲染占位并输出 `data-unknown-reason`，取值 missing（类型未注册）/ too-new（数据版本高于扩展）/ migration-failed / disabled（所属扩展被禁用），原始数据与子树保留。

```tsx
import { defineElement } from "@tau/whiteboard/extensions";

interface StampData {
  label: string;
}

const stamp = defineElement<StampData>({
  type: "demo.stamp", // 必须以扩展命名空间开头
  schemaVersion: 2, // 数据结构版本，缺省 1
  migrate: { 1: el => ({ ...el, data: { ...el.data, label: String(el.data.label ?? "") } }) },
  schema: {
    // Standard Schema v1，手写示意；zod / valibot 实例可直接传入
    "~standard": {
      version: 1,
      vendor: "demo",
      validate: value =>
        typeof (value as StampData).label === "string"
          ? { value: value as StampData }
          : { issues: [{ message: "label 必须为字符串" }] },
    },
  },
  render: ({ element }) => <text>{element.data.label}</text>,
  // 声明创建规格后即可注册创建型工具，在画布上手势创建
  create: {
    gesture: "drag", // click / drag / 自定义手势对象
    defaultSize: [160, 80], // 单击时以此尺寸创建，缺省单击不创建
    after: "select", // 创建后选中并回到选择工具（默认）
    build: ctx => ({
      id: crypto.randomUUID(),
      type: "demo.stamp",
      x: ctx.rect.x,
      y: ctx.rect.y,
      width: ctx.rect.width,
      height: ctx.rect.height,
      data: { label: `印章 ${ctx.options?.label ?? ""}` },
    }),
  },
});
```

创建型工具随扩展贡献：`tools` 里给 `element` 字段指向该元素 type 并声明 `label` 与 `icon`，激活后画布按 `create` 规格执行手势；工具参数经 `api.setActiveTool(id, options)` 传入 `build` 的 `options`。第三方工具统一进入「扩展工具」菜单，不占工具栏位。

```tsx
import { defineWhiteboardExtension } from "@tau/whiteboard/extensions";
import { Stamp } from "./icons";

const stampExtension = defineWhiteboardExtension({
  id: "demo.board",
  name: "演示扩展", // 可选展示名（「来自 xxx」）
  create: () => ({
    elements: [stamp],
    tools: [
      {
        id: "demo.stamp.create",
        element: "demo.stamp",
        label: "印章",
        icon: Stamp,
        order: 10,
        group: "drawing",
      },
    ],
  }),
});
```

### 宿主服务

宿主能力（富文本编辑器、上传、媒体探测、下载等）按服务标识注册与获取（D-134）：`@tau/whiteboard/extensions` 重导出 `createServiceId` / `createServiceRegistry`，宿主与扩展作者只依赖白板包即可声明与注册。

- 声明：扩展在 `requires` / `optional` 中列出服务标识（`createServiceId` 产物）。`requires` 中的服务在注册表缺失时拒绝装配该扩展（reason `missing-service`）；`optional` 缺失不影响装配，由扩展显式降级。
- 获取：服务访问只在扩展作用域 api 上提供——`api.getService(id)` 取 requires 声明过的必选服务，`api.tryGetService(id)` 取 requires/optional 声明过的可选服务（未注册返回 undefined）。取未声明的 id、或对 optional 声明的 id 调用 getService 均抛错（编程错误）；主 API 不提供服务访问。扩展 render 内的组件经 `useWhiteboardAPI()` 拿到同一作用域。
- 注册：宿主用 `createServiceRegistry` 构建注册表，经 `<WhiteBoard services={registry}>` 传入；缺省为空注册表（声明了 requires 的扩展会被拒绝装配）。注册值可为实例或 `(registry) => impl` 惰性工厂。

首批服务（一行一个，注明所在包）：

- `IWhiteboardRichText`（`@tau/whiteboard/extensions`）：白板富文本能力（Editor、kit、content{create,update,release,retain,unretain}、Observer、importMarkdown）；因依赖编辑器类型放在白板包，另导出 `createEmbeddedRichTextService()` 作无宿主兜底。
- `IResourceService`（`@tau/shared/host-services`）：上传资源文件，返回可写入文档的地址。
- `IOpenerService`（`@tau/shared/host-services`）：打开外部链接或宿主支持的本地/相对路径。
- `IMediaInfoService`（`@tau/shared/media-services`）：解析图片/视频像素尺寸。
- `IDownloadService`（`@tau/shared/media-services`）：把远程资源保存到宿主侧。

内置扩展消费情况：richtext/mind/clipboard optional `IWhiteboardRichText`（缺失回退 `createEmbeddedRichTextService()`）；图片、视频、音频、文件导入、图片预览、媒体 URL 等扩展 optional `IResourceService` / `IMediaInfoService` / `IDownloadService`（缺失时上传/下载入口隐藏，探测回退浏览器实现）。

```tsx
import {
  defineWhiteboardExtension,
  defineElement,
  IWhiteboardRichText,
  createEmbeddedRichTextService,
} from "@tau/whiteboard/extensions";
import { IResourceService } from "@tau/shared/host-services";

const note = defineElement({ type: "demo.note", render: Note });

export default defineWhiteboardExtension({
  id: "demo.board",
  requires: [IResourceService], // 缺失时扩展被拒（missing-service）
  optional: [IWhiteboardRichText], // 缺失时降级
  create: api => {
    const upload = api.getService(IResourceService).upload;
    const { Editor, kit } =
      api.tryGetService(IWhiteboardRichText) ?? createEmbeddedRichTextService();
    // Note 内用 <Editor kit={kit()} ...> 渲染富文本，upload(file) 上传图片
    return {
      elements: [note],
      commands: [{ id: "demo.note.upload", execute: () => upload(pick()) }],
    };
  },
});
```

只做「声明后才能获取」，不做权限与用户授权；权限与插件清单随应用级插件运行时统一设计。

### 事件

事件分三层（D-131）：内核事件带类型、只有内核能发，扩展只能经 `api.on` 监听，数据类事件（`value:change` / `selection:change` / `viewport:change` / `element:change` / `element:insert` / `element:remove`）的载荷为冻结快照，清单见 api.ts 的 `WhiteboardKernelEvents`；扩展事件形如 `<命名空间>.<名称>`，扩展只能 emit 自己命名空间下的事件、任何扩展都可以监听（`tau.*` 归内置扩展）；`internal:` 前缀事件只在包内使用，订阅与发出都会在运行时抛错。

```tsx
create: api => ({
  activate: () => {
    api.on("element:insert", elements => track(elements)); // 内核事件，载荷为冻结快照
    api.on("demo.stamp.copied", id => reload(id)); // 任意命名空间的扩展事件
    api.emit("demo.stamp.copied", stampId); // 只能发自己命名空间下的事件
  },
});
```

### 快捷键

快捷键经贡献 `hotkeys: [{ key, command }]` 声明（is-hotkey 键串，按 event.key 匹配），只是「按键 → 命令」的绑定：命令 `enabled` 不满足时不拦截按键。仲裁按「内置（tau）优先、第三方按装配顺序」取第一条 enabled 的命令执行，全部不可用则放行；输入法组合、编辑上下文、元素编辑中与演示态一律不响应。mod+k / mod+p / mod+j、alt+left / alt+right、escape 为宿主保留键，声明即拒绝装配。界面上的快捷键文字统一用 `api.getShortcut(commandId)` 获取（按平台格式化），不要自行拼写。

```tsx
create: () => ({
  commands: [{ id: "demo.stamp.duplicate", execute: api => duplicate(api) }],
  hotkeys: [{ key: "mod+d", command: "demo.stamp.duplicate" }], // 键串解析失败也会拒绝装配
});
```

### 收纳

元素经 `containment` 声明自己作为子元素的收纳能力（D-133），不点名具体容器：`canBeContained`（默认 true）为 false 时不进入任何容器；`joins` 列出愿意进入的受限容器类别，目前只有 `"layout"`——子元素位置由容器布局决定（如分栏），进入后宽度随布局变化，元素渲染需要能适应宽度。框架这类自由容器默认接收所有可被收纳的元素。扩展暂不能声明容器。

```tsx
defineElement({ type: "demo.card", containment: { joins: ["layout"] }, render: Card });
defineElement({ type: "demo.stamp", containment: { canBeContained: false }, render: Stamp });
```

## 验证

运行 `pnpm --filter @tau/whiteboard check`、`test`、`bench:hit`、`bench:render`；边界检查为 `pnpm check:whiteboard-boundaries`。独立示例使用 `pnpm --filter @example/whiteboard build`。视觉验收由用户完成。
