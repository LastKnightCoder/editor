# 多端插件作者契约草案

状态：用户已确认，进入实施；本文的新字段和行为在实现与验证完成前仍不代表已发布。实施顺序为保存插件改动、接入 submodule、统一 SDK/模板/插件、仓库外构建、Android/iOS 完整联调；先不发布，平板与 D 未验收项保留。

目标：让作者用一个 SDK、一套模板、同一份插件包支持桌面、Android 和 iOS，普通功能直接调用公共 API，特殊交互才由作者适配。

本文是本次作者契约讨论的唯一位置。确认后按此修改并验证实现，再替换 SDK 作者文档与相关架构事实；任务结束随父任务沉淀、退役，不长期保留另一套规范。

## 一、已确认的边界与契约

用户已确认：加载前的兼容检查由宿主负责；公共 API 不要求作者逐次查能力；环境只描述事实；布局不进入环境；作者可为特殊交互写不同视图。一个 SDK、一套模板、同一 ID/版本对应同一不可变 ZIP；不添加中间兼容层，不给能力独立编号。

用户已确认以下清单字段与合并规则、公共基础功能集合、额外与可选功能的声明和调用方式、输入字段，以及平板的承诺边界。示例保留现有 pages/navigation、definePlugin、编辑器贡献的基本写法，不重造生命周期或 UI 框架。

## 二、作者会接触哪些东西

| 入口                     | 作者用途                                                 | 不承担的职责                           |
| ------------------------ | -------------------------------------------------------- | -------------------------------------- |
| `manifest.json`          | 身份、目标平台、最低应用版本、额外需求和节点支持等级     | 不手写摘要、包格式、能力版本号         |
| `definePlugin`           | 声明编辑器贡献；需要页面/命令等运行期贡献时提供 activate | 不负责平台识别、安装或宿主装配         |
| `context`                | 注册页面、入口、命令、设置，访问插件私有存储             | 不公开原生桥或内部模块注册表           |
| `usePluginEnvironment()` | 组件确实需要时读取平台与输入事实                         | 不决定布局，不返回能力清单或用户权限   |
| 对应功能的 API/hook      | 访问媒体、源码编辑、样式编译等实际服务                   | 不通过一个通用字符串查询器拿服务       |
| `@tau/ui` 与标准编辑组件 | 公共视觉、浮层和编辑交互                                 | 不让每个作者重复实现系统返回、输入隔离 |

模板中的包管理器依赖可继续使用 npm alias，作者代码统一从 `@tau/plugins`、`@tau/ui` 等公开入口导入。插件不能引用宿主 src、内部服务或 `environment-host` 等装配入口。

## 三、作者清单与发行清单分开

### 3.1 页面插件的作者清单

下列是拟议的作者清单，不是现在的发行格式。最低版本数字仅用于展示写法，正式值需由实现与回归结果确定。

```json
{
  "id": "example.counter",
  "name": "计数器",
  "version": "1.0.0",
  "description": "在当前工作区保存计数。",
  "categories": ["page"],
  "targets": {
    "desktop": { "minAppVersion": "0.59.2" },
    "android": { "minAppVersion": "0.2.3" },
    "ios": { "minAppVersion": "0.2.3" }
  }
}
```

作者不再重复填写 `pages/navigation/storage/commands/settings/dialogs`。这些是本草案建议的应用宿主公共基础契约；宿主必须全部接好才能宣称满足该契约。构建器将基础要求写入发行清单，安装与激活前检查，缺失时明确拒绝而不是静默隐藏页面。

公共基础不包含业务数据、AI、同步提供方、Node 后台、系统命令或任意原生调用。SDK 导出了某个历史 API，不等于该 API 已成为跨端基础。移动宿主尚未接入的功能不能靠清单声明变为可用。

### 3.2 编辑器插件的作者清单

