# 多端插件作者契约

一个 SDK、一套模板、同一插件 ID/版本对应同一 ZIP。普通页面直接使用公共 API；宿主在加载前检查兼容性。具体宿主实现范围见 [API 支持矩阵](api-support.md)，SDK 类型存在不等于所有接口都已在移动端接入。

## 作者清单

作者维护 manifest.json 的身份、目标平台、最低版本和额外需求。包格式、入口、摘要与内部要求由构建器生成。

```json
{
  "id": "example.counter",
  "name": "计数器",
  "description": "保存当前工作区的计数。",
  "version": "1.0.0",
  "categories": ["page"],
  "targets": {
    "desktop": { "minAppVersion": "0.59.2" },
    "android": { "minAppVersion": "0.2.3" },
    "ios": { "minAppVersion": "0.2.3" }
  }
}
```

版本填写实际验证过的下限。声明平台不代表已在该平台通过设备验收，也不控制生产中心的分发开关。

公共应用基础包含 commands、storage、pages、navigation、settings、dialogs，不要求作者逐项填写或调用前查字符串。行为遵循支持矩阵：移动命令注册不自动生成命令面板，通用设置与领域设置共用注册方式，领域设置另声明对应功能。

额外功能写 requires：sourceEditor、media、runtimeStyles、fetch、sync、upload。编辑器声明使用 editor: { elements: { "abc": "edit" } }，构建器补齐 editor/editorCodecs。每个实际节点必须明确列出；edit 支持显示、插入和编辑，render 只显示，none 不装配但保留原始数据。

根级 requires、optional、editor.elements 为公共声明。目标平台不写时继承；写了就整组替换，空数组清空该组额外需求，不能取消公共基础要求。节点映射也是完整替换，不深合并。必需与可选不能重叠，未知名称在构建时拒绝；省略平台表示不允许该平台应用安装。

## 页面和入口

```tsx
const page = context.pages.register({
  id: "tasks",
  title: "任务管理",
  component: TasksPage,
});
context.navigation.registerEntry({ id: "tasks", title: "任务管理", page });
context.settings.register({ id: "preferences", title: "设置", component: Settings });
```

页面不自动创建入口。桌面侧栏、移动插件功能列表消费同一语义声明；作者不操作宿主 history，不导入宿主路由。详情页可没有入口。页面句柄的 open 仅接收标量参数，页面注销后入口回收。

Dialog/Drawer 直接使用公共 UI。宿主负责浮层返回、层级与安全区。页面组件通过 pageContext.registerLeaveGuard 登记离开守卫，并在 effect 清理时注销；系统终止进程不保证调用守卫或 deactivate，重要数据应及时保存。

context.storage 为当前工作区的插件私有 JSON 存储，不等于业务实体数据库。异步任务处理 signal 与工作区失效；资源通过 context.register 或组件 effect 回收。

## 环境与平板

```ts
interface PluginEnvironment {
  readonly platform: "desktop" | "android" | "ios" | "web";
  readonly input: {
    readonly coarsePointer: boolean;
    readonly finePointer: boolean;
  };
}
```

React 组件使用 usePluginEnvironment()，非 React 调用每次读取 context.environment，二者是同一宿主源的不可变快照。平台在会话内固定，输入变化自动通知组件；未注入环境是装配错误，不假定某个平台。

coarsePointer 对应 (any-pointer: coarse)，finePointer 对应 (any-pointer: fine)：只表达 WebView 报告的指针精度，二者可以同时为真。它们不识别手机、平板、当前事件来源、键盘或悬停能力；一次手势的来源看 PointerEvent。普通插件一般不需要读取环境。

环境没有 layout 或能力清单。布局用 CSS 与容器宽度，不能用系统平台推导宽窄。Android 平板沿用 android，未来 iPad 宿主沿用 SDK 的 ios 家族标识；分屏时重排布局，接入鼠标时增强操作而不删除触摸按钮。平板支持还需要宿主和设备验收，不能从平台声明推断已通过。

## 编辑器插件

节点结构、codec、校验和渲染共用；静态 editorExtensions/editorCodecs 直接交给 definePlugin，不依赖 activate 或缓存全局 context。博客由自己的宿主提供 web/只读环境，不能启动应用插件生命周期。

优先使用 SourceBlockEditor/useSourceBlock 与公开的节点 API。标准插入、选区、源码草稿保存/取消、只读和迟到提交保护由宿主负责；节点允许移动不等于所有平台都采用鼠标拖拽。

