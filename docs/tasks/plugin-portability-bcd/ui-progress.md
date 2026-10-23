# 插件中心 UI 进度（网站门户与移动端）

目标：为跨端插件中心交付网站门户与 Android/iOS 移动端的页面、展示组件、交互与组件测试，并接入主任务提供的真实数据接口。

本文件由 UI 专家维护，自含 UI 侧需求、页面与状态、界面选择、改动文件、验证，以及**交给主任务的全部待办**（见“交给主任务的待办”一节，主任务按该节处理即可，无需经用户转达）。协议、总进度与 D 待验收项以同目录 [README](README.md)、[正式接入方案](distribution-plan.md)、[工作分工](work-split.md)、[逻辑交接](logic-handoff.md) 为准；UI 完成不改变 D 状态，也不代表中心已上线。

## 任务列表

| 任务                                      | 状态     | 结果                                                                                                                    |
| ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | 核对门户与移动现有页面、`@tau/plugins/center` 类型、网页与移动数据 hooks。                                              |
| 网页与移动展示组件                        | COMPLETE | 平台筛选/标识、目标矩阵、可用性、targets 差异、平台证据；移动状态徽标、已安装卡片、商店条目、列表状态、历史、安装面板。 |
| 网页商店与详情接 v2                       | COMPLETE | CatalogPage/PluginDetailPage 改用 center-queries，平台筛选带计数，下载经 v2。                                           |
| 网页上传与审核接格式 3                    | COMPLETE | 包预览“平台”tab、包资料/卡片平台、v2 版本对比 + TargetsDiff、批准时逐平台证据、结果只读证据。                           |
| 移动插件中心（商店 + 已安装）             | COMPLETE | 插件中心双 tab、商店列表、商店详情页、安装面板全流程、已安装管理接 usePluginManager。                                   |
| 验证与交接                                | COMPLETE | 两端类型检查、全量测试、ESLint、前端构建与文档检查通过；剩余缺口全部列入下文待办。                                      |

## 需求摘要

- 网页没有真实宿主：选中某平台只表示浏览声明，不显示“当前设备可安装”；ZIP 下载不等于安装到手机。
- 资料只从 ZIP 提取，作者与审核者都不能在网页改平台声明；格式 3 批准须对每个声明平台提交验证证据。
- 移动只按中心 releaseId 安装；兼容结论、动作允许性与选版来自逻辑层，UI 只呈现与触发；卸载保留数据，清当前工作区数据独立确认，代码回退不代表数据回退。

## 页面与状态

网页（`apps/plugin-portal/web/src/`）：

| 页面/组件                       | 覆盖的状态与交互                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/plugins` CatalogPage          | v2 目录（不带 host）；平台筛选 `?platform=` 带各平台计数；分类、搜索防抖、排序；加载/失败重试/空态（含按平台空态）/加载更多；卡片平台标识；v2 下载。          |
| `/plugins/:id` PluginDetailPage | v2 历史按 SemVer 取最新；“平台支持”tab（目标矩阵，`?platform=` 高亮）；版本列表逐版平台标识与可展开声明、加载更多；“怎么安装”为未核验说明；旧格式标“仅桌面”。 |
| 提交页 SubmissionView（作者）   | 格式 3：包卡片显示声明平台；包预览“平台”tab 只读展示 targets 并提示需重新打包。                                                                               |
| 审核页 ReviewView               | 格式 3：版本对比用 v2 历史找上一版并附“平台声明变化”；批准时逐平台勾选+说明（绑定修订、修订变化作废、只随批准提交）；结果面板只读显示证据。                   |
| 组件                            | PlatformFilter、PlatformBadges、TargetMatrix、ReleaseAvailability、TargetsDiff（`targetChanges.ts`）、PlatformEvidence、`platforms.ts` 文案。                 |

移动（`apps/mobile/src/features/plugins/`）：

| 页面/组件                                     | 覆盖的状态与交互                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins` 页 PluginManager（插件中心）        | “商店/已安装”tablist（默认商店，`tab=installed` 直达）；安装控制器挂在页面上，切 tab/关面板不中断安装。                                                                   |
| PluginStorePanel（商店）                      | 本机平台 + 真实 host 目录；搜索防抖、分类条（计数）；开关关闭/无宿主提示；加载/失败重试/空态/加载更多/加载更多失败；条目主动作安装/更新/已安装/不可安装。                 |
| `pluginStoreDetail` 页 PluginStoreDetail      | 资料取本平台最高声明版本；可安装版本与原因；本平台目标摘要与其他平台；README 纯文本可展开；全平台版本历史（最新/可安装/已安装/未声明本平台）、加载更多；未找到/失败重试。 |
| CenterInstallSheet + InstallSheet（安装面板） | 选版中 → 不可安装（原因/配置错误/无宿主/开关关闭/已是最高）→ 确认（确切版本、大小、权限）→ 下载中/校验中（可取消，取消回到确认）→ 已待生效 / 失败可重试。                 |
| InstalledPluginsPanel（已安装）               | 失败/待生效（版本未知）/运行中/未运行/已停用；启用意图说明；动作与不可用原因（同原因去重）；卸载/清数据/恢复备份确认；插件设置入口；DEV 受控开发安装与取消。              |
| PluginEntries（“我的”）                       | 插件功能入口与“插件中心”入口分区；入口仍仅开发构建可见。                                                                                                                  |