```json
{
  "id": "tau.abc",
  "name": "ABC 乐谱",
  "version": "0.1.7",
  "description": "插入、编辑和预览 ABC 乐谱。",
  "categories": ["editor"],
  "requires": ["sourceEditor"],
  "editor": {
    "elements": { "abc": "edit" }
  },
  "targets": {
    "desktop": { "minAppVersion": "0.59.2" },
    "android": { "minAppVersion": "0.2.3" },
    "ios": { "minAppVersion": "0.2.3" }
  }
}
```

三端相同的声明只写一次。作者声明 `sourceEditor` 是因为实际使用标准源码编辑组件；`editor/editorCodecs` 等内部装配要求由构建器根据编辑器声明生成，作者不重复填。

节点等级定义：

| 等级     | 对当前平台的承诺                                       |
| -------- | ------------------------------------------------------ |
| `edit`   | 能显示、插入和编辑该节点；宿主仍执行当前文档的只读限制 |
| `render` | 只读显示；不提供该节点的插入与修改入口                 |
| `none`   | 不装配该节点实现，宿主保留原始数据并使用未知节点展示   |

清单里的节点必须与实际贡献对账，未声明的节点不能自动当作 edit。一个扩展混合多个等级时，宿主必须避免共享命令越权修改 render 节点；作者需独立控制插入入口时拆分扩展，节点数据不变。

### 3.3 平台有差异时如何写

例如某插件在 Android 暂时只有渲染能力，桌面和 iOS 已提供编辑：

```json
{
  "requires": ["sourceEditor"],
  "editor": { "elements": { "score": "edit" } },
  "targets": {
    "desktop": { "minAppVersion": "0.59.2" },
    "android": {
      "minAppVersion": "0.2.3",
      "requires": [],
      "editor": { "elements": { "score": "render" } }
    },
    "ios": { "minAppVersion": "0.2.3" }
  }
}
```

这是清单片段，用来说明覆盖规则；Android 的渲染实现须确实不依赖源码编辑服务，不能仅改声明。

合并规则固定为：

- `targets` 中存在的平台才允许应用安装；省略表示不支持，禁止猜测或自动补平台。
- `requires`、`optional`：目标未写时继承根声明；写了就整组替换；空数组表示清空该组额外需求。不能删除公共基础契约。
- `editor.elements`：目标未写时继承根映射；写了就提供该目标完整映射，不做逐键深合并。构建器校验所有实际节点都有明确等级。
- 同一目标的必需与可选集合不能交叉，未知名称和重复声明在作者构建时直接报错。
- 不按平台生成不同版本的 ZIP；平台差异放在同一包的声明和实现里。

### 3.4 构建器与中心的职责

| 信息                                                                     | 来源                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ID、名称、插件版本、描述、分类、关键词                                   | 作者清单，插件入口元数据由模板注入，避免手写两份                           |
| 支持平台与最低应用版本                                                   | 作者清单；构建器对已知基础要求作一致性校验，不承诺自动推断任意代码所需版本 |
| 公共要求、编辑器内部装配要求                                             | SDK 构建器的明确规则                                                       |
| 额外必需/可选功能、各节点等级                                            | 作者清单，构建时展开各平台有效值                                           |
| `formatVersion/apiVersion/profile/platform/format/main/styles/integrity` | 官方构建工具生成的发行信息，不是作者日常表单                               |
| 纯 Markdown Skill 文件清单                                               | 构建器从 skills 目录收集；桌面使用，移动保存但不执行                       |
| 用户数据权限                                                             | 作者显式声明；与功能可用性分开，不能从可选需求自动获得授权                 |

本方案优先让构建器输出既有格式 3 的规范化 `targets.required/optional/elements`，中心只消费发行清单，不解析源码清单的继承规则；不为作者写法变化再增一个包格式版本。是否需要修改某个发行字段，必须在实施时逐字段对账，不能假设现有服务无需调整。

构建器不扫描任意 JavaScript 并声称知道所有间接调用，也不为修正过程保留旧作者格式转换器。当前可统一维护的插件、模板和工具在确认后一起调整。

## 四、页面插件怎么写

### 4.1 页面与入口只声明一次

下面是插件入口示例；CounterPage、CounterSettings 是作者自己实现的组件，元数据由模板从清单注入。

