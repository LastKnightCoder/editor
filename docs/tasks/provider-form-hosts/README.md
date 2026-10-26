# 提供方表单两端渲染补全

状态：进行中
目标：所有声明式 `form` 的提供方设置（TTS / ASR / 图片 / 视频 / 发布）在桌面与移动都由宿主按平台渲染、按目标保存；补上语音输入设置入口，并让剩余组件式插件也改为声明。

视觉稿：`apps/mobile/mockups/asr-settings/index.html`（`.claude/launch.json` 的 `asr-settings-mock`，入口 `http://localhost:8838/apps/mobile/mockups/asr-settings/`），第 5 页为字段声明对照。

## 1. 现状问题

- SDK 0.47.0 已让 13 个插件声明 `form`，但两端宿主只为 sync / upload 实现了表单渲染与保存。
- 桌面 `PluginSettingsView` 把所有带 form 的分区交给 `ProviderFormView`，后者只认 sync / upload：TTS、图片、YouTube、S3 发布的配置被写进资源存储配置（`imageBed.plugin.configurations`），并显示「设为上传目标」卡；`ttsConfig` / `imageConfig` / `videoConfig` / `publishConfig` 被忽略。
- 移动 `TtsAccountPage` 只渲染 `component`，form 插件无法编辑凭据；图片 / 视频 / 发布领域注册直接抛错（这些插件只声明桌面，影响有限）。
- ASR 两端均无设置入口（此前按用户要求撤回）。

## 2. 决策

- 方案 D：插件只声明字段，宿主按平台排版；`component` 只留给字段描述覆盖不了的交互。
- 保存按钮归宿主（桌面小节操作区、移动导航栏 / 底栏）。
- 识别插件停用：保持原选择不自动回退，设置页提示，使用时报错。
- 入口：桌面 设置 › 语音 新增「语音输入」Tab；移动 我的 › 语音 分组新增「语音输入」。只做设置入口，聊天 / 搜索麦克风等使用入口不在本任务。
- 所有插件一并调整。

## 3. 方案

### 3.1 SDK

- `ProviderFieldGroup` 增加 `link?: { label; url }`（桌面组标题行、移动组下注记）。
- `ProviderChoiceField` 选项的 `description` 在两端显示；≤3 项且带说明时移动以整行选项平铺。
- `beforeSave` 可抛 `ProviderFieldError(key, message)`，宿主把错误标在对应字段。
- 新增 `switch` 字段（值为 `"true"` / `"false"`，保持取值一律字符串）。

### 3.2 桌面

- `ProviderFormView` 拆为纯表单 `ProviderFormFields` + 保存栏；保存目标由调用方注入的 `ProviderFormBinding`（stored / persist / 能力卡）决定。sync / upload 走原绑定；tts / images / video / publish 绑定到各自 `*Config.save`。
- `PluginSettingsView`：form 分区按 target 选择绑定；tts / publish 在插件详情无上下文时仍显示跳转按钮。
- 语音输入 Tab：识别引擎选择 + 当前插件表单（`asr` 绑定 `speech-input:settings`）+ AI 整理。

### 3.3 移动

- TTS 账号页：form 插件用 `MobileProviderForm` + `useProviderDraft`，保存走 `saveTtsConfig`。
- 语音输入页：服务选择 + 插件表单（`plugin_provider_save` target asr）。

### 3.4 插件

- 13 个 form 插件按新字段能力调整（说明、链接、选项说明）；bilibili、publish-github、weread 评估改为 form，保留不可声明的交互（扫码登录、缓存目录选择）。

## 4. 进度

- [x] SDK：`switch` 字段、分组 `link`、`ProviderFieldError` / `isProviderFieldError`，注册校验与测试；CHANGELOG「未发布」条目与作者文档
- [x] 桌面：`ProviderFormFields`（字段区，短选项分段器、密钥框内显隐）与 `ProviderFormView` 绑定化；`PluginSettingsView` 按目标选绑定，修复 tts / images / video / publish 的 form 写进资源存储；设置 › 语音 › 语音输入（`VoiceInputPanel`），插件详情 asr 分区与 open 跳到该 Tab；功能分配恢复「语音输入整理」
- [x] 移动：`MobileProviderForm` 支持开关、平铺单选、分组链接，`useProviderDraft` 识别字段错误；TTS 账号页渲染 form 并在导航栏保存；我的 › 语音 › 语音输入（`speech-input` 模块）与账号页 `speechInputProvider`；原生 `plugin_provider_select` 支持 asr 选回 native
- [x] 插件（子模块工作区，未提交）：asr-seed 分组说明 / 控制台链接 / 选项说明；tts-minimax、tts-qwen、images-openai、publish-s3、s3、upload-s3 补说明；images-openai、youtube 地址解析失败给可读错误
- [x] publish-github 改为声明式：SDK 新增 `service-choice`（`git.cacheDirectory`）与 `visibleWhen`；桌面 form 增 `inline` 布局与自动保存，发布抽屉按此嵌入；插件新增 `src/form.ts` 与测试，删除自绘组件与 `styles.css`，`useGitCli` 兼容字符串取值
- [x] bilibili（扫码登录）、weread（连接状态与断开）按用户决定保留组件
- [x] 发行：SDK 0.48.0 已公开发布；九个插件已发布到 GitHub Release 与插件中心，最低客户端版本不变（桌面 0.60.2、移动 0.2.9）
- [ ] 客户端 0.60.2 / 0.2.9 从包含本任务提交的版本构建发布（publish-github 0.1.9 依赖新字段校验）
- [ ] 视觉验收（用户）
- [ ] 收尾：方案沉淀，删除本目录，更新 docs/README

## 5. 验证

- `packages/plugins`：`tsc --noEmit` 通过；`vitest run` 295 项通过（含开关、链接、字段错误、服务选择与条件显示）。
- 桌面：`tsc --noEmit` 通过；settings / ProviderFormView / plugin-pages / desktop-plugins / publish 共 98 项通过（含 TTS 绑定、字段错误、发布抽屉自动保存与服务选择、`VoiceInputPanel`）。`plugin-center`、`plugin-document`、`questions-plugin`、`weread-plugin` 的 10 项失败在撤下本次改动后同样失败（固定插件产物摘要不匹配等既有问题）。
- 移动：`tsc --noEmit` 通过；settings / plugins / app 187 项通过；此前全量 923 / 924 通过，唯一失败为 `useQuickCaptureController` 的远程资源下载超时，与本任务无关。`cargo check` 通过。
- 插件：以源码 SDK 路径对改动入口做类型检查无新错误；publish-github 的 7 项测试（含新增表单 3 项、字符串开关 1 项）以源码 SDK 运行通过。未在仓库外以本地 tarball 冻结安装与构建。
- `pnpm check:docs` 通过；改动文件 oxlint 无错误。

## 6. 保留组件的插件（用户决定）

- bilibili：扫码登录需要二维码轮询与登录态展示，字段声明表达不了。
- weread：设置是连接状态 + 保存并校验 + 断开，存于 `context.storage` 而不是提供方配置。

两者桌面专用，按用户决定继续用 `component` + `@tau/ui`。
