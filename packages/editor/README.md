# Tau Editor

通用块式编辑器源码，包含内核、内置扩展、编辑器自身 UI 和样式。它不依赖发布 SDK 或博客渲染器；发布正文接入由独立 packages/blog 维护。

```tsx
import { Editor } from "@tau/editor";
import "@tau/editor/styles.css";

<Editor initValue={nodes} readonly />;
```

`initValue` 为初始值；切换内容时用新的 React key 建立实例。编辑时通过 `onChange` 取得正文。`extensions` 按节点类型覆盖本实例的默认扩展。默认组合不包含已插件化的 HTML、TikZ、Typst、ABC 和 custom-block。

`showDragHandle` 默认 `true`。传入 `<Editor showDragHandle={false} />` 可隐藏本实例块左侧的拖拽把手及其菜单入口，正文编辑与拖放接收能力保留。参数支持运行时切换；嵌套编辑器各自控制，不继承外层的开关。

嵌套编辑器默认继承父实例的 kit；需要独立默认组合时可传 inheritKit={false}，不影响显式传入的 kit。发布渲染器使用此通用选项隔离正文实例，编辑器不需要了解发布协议。

kit 只决定编辑器组合，不决定环境是否存在。默认与自定义 kit 都由 Editor 统一保证拖拽环境，复用外层拖拽实例；UI 原语使用已有 Portal 作用域或默认挂载点，Editor 不另外创建 UiProvider，调用方无需补线。

`/api` 为扩展开发接口；`/contracts`、`/api/services`、`/api/paragraph` 和 `/markdown` 保持无界面用途。`/extensions/<功能>` 提供已使用的扩展入口，`/presets/standard` 保留各应用显式组合。高级应用可继续传入自己的 kit，默认组件不替换其服务与场景装配。

`/source-view` 提供编辑器源码预览组件，`/source` 提供块级/行内源码的通用渲染与操作，`/host-services` 提供通用平台能力契约，`/extensions/media/players` 提供音视频组件。`/ui` 提供编辑器和扩展共用的 UI 组件，不包含应用业务。

各端继续通过工作区 @tau/editor 接入这份通用源码；对外博客渲染交付改由 scripts/blog/package-blog.mjs 构建一个 tau-blog 包。必要实现按依赖闭包随包交付，不复制源码，也不要求模板额外安装 Editor。已发布的 tau-editor 版本仅保留为历史交付。

## 界面语言

链接弹层、文字样式工具栏、字色/高亮/渐变、下划线、样式文本调色、批注和行内公式界面使用包内 `src/locales/` 的 JSON 词典，支持简体中文、繁体中文和英文。它们继承外层 `@tau/i18n/react` 的 `I18nRuntimeProvider`；独立使用且没有 Provider 时显示简体中文。切换语言沿用同一编辑器、打开的工具栏面板与未提交输入，不要求重建 kit，也不读取应用设置。批注时间按该运行时语言格式化；颜色/线型/命令标识与用户正文、公式和批注不随语言改变。内置块插入、通用块操作、类型转换、代码/图表、图片/音视频与网页书签的操作界面同样读取实例语言。代码、图片、音视频和通用提示分别维护 `code.*.json`、`image.*.json`、`av.*.json`、`common.*.json`，由包运行时统一注册。共享源码预览与播放器各自维护所在包的 JSON 词典，继承相同 Provider，独立使用时默认简体中文。默认提示服务按发起编辑器选择运行时，语言变化保留请求、输入和选区；校验文案在展示时求值，关闭动画沿用最后一次展示文本。

核心占位、未知块/失败块、拖放与复制反馈使用 `core.*.json`，错误边界只刷新占位文案，不因语言变化重新调用失败的扩展。源码同步失败保留结构化 `TextFieldInputFailure`，展示方调用 `formatTextFieldInputFailure(failure, locale)`；原始错误与未提交草稿保留，语言变化不重新绑定输入或再次提交。`bindTextFieldTextarea` 的错误回调第一参数仍为默认中文文本，第二参数提供原始失败用于语言投影。

宿主只需要绑定文本框时，可从 `@tau/editor/text-field-input` 导入 `bindTextFieldTextarea`、`formatTextFieldInputFailure` 和 `TextFieldInputFailure`。这个纯入口不加载编辑器组件或 JSX，格式化失败时显式传入宿主的 locale；字段协议类型仍从 `@tau/editor/text-field-contract` 导入。

## 核心与扩展边界