```tsx
import { definePlugin } from "@tau/plugins";
import { CounterPage, CounterSettings } from "./CounterPage";

declare const __PLUGIN_META__: {
  id: string;
  name: string;
  version: string;
};

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      const page = context.pages.register({
        id: "counter",
        title: "计数器",
        component: CounterPage,
      });
      context.navigation.registerEntry({
        id: "counter",
        title: "计数器",
        page,
      });
      context.settings.register({
        id: "counter",
        title: "计数设置",
        component: CounterSettings,
      });
      context.commands.register({
        id: "open-counter",
        title: "打开计数器",
        run: async () => {
          await page.open();
          return null;
        },
      });
    },
  }),
});
```

桌面将入口放在侧栏；手机放在插件功能列表；平板未来可由宿主呈现侧栏或其他导航容器。页面注册不自动创建入口，详情页可以不出现在导航中。作者不硬编码侧栏或“我的”路径，不监听宿主路由，不使用 `__PLUGIN_PORTABLE__` 选择两套公共写法。

### 4.2 页面组件的统一行为

- 页面收到 `context`、`params`、`pageContext`。参数仅允许字符串、有限数字和布尔值；业务实体通过 ID 获取，不把大对象塞进导航。
- `context.storage.get/set` 保存插件在当前工作区的私有数据，三端同义；查询、加载失败、保存失败和取消按普通业务代码处理，模板复用现有 react-query 写法。
- Dialog/Drawer 直接使用 `@tau/ui`，不先检查 dialogs 字符串。宿主负责安全区、浮层层级、Android 返回与 iOS 返回交互的衔接。
- 未保存状态通过 `pageContext.registerLeaveGuard` 接入；组件清理时释放登记。离开守卫不能保证进程被系统杀死时还能弹窗，重要数据应及时持久化。
- 注册资源由宿主随插件失活回收；作者创建的订阅、计时器和异步任务仍应清理，异步写入遵循 `context.signal` 和工作区生命周期。
- 页面隐藏、再显示、方向变化和输入设备变化不能让作者丢失未提交状态。

### 4.3 页面如何适配手机和平板

默认是一份页面组件。列表/详情是否并排，由组件实际可用宽度决定，采用 CSS 容器查询或必要的局部尺寸测量；不用环境里的 compact，也不靠 Android/iOS 判断宽窄。

确实需要不同系统行为时才读取 platform，例如桌面特有的插件自有快捷交互。此前按 android/ios 直接选择完整 MobileGalleryEditor 的示例只适用于系统行为差异，不能作为所有插件布局的默认模板，否则 iPad 会被永远限制在手机视图。

## 五、编辑器插件怎么写

### 5.1 静态贡献不依赖 activate

```tsx
import { definePlugin } from "@tau/plugins";
import { abcExtension } from "./editor/extension";
import { abcCodec } from "./editor/markdown";

declare const __PLUGIN_META__: {
  id: string;
  name: string;
  version: string;
};

export default definePlugin({
  ...__PLUGIN_META__,
  editorExtensions: [abcExtension],
  editorCodecs: [abcCodec],
});
```

extension 内继续使用公开的 `defineEditorExtension/defineEditorElement` 声明节点、插入动作与渲染器。作者只定义 abc 节点，不再定义 android-abc、ios-abc；数据、codec、校验、导出逻辑共用。

### 5.2 优先让宿主处理标准源码编辑

下面沿用 ABC 的实际公开 API 形状。AbcElement、AbcPreview 是作者自己的类型和渲染器。

```tsx
import { SourceBlockEditor, useSourceBlock, type EditorElementRenderProps } from "@tau/plugins";
import type { AbcElement } from "./types";
import { AbcPreview } from "../render/AbcPreview";
import { Music } from "lucide-react";

export function AbcBlock({ attributes, children, element }: EditorElementRenderProps<AbcElement>) {
  const { update } = useSourceBlock(element);
  return (
    <div {...attributes}>
      <SourceBlockEditor
        mode="text"
        title="乐谱"
        icon={Music}
        initValue={element.content}
        onChange={content => update({ content })}
        element={element}
      >
        <AbcPreview content={element.content} />
      </SourceBlockEditor>
      {children}
    </div>
  );
}
```

