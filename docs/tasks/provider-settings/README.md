# 服务商设置归位

状态：进行中
目标：同步与资源存储的连接配置从宿主设置页移到插件设置页，由宿主按插件声明统一渲染；设置页只负责选用服务与查看状态；移动端改为原生推入式交互。

视觉稿：`apps/desktop/mockups/provider-settings/index.html`，从仓库根起 HTTP 服务访问（`.claude/launch.json` 的 `mobile-sync-mock`，入口 `http://localhost:8835/apps/desktop/mockups/provider-settings/`）。

## 1. 现状问题

- 设置 › 同步 / 资源存储通过 `PluginSettingsView` 嵌插件自绘表单，宿主页同时承担「选服务 + 看状态 + 填配置」；插件详情 › 设置 对 sync / upload 只有跳转按钮。
- 7 个存储插件（s3、oss、github、webdav、upload-s3、upload-oss、upload-github）各写桌面 + 移动两套表单，说明、按钮文案、提示字号、「可选」写法、保存语义各不相同。
- 移动端插件面板使用 `ConfigurationPanel`：账号与远程选项都是居中 Dialog，枚举用 Select 浮层，字号未走移动端 9 档，卡片皮与宿主不一致。

## 2. 决策

- 表单来源：插件声明字段，宿主按平台渲染（声明式表单）；sync / upload 目标不再接受插件组件。
- 桌面「配置」入口：关闭设置、跳插件详情 › 设置，页顶返回条回到来源设置分区。
- 保存语义：两端都是显式保存；同步目标保存后由宿主测试连接（读取云端版本）。保存不改变当前选用，选用是独立动作。
- 移动字段行：上标签下值。
- 范围：只做 sync + upload；tts、images、video、publish 不动（`ConfigurationPanel` 仍被 TTS 插件使用，保留）。
- 账号复用：不做（跨插件按类型带入凭据存在泄露风险，同插件内复用需合并插件，收益不足）。

## 3. 方案

### 3.1 SDK 契约（`@tau/plugins`）

`PluginSettingsDefinition` 拆成两类：

- 存储提供方分区：`target: "sync" | "upload"`，必须提供 `form: ProviderForm`，不得提供 `component`。
- 其他分区：保持 `component`（及 tts/asr/images/video/publish 目标）。

```ts
interface ProviderForm {
  groups: readonly ProviderFieldGroup[];
  /** 保存前调用：可补全字段（如按令牌取用户名）或抛错拒绝保存 */
  beforeSave?(values: ProviderFormValues, signal: AbortSignal): Promise<ProviderFormValues>;
}
interface ProviderFieldGroup { title: string; description?: string; fields: readonly ProviderField[] }
type ProviderField =
  | { type: "text" | "secret" | "url"; key; label; description?; placeholder?; optional?; summary? }
  | { type: "choice"; options: readonly { value; label }[]; default?: string; ... }
  | { type: "remote-choice"; load(values, signal): Promise<readonly { value; label?; description? }[]>; dependsOn?: readonly string[]; ... };
type ProviderFormValues = Readonly<Record<string, string>>;
```

- 取值一律为字符串；保存时与已存配置合并，保留未声明的键。
- `optional` 由宿主渲染为说明（桌面说明行 / 移动标签后缀），不写进标题；未标 `optional` 的字段为必填，空值时宿主拒绝保存并标在字段上。
- `summary: true` 的字段按声明顺序以「 · 」拼接，作为服务列表行的摘要；secret 字段不得做摘要。
- `dependsOn` 中任一字段变化时清空本字段。
- 纯函数（初值读取、必填校验、摘要、合并）放在 SDK `provider-form.ts`，两端共用。
- 宿主注册时校验：sync / upload 必须有 form、键唯一、choice 有选项、secret 不做摘要。

### 3.2 桌面

- 设置 › 同步：概览页的「同步目标」组改为「同步服务」单选列表（已安装且注册了 sync 分区的插件）；行显示摘要或「未配置」，未配置不可选，行尾「配置 ›」/「去配置 ›」跳插件详情；末行「添加同步服务」跳插件中心。切换服务前探测目标云端，已有数据时 ConfirmDialog 确认。
- 设置 › 资源存储：「本地」与上传插件合成一个单选列表，去掉 Segmented 与下拉；压缩开关保留。
- 插件详情 › 设置：sync / upload 分区由宿主 `ProviderFormView` 渲染：能力卡（当前使用 / 设为当前）→ 分组字段（SettingRow）→ 保存栏（还原 / 保存并测试，结果行）。从设置进入时 `from` 参数显示返回条。
- 主进程 `updateProviderPlugin` 只写配置，不再改选用；选用由渲染端写 `sync.active/plugin.id`、`imageBed.active/plugin.id`。