- 核心只内建 paragraph 与文本：文本节点与最小渲染、空文档补段、通用选区与导航、未知节点的保留降级归核心；领域节点（标题/列表/表格/媒体…）、快捷转换、格式效果、转换菜单归扩展。
- 自研扩展与外部插件使用**同一套公开 API**；内置扩展不得深引核心内部文件、使用内部 store、要求核心新增类型分支。
- `createEditorKit()` 只内建段落，产品功能显式装配；presets 只做组合不含业务服务，core 不反向依赖功能实现或默认组合。默认 Editor 组件在未提供/继承 kit 时装配通用默认组合。
- 复制走专用贡献点：核心负责片段遍历与对应关系，领域扩展负责包装保留/解包；处理顺序先子后父，无贡献或失败时保留原片段，不吞内容。
- 标记：核心承载 Slate attributes/children 与组合渲染，格式扩展贡献具体效果；缺扩展时保留文字与未知标记数据。
- 将选区加上行内样式或链接时，扩展通过 `@tau/editor/api` 的 `wrapInlineText` 包裹原文字节点。它按同一父节点下的连续文字分段，跳过 void 元素，保留段落、已有行内元素和逐字格式。
- 转换菜单：核心提供命令分发与菜单挂载机制，扩展定义转换条件与目标构造；核心不持有领域类型名单。
- paragraph 始终存在且不可被扩展替换；保留 `paragraph`/`formatted` 等存量数据字段。

## 块插入分组

`IBlockPanelListItem.id` 是可选的稳定条目身份，`group` 指向同轮顶层列表中的目标 id；分组不读取 `title`，身份建议带命名空间。图片菜单声明 `id: "tau.image"`，行内图片声明 `group: "tau.image"`；插件可以使用相同字段接入，未配置时按自己的声明显示。

分组在打开菜单时按声明顺序组装，保留父条目已有的 children；父条目也有 onClick 时，该插入动作保留为分组内的首个子项。目标缺失、重复或关系成环时，相关条目保持顶层，不丢失动作；重复 id 记录诊断。组装不修改扩展返回的对象，动态标题保持读取语义。内置插入标题包含三语检索别名，切换语言不重新过滤已打开的列表或改变 activePath。

## 长文输入与订阅

- 正文变化依赖 Slate 不可变的 `children` 引用判断，选区变化独立通知，不通过全文 JSON 比较检测修改。
- 段落和列表项只订阅末尾状态或父列表类型等派生值。依赖 `ReactEditor.findPath` 的 selector 使用 `deferred: true`，等 Slate 更新节点索引后再计算，避免移动容器时读取旧路径。
- 表格只订阅属于本表的格选区矩形与行列类型；普通光标移动不触发无关表格提交。归属通过当前 Slate 节点身份判断，格选区范围和类型相同则复用；表格内容、对齐、悬停、菜单与拖动仍按各自状态更新。
- 顶层使用每块 100 个节点的 Slate chunk，并在最低层 chunk 应用 `content-visibility: auto`，限制复杂表格文档的样式计算范围；此机制不会卸载屏幕外节点。

## void 节点与选区

`slate-react` 的仓库补丁保留 void 块内占位文本的真实祖先链；代码分步等嵌套结构的 DOM 选区必须映射到内部文本叶子，不能将其直接挂到外层 void 节点。

`EditorRef.focus()` 聚焦文末；文末落在 void 内时选择其首个占位文本，因为 Slate 只为该叶子渲染 DOM，不选择后续步骤未渲染的叶子。选区先落定再聚焦，避免触屏端从旧 DOM 光标恢复出不可见位置。

包内行为测试覆盖块级与行内 void 的多层嵌套、位置变化及撤销重做。[跨端夹具](./test-support/void-behavior.tsx)由桌面与移动端各自的编辑器场景装配运行，检查真实渲染、进入编辑、DOM 光标转换、输入和撤销；分步代码还检查源码输入与步骤操作。测试用原生媒体插槽与隔离的文件服务替代平台资源访问，宿主实体声明的通用光标测试不加载实体业务界面。

## 公开入口

入口由 package.json 的 exports 限定，生产代码禁止私有路径与相对 src 引用（护栏拒绝；测试夹具可用显式相对路径但不构成 API）。

| 入口                                         | 使用方与职责                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `@tau/editor`                                | 宿主：Editor、Kit/文档源、服务装配、共用工具/类型                   |
| `@tau/editor/api`                            | 扩展：元素/命令/菜单/标记/输入规则/复制声明、模型增强、通用编辑能力 |
| `@tau/editor/api/services`、`/api/paragraph` | 纯服务契约、段落工厂与识别                                          |
| `@tau/editor/markdown`                       | paragraphCodec 与 editorMarkdownCodecs；领域 codec 从各扩展包引入   |
| `@tau/editor/toolbar`                        | 工具条分组与浮层位置算法（Node 运行时可加载）                       |
| `@tau/editor/extensions/<功能>`              | 内置功能入口；`/presets/standard` 为默认组合                        |

程序化调用为 `editor.commands.execute(id, payload, element, path)`；异步写入用 `/api` 的 `capture*Submission` 守卫（check/commit/dispose 管理有效性与引用释放）。纯入口与渲染入口分开：主进程/脚本使用 markdown 或纯子入口，不从 UI 根入口取 codec。完整外部示例见 `examples/editor-reminder`。

## 正文字数

通用扩展在自己的 metrics.ts 声明文本字段与补充子树，`@tau/editor/content-metrics` 只装配声明，不加载 React 或 DOM。统一算法位于 `@tau/db-schema/content-metrics`，宿主再加入插件规则。普通 children 自动递归；代码分步由 code-step 声明 code，源码与编译缓存不重复统计。自动清理使用独立 isContentEmpty，编辑器交互仍使用各扩展的 isEmpty。