同一段代码在桌面、手机和平板使用对应宿主交互。源码草稿、明确保存/取消、返回仲裁、插入后的选区、只读限制和迟到提交保护属于标准组件与宿主职责。`drag: true` 表达节点允许移动，不承诺所有平台必须出现桌面鼠标拖拽把手；移动宿主可提供移动操作。

### 5.3 插件自有交互由作者适配

图册排序、绘图面板等仍由作者实现：

- 基础操作必须能通过可点击、可聚焦的按钮完成，例如前移/后移，不能只有拖拽或悬停入口。
- 宽容器可显示网格/侧面板，窄容器可显示列表/独立编辑区；空间判断只影响布局，不更换数据结构。
- 鼠标拖拽是增强操作；插上鼠标不应删除触摸按钮。需要区分一次手势时读取该事件的 pointerType，不缓存全局“当前输入模式”。
- 共享同一个编辑状态与提交函数；切换视图不丢草稿，不把未保存状态分别存在两套组件中。
- 业务必要的 HTML/TSX 动态样式编译必须声明 runtimeStyles 为必需；不能失败后无样式显示还宣称功能完整。

### 5.4 只读、导出与 Web 渲染

`platform: web` 表示 Web 渲染宿主，不是应用安装平台；本文不新增网页应用安装 targets。静态内容组件不得假设 activate 已执行，不访问全局缓存的 PluginContext。渲染宿主必须提供自己的环境与渲染所需服务。

应用页面基础能力不要求博客实现。Web 只装配静态渲染贡献；源码组件在只读作用域不得开放编辑，媒体上传可缺失。渲染所需的必需服务也必须检查，不能因为是博客就绕过依赖校验。发布时无法满足渲染要求应明确失败，不产出一个声称完整但实际缺功能的页面。

格式 3 的桌面 Skill 与博客渲染不能因移动改造被删除。本次作者契约不把博客渲染协议版本绑定到插件包格式版本。

## 六、环境、输入与平板

### 6.1 建议的环境类型

```ts
interface PluginEnvironment {
  readonly platform: "desktop" | "android" | "ios" | "web";
  readonly input: {
    readonly coarsePointer: boolean;
    readonly finePointer: boolean;
  };
}
```

组件用 `usePluginEnvironment()`，activate 等非 React 代码读 `context.environment`；二者来自同一宿主源，后者每次读取取得最新快照。会话内平台固定，输入报告变化时 hook 更新。没有 Provider 是宿主装配错误，不能返回伪造的 desktop 或 unknown 掩盖问题。

本草案不新增 isMobile、isTablet、屏幕断点、当前输入设备、键盘是否存在、悬停是否存在等字段。确有需求时按各自准确语义讨论，不从已有字段推断。

### 6.2 coarsePointer / finePointer 到底表示什么

它们是浏览器/WebView 对可用指针精度的报告，不是设备型号识别，也不保证硬件探测完整。由宿主分别读取 `(any-pointer: coarse)` 与 `(any-pointer: fine)`，不能用 User-Agent 或平台名补猜。

| 字段          | true 的含义                                                  | 不能据此得出的结论                   |
| ------------- | ------------------------------------------------------------ | ------------------------------------ |
| coarsePointer | 环境报告至少一种较难精确点中小目标的指针，手指触屏是常见例子 | 设备必然是手机、当前事件一定来自触摸 |
| finePointer   | 环境报告至少一种精确指针，鼠标、触控板或某些笔是常见例子     | 可以悬停、存在键盘、用户正在使用鼠标 |

两者可同时为 true；都为 false 也合法，不能因此禁用按钮或键盘操作。只用 CSS 调整尺寸时不需要调用 hook；插件确需在 JavaScript 中增加精细交互时才使用它。一次交互的触摸/鼠标/笔来源由 PointerEvent 表达，和此环境报告不同。

