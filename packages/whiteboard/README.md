# @tau/whiteboard

私有源码工作区包，包含通用画布、交互、基础文字、脑图、演示和导出。桌面通过 DesktopWhiteboard 显式组合受信任扩展。

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
- 正文、媒体与导出依赖由对应扩展闭包持有，不设置全局宿主服务集合。正文编辑、低缩放订阅和离屏测量共用 Kit 与文档绑定。界面层 position 为 canvas 或 outside；canvas 浮层根节点须带 `CANVAS_OVERLAY_ATTR`，其中的输入不归画布。
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
});
```

## 验证

运行 `pnpm --filter @tau/whiteboard check`、`test`、`bench:hit`、`bench:render`；边界检查为 `pnpm check:whiteboard-boundaries`。独立示例使用 `pnpm --filter @example/whiteboard build`。视觉验收由用户完成。