## 界面选择

- 网页沿用方案 A 与 `FilterPill`/`Panel`/`Tag`；目标矩阵按 desktop/android/ios 固定顺序，未声明平台显式“未声明”；节点等级 Tag：可编辑 green、仅展示 blue、不支持 gray。
- 原因直接消费结构化 `CenterReason`，按码穷举生成文案（附所需版本、缺失能力）；`missingOptional` 显示为“部分功能不可用”。文案表网页与移动各一份（应用间不能互相引用）。
- 移动不用 Segmented；破坏性操作走 `MobileConfirmDialog`，安装走 `BottomSheet`，均自带返回拦截。下载/校验中返回手势不关闭安装面板。没有字节进度，只显示阶段文案，不伪造百分比。
- “更新”只在可安装版本高于已装版本时出现（`storeActions.ts`，用 SDK `comparePluginVersions`）；原生安装流程仍会重新选版核验。

## 交给主任务的待办

以下是 UI 侧已确认、但属于主任务文件或决策的事项；UI 已按当前接口做到最好，补齐后多数只需传参即可显示。

**必须处理（影响正确性或上线）**

1. 部署顺序：网页商店/详情/审核已改读 /v2，生产必须先部署 /v2 服务端再发布门户前端，否则页面按真实错误显示失败（不回退 v1）。
2. 提交预检看不到格式 3：`SubmissionView.tsx` 的提交前检查（`blockingRelease`）与 `NewSubmissionPage.tsx` 的“已发布最高版本”仍用 v1 `usePluginReleases`，v1 过滤格式 3，已发布过跨端版本时预检会误报通过（服务端仍拒绝）。建议改用 v2 历史，或在 `features/catalog/queries.ts` 提供包含格式 3 的作者视角版本查询。
3. 已安装页拿不到撤回状态：`ManagedPluginItem` 未投影 `MobilePluginPackage.centerSource`/`blocked`。请在 `data/usePluginManager.ts` 增加如 `centerSource: { releaseId } | null`、`revoked: { reason } | null`、`statusStale: boolean`（离线未刷新）；`InstalledPluginCard` 已有 `revoked` 状态与 `statusStale` 提示，接上即显示。
4. 安装生命周期依附页面：`useMobileCenterInstall` 卸载时会 abort，而页面被压到第三层及以下时 `<Activity>` 会卸载 effect。现在控制器挂在插件中心页/详情页，用户开始安装后连续深入两层页面，安装会被中断。建议把安装控制器提到应用级（如 PluginProvider）并暴露订阅式 hook，UI 改为消费即可。
5. 移动生产入口：`PluginEntries.tsx` 的插件中心入口仍是 `import.meta.env.DEV` 门禁。生产可见性需要主任务给出判据（例如中心 /v2 已部署且 `readMobileCenterConfig` 可用即允许浏览，安装仍由 `installationEnabled` 控制），提供后 UI 替换门禁。

**建议补充（体验与一致性）**

