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

- 声明包含唯一 id、apiVersion 和 create(api)。一个扩展可以贡献多个元素、命令、工具、菜单、快捷键、属性面板、导入规则和界面层。重复注册或未解析命令报错；安装失败清理已创建的扩展，不留下半套元素注册。
- 正文、媒体与导出依赖由对应扩展闭包持有，不设置全局宿主服务集合。正文编辑、低缩放订阅和离屏测量共用 Kit 与文档绑定。界面层 position 为 canvas 或 outside；canvas 浮层根节点须带 `CANVAS_OVERLAY_ATTR`，其中的输入不归画布。
- 文档卡仍使用现有 entityRef 与 title 字段，由 createDocumentExtension 组合纸面与阅读层；已有元素 type 和数据格式不变。
- outline：受控开关与宽度；实际占宽回调归所属页面，避免实例串扰。
- API.captureSubmission：异步操作开始时捕获，提交前验证；只读切换、隐藏、卸载和目标删除使旧操作失效。

默认基础文字依赖 @tau/editor；URL 媒体可插入。业务能力缺失时隐藏创建入口，已有业务元素保留数据并显示占位。通用容器仅消费 @tau/ui。

本地上传入口由媒体扩展的 actions 显式声明，选择器通过扩展界面层装配；文件导入为单独扩展。隐藏时结束临时交互并清理 pointerId 归属，执行 activate 返回的清理函数；恢复重新激活，真正卸载执行 dispose。

工具组件只接收 run(payload)，执行声明的命令。菜单与快捷键引用命令 ID；导入规则按集合顺序认领，失败不交给后续规则重复插入。submit 支持 historyGroup，异步结果验证后一次同步提交，不跨 await 持有事务。

useBoard/useWhiteboardAPI 返回受控接口，不返回内核 Board。快照不可写且按对象身份共享副本；元素查询返回副本，修改走 updateElement 或操作提交。元素、界面层与回调异常独立隔离，先提交快照再通知。未知元素保留原始字段与子树，使用占位和元素树管理。

本轮只支持受信任扩展，不提供动态安装、沙箱或权限机制。

## 验证

运行 `pnpm --filter @tau/whiteboard check`、`test`、`bench:hit`、`bench:render`；边界检查为 `pnpm check:whiteboard-boundaries`。独立示例使用 `pnpm --filter @example/whiteboard build`。视觉验收由用户完成。