语义依据：[W3C Media Queries：指针精度](https://www.w3.org/TR/mediaqueries-4/#pointer)、[所有可用指针](https://www.w3.org/TR/mediaqueries-4/#any-input)。宿主以媒体查询的实际报告为准，可访问性设置与 WebView 实现也会影响结果。

### 6.3 平板不另建平台协议

SDK 中 android/ios 是宿主产品家族：Android 手机和平板都为 android；iPhone 与未来 iPad 应用都为 ios。这里是 SDK 的映射约定，不混淆 iOS 与 iPadOS 的系统名称。是否支持 iPad 的应用发行配置由宿主工程负责，不能靠插件声明开启。

| 情况                 | 平台        | 布局依据                   | 输入处理                           |
| -------------------- | ----------- | -------------------------- | ---------------------------------- |
| 手机竖屏             | android/ios | 插件实际窄容器             | 基础操作支持触摸与键盘可达         |
| 平板全屏             | android/ios | 宽容器可显示双栏           | 即使宽屏也保留触摸操作             |
| 平板分屏             | 平台不变    | 容器变窄，响应式重排       | 不重置文档或草稿                   |
| 平板接鼠标/触控板    | 平台不变    | 空间不会因接入鼠标自动改变 | 可以增强精细交互，仍保留触摸路径   |
| 桌面窄侧栏或触屏电脑 | desktop     | 可能比手机页面更窄         | 依据报告与实际事件，不假设只有鼠标 |

因此本轮不增加 tablet target，也不要求作者写第三套编辑器。未来确有“只允许手机安装、禁止平板”的产品需求，再讨论独立设备支持声明，不能使用宽度门槛冒充设备限制。

扩展性不等于已经支持：当前没有完成平板宿主与设备验收。未来开放前须验证横竖屏、分屏/窗口缩放、软键盘、安全区、鼠标/触控板/笔与触摸混用、未保存草稿保持。D 待验收继续保留；中心不能把声明了 ios/android 显示成“平板实测通过”。

## 七、必需与可选功能

### 7.1 三种情况必须分开

| 情况                     | 清单/调用规则                               | 失败行为                              |
| ------------------------ | ------------------------------------------- | ------------------------------------- |
| 公共基础功能             | 不逐项填写，不逐次查能力                    | 宿主不满足则加载前拒绝                |
| 插件运行所必需的额外功能 | 写 requires，满足后直接用对应 API           | 缺失则不能安装/激活；运行异常正常报错 |
| 有完整替代流程的增强功能 | 写 optional，通过该功能的可选服务访问器判断 | 缺失时走作者明确实现的替代流程        |

输入条件、只读状态、用户权限、网络可达和上传配置不是同一件事，不能都归为 capabilities。可选服务存在也不代表调用必然成功，作者仍须处理取消、权限拒绝与运行错误。

### 7.2 可选功能必须有具体访问契约

不新增 `hasCapability/getCapability` 通用入口，也不把现有 SDK 所有功能都自动变成 optional。只有具备明确可选访问器且定义了缺失行为的功能才能列入作者 optional 词表；其余需要时列为 requires，不接受“先写 optional、运行时再试调用”。

本草案建议先只允许 runtimeStyles 作为可选增强，沿用 `useSourceBlock(element).compiler` 这一具体访问位置；作者仍须把 sourceEditor 列为必需。类型保持编译器或 undefined，未提供时不是抛出“找不到服务”的假可选。需要源码之外的样式访问场景时另行设计对应服务，不引入万能获取器。

```json
{
  "requires": ["sourceEditor"],
  "optional": ["runtimeStyles"]
}
```

例如只把动态样式当装饰增强的源码预览，可在已有异步预览流程中写：

```ts
const { compiler } = useSourceBlock(element);

async function compilePreviewStyles(source: string) {
  if (!compiler) return "";
  return compiler.compile({ source, language: "html" });
}
```

这是组件内片段；无编译器时使用作者随包发布的基础样式。编译失败仍作为真实错误显示，不将异常一概吞掉。若用户源码必须依赖动态样式才能正确表达内容，该功能就必须改为 requires，不能用此降级写法。

服务规则：同一运行会话中，宿主已声明提供的实现不能随意消失；可选且未实现时访问器返回 undefined；未声明却访问额外服务属于作者契约错误，应明确诊断。关闭功能不能成为绕过业务权限的方式，可信插件模式也不宣称这构成安全沙箱。

### 7.3 媒体上传的 undefined 是作用域限制

`useResourceUpload()` 已有返回上传函数或 undefined 的形状。图册使用媒体解析/展示时仍需 `requires: ["media"]`；只读正文、发布站或无资源存储的作用域不能上传，hook 返回 undefined。这不等于媒体宿主整体缺失，也不需要把整个 media 改成 optional。

作者在可编辑且具有上传函数时提供文件选择；没有上传能力时按产品设计只允许链接输入，或者仅展示。只读时不能因为能输入链接就绕过节点写保护。禁止通过不存在的 API 抛异常来探测功能，也不能将用户拒绝权限当作宿主不支持。

### 7.4 为什么仍保留内部兼容检查

最低应用版本表达版本下限，功能检查确认这个实际宿主是否已接好必需实现；两者保护不同问题。作者只声明真实额外需求一次，构建器生成内部要求，中心用于选版与解释原因，客户端在加载前复核。普通页面不承担这些判断。

SDK 导出 API、平台字段存在、中心部署成功，都不能单独证明客户端已接入功能。未知必需功能不能放行；未知可选功能可保留分发信息并作为未提供处理，但这不会自动赋予旧 SDK 调用未来接口的能力。

## 八、确认后实施的范围与验收

| 部分          | 确认后要改什么                                                                      |
| ------------- | ----------------------------------------------------------------------------------- |
| SDK           | 环境收敛；作者清单类型与构建规范化；基础/额外/可选功能边界；真实可选访问器          |
| 官方模板      | 简化清单；删除环境能力分支与布局 hook；页面/编辑器示例共用一个作者入口              |
| 现有插件      | 清单统一；样式/媒体声明按真实需求选择；交互按空间与输入适配；保留节点和已有桌面功能 |
| 桌面/移动宿主 | 基础实现对账、环境注入、缺失诊断、可选服务与只读作用域；不识别具体插件 ID           |
| 构建与中心    | 作者清单转换为发行清单；字段对账、摘要与真实兼容检查；不让网页改写平台事实          |
| 文档          | 用已实现事实替换 SDK 指南和支持矩阵；删除中间方案的残留叙述                         |

验收应证明：仓库外作者工程可构建；一份包在三端按声明运行；普通页面没有能力查询；标准编辑器不需要平台分支；可选缺失确实有替代行为；必需缺失在运行前拒绝；只读/权限/输入不是同一个开关；生产无验证插件分支。原有 Android/iOS 完整编辑链路在契约实施后继续，平板与 D 的未验收项不提前关闭。

本轮允许统一修改 SDK、宿主、模板和插件，先完成仓库外构建再进行两端原生联调；不发 npm、不发布插件或中心、不新增兼容层。实际结果记录在同任务的编辑器移动适配文档。

## 九、请优先审阅的具体选择

- 是否接受作者清单保留 targets，公共额外需求使用 requires/optional，平台差异按整组覆盖；发行清单仍由工具生成。
- 是否接受 pages/navigation/storage/commands/settings/dialogs 为应用公共基础，编辑器源码、媒体、运行时样式为额外功能。
- 是否接受环境只保留 platform 与两个精确定义的指针字段，普通作者默认不读取环境。
- 是否接受平板沿用 android/ios，布局按容器、交互按输入与事件，不增加 tablet/isTablet 分支。
- 是否接受可选功能先限于具有明确访问器的 runtimeStyles，不把权限或当前文档上传状态混进可选能力。

上述选择已获用户确认，实施完成的事实同步到 SDK 作者文档与宿主架构；本文件保留任务内的完整约定，随父任务收尾退役。
