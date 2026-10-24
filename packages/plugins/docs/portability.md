# 多端插件作者契约

一个 SDK、一套模板、同一插件 ID/版本对应同一 ZIP。普通页面直接使用公共 API；宿主在加载前检查兼容性。具体宿主实现范围见 [API 支持矩阵](api-support.md)，SDK 类型存在不等于所有接口都已在移动端接入。

格式 3 也承载仅桌面的插件。使用业务数据、视频、语音合成、图片生成或博客发布等桌面能力时，只声明 desktop；不要增加尚未实现对应 API 的移动目标。白板插件继续使用 whiteboardExtensions，作者清单不重复填写白板类型，也不声明白板能力标签。宿主从实际定义识别静态贡献，作者只声明 desktop，安装兼容性统一由平台和最低客户端版本决定。

## 作者清单

作者维护 manifest.json 的身份、目标平台、最低版本和数据权限。包格式、入口、摘要由构建器生成。

```json
{
  "id": "example.counter",
  "name": "计数器",
  "description": "保存当前工作区的计数。",
  "version": "1.0.0",
  "categories": ["page"],
  "targets": {
    "desktop": { "minAppVersion": "0.59.4" },
    "android": { "minAppVersion": "0.2.4" },
    "ios": { "minAppVersion": "0.2.4" }
  }
}
```

版本填写实际验证过的下限。声明平台不代表已在该平台通过设备验收，也不控制生产中心的分发开关。

命令、页面、设置、网络、媒体、源码编辑、样式编译、同步和上传均直接使用统一 API，不填写 requires/optional/required。正文节点只在 editorExtensions 中注册一次，Markdown 转换在 editorCodecs 中注册，白板元素在 whiteboardExtensions 中注册；不在清单重复列节点、支持等级或贡献标记。声明某个平台表示该插件完整功能已适配该平台；不完整的平台暂不声明。

permissions 是用户数据授权上限，与宿主功能装配分开。资源字段、数据校验、样式源码字段和 AI 功能定义描述实际数据或行为，仍按 API 要求填写。

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

宿主只把公开的扩展字段交给编辑器内核，附加属性不会执行。

优先使用 SourceBlockEditor/useSourceBlock 与公开的节点 API。标准插入、选区、源码草稿保存/取消、只读和迟到提交保护由宿主负责；节点允许移动不等于所有平台都采用鼠标拖拽。

图册排序、绘图等专有交互仍由作者实现。基础操作保留可点击/可聚焦按钮，拖拽与悬停只作增强；布局按实际容器调整，共享编辑状态和提交函数，方向或输入变化不能丢失草稿。不能为手机另建一套节点类型。

## 宿主服务与当前作用域

源码编辑和样式编译直接通过 SourceBlockEditor/useSourceBlock/useInlineSource 使用，宿主负责注入实现，不再检查字符串声明。只读、取消、编译失败仍遵循接口语义。博客只读环境可以显示已保存内容或源码，不启动应用插件生命周期。

useResourceUpload() 在只读或没有资源存储的作用域返回 undefined，表示当前不能上传。白板服务直接通过 getService 获取必需服务、tryGetService 获取允许缺省的服务，不另列 requires/optional；宿主仍按扩展绑定服务注册表，插件私有存储按插件和工作区隔离。服务缺失与调用失败按实际 API 返回值或异常处理。

## 同步与资源上传

桌面、Android 和 iOS 使用同一套 context.sync、context.upload、context.fetch 和 settings.register API。提供方直接注册服务与配置表单，无需再在清单声明这些 API。任务调度、持久化与选用由宿主负责。

领域表单仍接收 syncConfig/uploadConfig 的 value 与 save(value)。save 表达保存配置的意图：持久化、选用、测试和切换确认由宿主编排。当前桌面显式保存并选用，移动字段失焦保存后在服务页显式选用；作者不调用原生存储或宿主路由。保存失败保留输入，不把调用成功等同于网络测试通过。

同一插件可以保留桌面设置视图和移动设置视图，共用配置字段、校验和存储业务代码。环境只用于选择交互视图，不分叉 API。ConfigurationPanel 是公共 UI 的账号卡、位置字段和选择弹层组合，可用于迁移已有移动表单。

同步与上传的完整配置分别归各插件，不做统一账号共享；不要把凭据存入 context.storage。宿主在任务开始固定配置，停用/切库后不交付迟到结果。两端网络为原生 HTTP(S) 流式传输，取消覆盖响应体消费阶段；不承诺浏览器 Cookie、后台续传或进程终止后继续任务。

同步提供方继续实现相同的 `Uint8Array` 对象接口。宿主统一管理数据库、资源和会话的分块、校验与重组，作者无需增加移动分支或专用分片。对象名由宿主决定，提供方应原样存取字节，不依赖数据库后缀、目录布局或清单内容。公网直链上传仍接收完整资源并返回真实 HTTP(S) URL，其内存与远端服务约束保持原样。

## 构建和分发

buildPortablePluginManifest(authorManifest, output) 接收作者清单和构建器提供的 main/styles/integrity/skills，输出格式 3、apiVersion 1、profile web-v1、CJS 单入口的发行清单。targets 仅记录各平台 minAppVersion，插件中心只消费规范化结果，不执行作者源码。读取器提取协议字段，忽略附加元信息；只校验身份、协议、授权、文件完整性和实际数据约束，不限制简介、关键词或 Skill 数量。版本使用 SemVer，允许预发布和构建标识。

客户端按平台、最低版本、格式与运行配置检查兼容性，插件中心再检查分发开关。宿主装配时读取实际注册的静态贡献，不依赖重复的能力词表或推测任意 JavaScript 的全部依赖。新发行要求桌面至少 0.59.4、移动至少 0.2.4；客户端安装包单独发行。

纯 Markdown Skill 由目录收集，桌面读取，移动校验保存但不执行；脚本与后台不因此成为移动能力。现有桌面领域插件保持其真实支持范围。移动业务数据权限未接时，不允许发行声明这些权限的移动目标。

React、SDK 与公共 UI 由宿主提供，其他浏览器依赖随包构建；不引用宿主 src，不导入 host/environment-host 等内部装配入口。可信插件与宿主共享 JS 环境，平台兼容检查、完整性摘要和用户权限不构成恶意代码沙箱。

## 验证

仓库外构建验证依赖闭包、类型和包格式；设备联调验证安装、启用、插入、编辑、保存、取消、只读与重启恢复。两者分别记录，模拟器不能替代真机、最低系统、平板与性能验收。发布 SDK、插件和客户端分别遵循明确发行授权。

## 语音输入提供方

ASR 与语音合成是独立注册。语音输入插件使用 `context.asr.register` 和 `settings target: "asr"`，账号通过 `asrConfig.save(value, modelId)` 保存；麦克风与重采样由宿主管理，输入目标及提交守卫由后续界面消费者负责。当前未挂载语音输入和整理入口，ASR 表单保留注册但不显示。SDK 0.43.0 要求 ASR 目标最低桌面 0.59.5、移动 0.2.7。`context.websocket.connect` 同步返回标准 WebSocket 接口形状，鉴权头和任务 signal 为第三参扩展；两端的发送背压、关闭握手和插件生命周期由宿主统一处理。详见 [WebSocket](websocket.md)。