图册排序、绘图等专有交互仍由作者实现。基础操作保留可点击/可聚焦按钮，拖拽与悬停只作增强；布局按实际容器调整，共享编辑状态和提交函数，方向或输入变化不能丢失草稿。不能为手机另建一套节点类型。

## 可选功能

只有具备具体可选访问器和完整替代流程的功能才能标记 optional。当前作者 optional 词表仅允许 runtimeStyles，且 requires 必须包含 sourceEditor：

```json
{
  "requires": ["sourceEditor"],
  "optional": ["runtimeStyles"]
}
```

通过 useSourceBlock(element).compiler（行内源码为 useInlineSource）读取编译器，宿主未提供时得到 undefined；作者使用随包基础样式完成降级。若动态样式是内容正确呈现的必要条件，就必须放在 requires。调用异常仍应显示错误，不能以可选为由吞掉失败。

跨端应用模块按清单装配具体服务：未声明的功能访问明确报错；一个插件的可选需求不影响另一个插件。不增加 hasCapability/getCapability 通用查询器，不在环境对象里列宿主能力。

媒体解析与展示需要 requires: ["media"]。useResourceUpload() 在只读或没有资源存储的作用域返回 undefined，表示当前不能上传，并不表示媒体宿主整体缺失；不能通过链接输入绕过只读限制。功能存在、用户授权、当前作用域允许与网络请求成功是四件不同的事。

## 同步与资源上传

桌面、Android 和 iOS 使用同一套 context.sync、context.upload、context.fetch 和 settings.register API。同步提供方声明 requires: ["fetch", "sync"]，上传提供方声明 requires: ["fetch", "upload"]；同包同时提供两者时声明三项。API 的存在由宿主加载前检查，作者不写平台能力查询。

领域表单仍接收 syncConfig/uploadConfig 的 value 与 save(value)。save 表达保存配置的意图：持久化、选用、测试和切换确认由宿主编排。当前桌面显式保存并选用，移动字段失焦保存后在服务页显式选用；作者不调用原生存储或宿主路由。保存失败保留输入，不把调用成功等同于网络测试通过。

同一插件可以保留桌面设置视图和移动设置视图，共用配置字段、校验和存储业务代码。环境只用于选择交互视图，不分叉 API。ConfigurationPanel 是公共 UI 的账号卡、位置字段和选择弹层组合，可用于迁移已有移动表单。

同步与上传的完整配置分别归各插件，不做统一账号共享；不要把凭据存入 context.storage。宿主在任务开始固定配置，停用/切库后不交付迟到结果。两端网络为原生 HTTP(S) 流式传输，移动不额外设置 128 MiB 请求或响应上限，取消覆盖响应体消费阶段；不承诺浏览器 Cookie、后台续传或进程终止后继续任务。同步与上传继续使用相同的 `Uint8Array` 接口，宿主处理文件桥接和任务调度，作者无需增加移动分支或专用分片。完整字节接口仍需文件大小对应的内存，实际可传大小还受设备可用内存、插件处理方式和远端服务约束。

## 构建和分发

buildPortablePluginManifest(authorManifest, output) 接收作者清单和构建器提供的 main/styles/integrity/skills，输出格式 3、apiVersion 1、profile web-v1、CJS 单入口的发行清单。targets 展开为各端 required/optional/elements，插件中心只消费规范化结果，不执行作者源码。

宿主内部 PortablePluginHost 的 capabilities 与作者环境分离。客户端同时校验平台、版本、profile 与必需功能；未知必需项拒绝，未知可选项不授予功能。构建器只推导明确规则，不声称能推断任意 JS 的全部依赖。

纯 Markdown Skill 由目录收集，桌面读取，移动校验保存但不执行；脚本与后台不因此成为移动能力。现有桌面领域插件保持其真实支持范围。移动业务数据权限未接时，不允许发行声明这些权限的移动目标。

React、SDK 与公共 UI 由宿主提供，其他浏览器依赖随包构建；不引用宿主 src，不导入 host/environment-host 等内部装配入口。可信插件与宿主共享 JS 环境，能力检查、完整性摘要和用户权限不构成恶意代码沙箱。

## 验证

仓库外构建验证依赖闭包、类型和包格式；设备联调验证安装、启用、插入、编辑、保存、取消、只读与重启恢复。两者分别记录，模拟器不能替代真机、最低系统、平板与性能验收。发布 SDK、插件和客户端分别遵循明确发行授权。
