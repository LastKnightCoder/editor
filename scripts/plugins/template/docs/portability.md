# 跨端开发契约

当前模板使用尚未发布的 SDK 开发产物和格式 3。不能提交生产插件中心或安装进普通客户端。先按[快速开始](getting-started.md)准备同一 SDK/UI 的本地 tarball，不用旧公开版本冒充新接口。

## 页面与入口

同一个 main.js 可以支持 desktop/android/ios，公共数据模型与业务逻辑保持一致：

```tsx
const page = context.pages.register({ id: "tasks", title: "任务管理", component: TasksPage });
context.navigation.registerEntry({ id: "tasks", title: "任务管理", page });
```

页面声明不自动创建入口。宿主决定入口位于桌面侧栏还是移动功能列表；作者不导入宿主路由或修改 history。页面注销会回收其入口，旧句柄不能继续打开。页面可在 effect 中登记 pageContext.registerLeaveGuard，返回 false 阻止离开，清理时调用返回句柄的 dispose。

## 环境与能力

`context.environment` 每次读取取得当前不可变快照。React 页面和静态编辑器组件通过 `usePluginEnvironment()` 订阅环境变化，不依赖 activate：

```tsx
import { usePluginEnvironment } from "@tau/plugins";
function TasksView() {
  const environment = usePluginEnvironment();
  return environment.layout === "compact" ? <CompactTasks /> : <WideTasks />;
}
```

platform 区分 desktop/android/ios/web/unknown；layout 为 compact/wide/unknown；input 区分 touch/finePointer。宿主更新布局/输入后 hook 刷新；不要将一次解构的快照当成一直变化的引用。platform 与能力集合在会话内固定，更换需重建会话。

能力词表由 SDK 的 `PLUGIN_CAPABILITIES`、`PluginCapability` 提供，当前包括 commands/storage/pages/navigation/settings/ui.dialog/editor.elements/editor.codecs/editor.source 的 `.v1` 版本。它表示接口可用性，不授予数据权限，也不是安全沙箱。

可选能力由作者显式检测：

```ts
if (context.environment.capabilities.includes("settings.v1")) {
  context.settings.register({ id: "preferences", title: "设置", component: Settings });
}
```

模板的设置页、Dialog 都是可选能力，核心计数不依赖它们。UI 组件能够导入，不表示宿主已经完成移动交互适配。

## 跨端清单

格式为 `formatVersion: 3`、`platform: portable`、`profile: web-v1`、`apiVersion: 1`、CJS 单入口。targets 至少包含 desktop/android/ios 中一个，每个平台声明：

| 字段          | 含义                                                      |
| ------------- | --------------------------------------------------------- |
| minAppVersion | 该端最低客户端版本                                        |
| required      | 必需能力，缺少时在模块执行前拒绝                          |
| optional      | 可选能力，不能与 required 重复                            |
| elements      | 编辑器包按节点类型填写 none/render/edit，普通页面包不填写 |

宿主必须显式支持 web-v1，并同时满足平台、版本与必需能力。模板的最低版本用于开发矩阵，不是现有正式客户端已接线的承诺。

编辑器包每个目标必须列出全部节点并与实际贡献一致。none 不装配，render 仅展示，edit 允许编辑和插入；未声明默认 none。受控开发宿主在标准组件和提交 API 中执行等级限制；清单校验本身不改变编辑器行为。

构建工具从 `@tau/plugins/portable` 导入 `validatePortablePluginManifest`、`assertPortablePluginCompatibility` 等纯函数。旧 `@tau/plugins/package` 校验继续拒绝格式 3；不要修改格式号绕过限制。

## 依赖与桌面特有能力

普通依赖打包；React、React DOM、SDK 根入口和 UI 由宿主提供。web-v1 不开放 whiteboard/sync 子入口、host/environment-host 或 Node 模块。构建检查只能发现部分错误，不能证明任意 JS 行为安全。

格式 3 不支持 backend、whiteboard 或 Skill 脚本。需要 Node 时明确选择旧桌面格式 2：移除 profile/targets，填写 platform: desktop 和顶层 minAppVersion，按[后台契约](backend.md)开发。

构建器仍支持旧格式 1/2。`__PLUGIN_PORTABLE__` 是按格式注入的构建常量：跨端默认示例使用 navigation/环境 hook，显式旧桌面格式使用 sidebar/基础页面，没有运行失败后的自动回退。跨端三端产物仍是同一文件。

## 验证口径

同一模板提供 `examples/editor.tsx`。需要编辑器起点时，将 src/index.tsx 改为导出该文件的 default，manifest 添加 editor: true，并在各目标声明 editor.elements.v1 与 `elements: { "example.note": "edit" }`（只展示的平台用 render）。不要为手机另造节点类型；未适配的写入保护与交互仍须宿主验收。

仓库外构建证明类型闭包、依赖与产物；兼容矩阵证明声明校验，不代表真机运行。客户端开发宿主提供页面守卫、标准 Dialog/Drawer 返回、节点提交保护和原生私有包事务；生产中心分发仍未开放。移动源码组件使用草稿保存/取消，复杂手势与真机行为需要分别验收。