6. 待生效版本号与字节进度：原生清单只有 `pending` 布尔值、安装只有阶段。若补 `pendingVersion` 与下载进度，`PluginLifecycleView` 已支持 `pending.version` 与 `downloading.progress`。
7. 单条更新/重试动作：已安装卡片的“更新到 vX / 重试”目前不出现；如 `ManagedPluginItem` 提供可更新版本（或按已装插件批量选版），卡片已支持 `update`/`retry` 动作种类。
8. 权限可读文案：安装确认直接展示 `manifest.permissions` 原始码（如 `cards:read`），也没有“相对已装版本新增权限”的标记。需要 SDK/逻辑层提供权限的用户可读说明与新增权限差异；当前移动发布范围权限为空，不影响首期。
9. 移动 README 渲染：移动端没有安全的 Markdown 渲染组件（`@tau/markdown` 只有解析），商店详情按纯文本显示。若要富文本，建议把门户 `web/src/components/markdown/` 的安全渲染抽到共享包，由主任务协调包依赖。
10. 代码合并：`VersionDiff.tsx` 内 `previousCenterRelease` 与 `versions.ts` 的 `previousRelease` 同口径，建议把后者改为泛型后合并；`api/download.ts` 的 `savePluginZip` 可改为复用 `components/saveBlob.ts`；v1 `useCatalog`/`uniqueEntries` 仅剩 ModerationPage 消费。
11. 缓存键耦合：`features/community/useCommunity.ts` 的喜欢乐观更新已由 UI 改为修补 `["plugin-center-v2","catalog"]` 前缀；若调整 `centerKeys.catalog`，请同步该处（`community.test.tsx` 有用例守护）。
12. `diffManifest` 的“最低 Tau”字段对格式 3 显示为“—”，平台层变化由 TargetsDiff 呈现；如需更干净的对比，可在 `versions.ts` 对格式 3 跳过该字段。

**任务收尾时**：页面事实沉淀到门户 `web/README.md`（已同步商店/详情/审核说明）、`docs/architecture/mobile.md` 的插件宿主小节（插件中心双 tab、`pluginStoreDetail` 页、安装面板）与 `docs/architecture/plugin-portability.md`，随任务目录退役本文件。

## 改动文件

网页（`apps/plugin-portal/web/`）：

- 新增：`src/features/catalog/{platforms.ts,PlatformFilter.tsx,PlatformBadges.tsx,TargetMatrix.tsx,ReleaseAvailability.tsx,useZipSave.ts,platformDisplay.test.tsx}`、`src/features/submission/{TargetsDiff.tsx,targetChanges.ts,PlatformEvidence.tsx,reviewTargets.test.tsx,portableReview.test.tsx}`、`src/components/saveBlob.ts`。
- 修改：`src/pages/{CatalogPage,PluginDetailPage}.tsx` 及其测试；`src/features/catalog/PluginCard.tsx`；`src/features/submission/{PackagePreview,PackageFacts,PackageCard,VersionDiff,DecisionPanel,ReviewView}.tsx`、`packageFacts.test.tsx`；`src/features/community/useCommunity.ts`（仅目录缓存键与类型）、`community.test.tsx`；`README.md`。

移动（`apps/mobile/src/features/plugins/`）：

- 新增：`components/{pluginStatus.ts,centerDisplay.ts,storeActions.ts,PluginStatusBadge.tsx,InstalledPluginCard.tsx,StoreEntryCard.tsx,AvailabilityNote.tsx,TargetSummary.tsx,PluginListState.tsx,ReleaseHistoryList.tsx,InstallSheet.tsx,PluginHubTabs.tsx}`、`components/__tests__/pluginComponents.test.tsx`、`InstalledPluginsPanel.tsx`（由原 PluginManager 列表拆出）及其测试、`PluginStorePanel.tsx`、`PluginStoreDetail.tsx`、`CenterInstallSheet.tsx`、`storeFlow.test.tsx`、`pages/pluginStoreDetail.page.tsx`。
- 修改：`PluginManager.tsx`（改为插件中心双 tab）、`pages/plugins.page.tsx`（`tab` 参数）、`PluginEntries.tsx`。

未修改：所有 `queries.ts`/`center-queries.ts`、`data/`、`services/`、`api/`、`contracts/`、`PluginPageView.tsx`、router 与共享包、package.json。

## 验证

均为类型、行为、构建结果；未做截图、浏览器视觉走查或模拟器/真机验证。

- 类型检查：`pnpm --filter @tau/plugin-portal check:web`、`pnpm --filter mobile exec tsc --noEmit` 通过。
- 测试：门户 19 个文件 95 项通过；移动 76 个文件 396 项通过（含商店流程 7 项、组件 11 项、已安装 4 项）。
- 构建：`pnpm --filter @tau/plugin-portal build:web`、`pnpm --filter mobile exec vite build` 通过，仅有存量 chunk 体积提示。
- 本次文件 ESLint 无错误；保留与既有测试相同模式的空回调警告。文档检查通过。

## 需用户验收

- 网页：平台筛选与计数、卡片平台标识、详情“平台支持”与可展开版本声明、审核右栏（320px）里的逐平台证据表单、“平台声明变化”面板。
- 移动：插件中心双 tab、商店卡片与分类条横滑、详情页各分区、安装面板各阶段、已安装卡片与确认框；手机与宽屏两列、深浅主题、触摸与返回手感。
- 真实链路（模拟器/真机安装、更新、撤回）待主任务联调后验收；D 待验收项保持不变。