### 3.3 移动

- 同步中心「同步到」行推入「同步服务」列表页（取代 SyncProviderSheet）：点已配置的行即切换（先探测，云端有数据时底部面板确认），点 ⓘ 进服务页；未配置行整行进服务页。资源存储同构（取代 UploadTargetSheet），「这台手机」为普通选项。
- 服务页（`syncProvider` / `uploadProvider`）：导航栏右上「保存」（有改动才可用，保存即测试）；「使用」组显示当前状态 / 设为当前；宿主表单 `MobileProviderForm`（分组行、上标签下值、字段级错误）；choice / remote-choice 推入全屏选择层（勾选列表、搜索、加载失败重试、手动输入），经页面返回处理器接入返回手势。上传服务保留「上传测试图片」行。
- 本任务涉及的页面字号全部用 `text-tau-*` 档位。

### 3.4 插件

7 个存储插件改为声明 `form`，删除各自桌面表单组件与 `mobile-settings.tsx`；GitHub 两个插件用 `remote-choice` 加载仓库与分支，`beforeSave` 按令牌补全所有者与邮箱；上传插件的 URL 校验移到 `beforeSave`。插件依赖新 SDK 发布后才能构建发行，minAppVersion 提到含本改动的客户端版本。

## 4. 进度

- [x] SDK：`provider-form.ts`（类型与纯函数）、`PluginSettingsDefinition` 拆为 form / component 两类、注册校验（旧版组件式存储设置照常注册，宿主不渲染）、文档与 CHANGELOG「未发布」条目
- [x] 桌面：`ProviderFormView`（插件详情 › 设置，能力卡 + 分组字段 + 保存栏）、`ProviderChoiceList`（同步 / 资源存储单选列表）、`useSyncProviderSwitch`、`services/storage-providers.ts`；主进程 `updateProviderPlugin` 只写配置
- [x] 移动：`MobileProviderForm` 与全屏选择层、`useProviderDraft`、服务页显式保存与离开确认、`syncProviders` / `uploadTargets` 列表页取代两个 BottomSheet；涉及页面字号改用 `text-tau-*`，`GroupLabel` 收到 sm 档
- [x] 插件（子模块，已提交并推送）：7 个存储插件改为声明 `form`，删除桌面表单组件、`mobile-settings.tsx` 与上传插件的 `styles.css`；GitHub 两插件新增 `src/form.ts`
- [x] 发行：7 个插件使用已公开发布的 SDK 0.46.0，S3 同步发布 v0.4.3，其余发布 v0.3.3；最低客户端版本为桌面 0.60.2、Android / iOS 0.2.9。七仓 main 与标签已推送，GitHub Release 和插件中心均已发布，线上 ZIP 与仓库外验证构建逐文件一致；其他插件仓库里的 SYNC.md / UPLOAD.md 副本随下次更新同步模板
- [ ] 视觉验收（用户）
- [ ] 收尾：方案沉淀（架构文档已同步当前事实），删除本目录，更新 docs/README

## 5. 验证

- `packages/plugins`：`tsc --noEmit` 通过；`vitest run` 58 文件 / 289 用例通过（含 `provider-form.test.ts`）。
- 桌面：`tsc --noEmit` 通过；`src/features/settings`、`src/features/plugins` 35 文件 / 191 用例通过（新增 `ProviderFormView.test.tsx`、`SyncSection.test.tsx` 增加列表与切换用例，删除依赖旧插件 ZIP 表单的 `SyncPluginSection.test.tsx`）。全量 3960 通过、3 失败为既有失败（`markdown-roundtrip-baseline`、`WhiteBoardContentView`，未改动时同样失败）。
- 移动：`tsc --noEmit` 通过；全量 141 文件 / 921 用例通过（同步中心、图片与附件、settingsModule 用例按新流程改写）。同一批发行产物以计划最低版本 0.60.2 / 0.2.9 装配当前宿主源码，desktop/android/ios 三端契约验证通过：各端注册四个同步、四个上传提供方及八个可保存表单；不代表对应客户端已发布。
- 插件：七仓在仓库外以公开 npm SDK 0.46.0 和新缓存冻结安装，类型检查、构建及 35 项已有测试通过。SDK/UI 公开下载与 npm 元数据摘要一致；七个中心 ZIP 的 SHA-256 与 GitHub Release 资产一致，包内文件与验证构建一致。
- `pnpm check:docs` 通过；改动文件 lint 无错误。
