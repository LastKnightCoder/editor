# 协议逻辑实现与 UI 交接

目标：先交付共享分发类型、可消费的数据接口与独立移动管理控制器，为 UI 专家提供稳定接入点。

范围：前两批实现协议和数据边界；UI 交付后本批补展示并完成模拟器联调，按最新用户授权顺序发布中心。不发布 npm、不开放移动 release 安装和格式 3 生产发布。D 原有待验收项保持不变。

## 任务列表

| 任务                                      | 状态     | 结果与下一步                                                                                                             |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Investigate/Triage/Understand the problem | COMPLETE | 已核对现有消费者；旧门户契约不能直接替换成跨端联合类型，需并行提供 v2 接口而不破坏既有页面。                             |
| 共享类型、兼容投影与网页数据接口          | COMPLETE | 已提供 @tau/plugins/center、PortalApi.center、center-queries；定向契约/HTTP 20+10 项通过，三包类型通过。                 |
| 拆分移动 PluginManager 控制器与行为回归   | COMPLETE | 控制器、直接动作校验、互斥、切库/卸载失效及安装取消已回归；PluginManager.tsx 已交给 UI。                                 |
| 验证与 UI 交接                            | COMPLETE | SDK 248、网页 85、移动 377、中心 API 87 项通过；类型、独立输出构建、边界和文档检查通过。下一步实现服务端与移动中心来源。 |

## 交接状态

### 模拟器联调与发布批次

目标：补齐移动展示，完成 Android/iOS 完整中心联调；通过后提交当前改动，备份迁移 D1，再依次发布 Worker 与网页。用户已授权该顺序；跨端发布、移动生产安装保持关闭，不发布 npm。

| 任务                                      | 状态        | 结果与下一步                                                                                                      |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE    | 已核对展示缺口与部署脚本；Cloudflare 只读检查成功，仅迁移 0012 待执行。本机隔离中心已通过真实审核生成两份测试包。 |
| 移动展示接线与行为回归                    | COMPLETE    | 展示与前台核验补齐；移动全量 402 项通过，整体 941 项通过。                                                        |
| Android/iOS 中心全流程联调                | COMPLETE    | 最终代码两端各 8 组通过；Android 2026-10-23 00:28:28 UTC，iOS 00:27:05 UTC；四份测试 ZIP 摘要和大小一致。         |
| 提交与顺序发布                            | IN_PROGRESS | 提交通过后的源码，备份迁移 D1 → Worker → 网页；生产跨端发布和移动安装保持关闭。                                   |

本批 UI 交接后由主任务接管剩余展示接线。启停等管理动作以原生清单的 development 判据为准，避免 Vite 打包调试应用时隐藏操作；原生 release 管理/安装门禁仍关闭。调试验证模式为 plugin-center-validation，正式构建不加载自动验证入口。测试中心仅监听本机 8787，控制端口 8788；审批、v2 目录/选版/下载/撤回走真实 API 处理器，D1/R2 使用隔离夹具，不写生产测试包。

iOS 本批模拟器编译出现 BUILD SUCCEEDED；Tauri 后续归档重命名遇到旧目录非空，与先前相同。已使用该次产出的模拟器 .app 安装并通过联调，不将其记为 IPA 导出成功。真机、视觉与 D 原待验收项继续保留。

模拟器发现并修复：iOS 的 Xcode 子进程未继承 shell 调试来源，由 simctl 显式传入测试进程；WKWebView 的 visibilitychange 未覆盖本次真实后台/前台切换，因此已补窗口/原生 focus 和可见状态下每 30 秒核验。只在存在中心包时订阅，复用刷新互斥，切库释放资源；该补偿有至多一个周期的检测延迟，不宣称撤回瞬时生效。修复后的两端完整矩阵重新执行，首次通过的 Android 结果不代替最终复验。

### 第二批任务

| 任务                                      | 状态     | 结果与下一步                                                                       |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | 已核对旧公共接口、不可变发布与原生事务；沿用现有身份和审批状态，使用独立平台投影。 |
| /v2 与格式 3 上传审核                     | COMPLETE | 本地路由、迁移、逐平台证据、CI 待审限制和 v1 过滤已通过 API 回归；已补平台计数。   |
| 移动原生与数据 hooks                      | COMPLETE | 固定来源命令、中心安装复验、状态缓存、前台撤回处理及 TS hooks 已接入。             |
| 整体验证与交接                            | COMPLETE | 原生、数据层、接口与 UI 消费回归通过；交接和发布边界已记录，D 验收继续保留。       |

第二批范围：完成本地 /v2 服务端、格式 3 上传与逐平台审核、移动原生中心数据源及数据 hooks；不修改 UI 专家的页面/展示文件，不发布 npm、不部署生产服务。D 待验收保持不变。

共享类型、/v2 服务端、格式 3 上传审核与移动原生数据源已在当前 worktree 实现，尚未部署。PluginManager.tsx 由 UI 专家修改展示；主任务只维护 data/、services/、宿主和原生逻辑。不得把本地实现当作生产中心已经开放。

### 对 ui-progress.md 的接线答复

- v2 首页现在返回 `platformCounts: { all, desktop, android, ios }`，续页为 null。计数受 q/category 影响，不受当前 platform、host 或客户端能力影响；每个平台按该视图的最新公开版本匹配资料，每个插件计一次。all 是全部视图的去重数，不能把三端计数相加当作 all；这是平台声明数，不是“本机可安装数”。共享类型为可选字段以兼容旧缓存/测试输入，新服务首页总返回四个数。UI 可将 `pages[0].platformCounts` 传给现有 PlatformFilter，数据缺失时继续不显示数量。
- `api/download.ts` 的 savePluginZip 已复用 UI 的 `components/saveBlob.ts`；保留 v1 下载调用，不修改保存工具本身。新旧下载共用保存逻辑，失败不触发保存。
- v1 useCatalog/uniqueEntries 继续保留给 ModerationPage；未改评论管理页，也不删除仍有消费者的旧查询。`["plugin-center-v2", "catalog"]` 缓存前缀保持不变。
- 上传预检的 usePluginReleases 已在数据层切到 v2 的全部平台版本，再投影成页面原有 ReleaseSummary 形状；不改 NewSubmissionPage/SubmissionView，也不遗漏格式 3 的最高版本。对应缓存独立为 `["plugin-center-v2", "publication-versions", pluginId]`。这是现有网页预检的补全，服务端继续执行同 ID/版本不可覆盖的规则，未新增禁止补发较低历史版本的限制。
- versions.ts 的 previousRelease 已改为泛型，可同时处理 ReleaseSummary 与 CenterRelease。VersionDiff 中删除 previousCenterRelease 并改用共享函数由 UI 文件负责人完成，主任务未直接编辑该组件。
- `PackageManifest` 已切换为 CenterManifest 联合类型，Upload/Submission/ReviewRecord 中的 manifest 都可为格式 3；以 formatVersion 判别，格式 3 没有顶层 minAppVersion，逐平台读取 targets。旧包仍使用原有字段。新上传只读预览可接 TargetMatrix；版本差异用两份清单各自的平台投影。
- `ReviewRequest.platformEvidence` 与 `ReviewRecord.platformEvidence` 已定稿，类型 `PlatformReviewEvidence` 从 contracts 或 @tau/plugins/center 导入。形状为 `{ android: { verified: true, note: "设备/系统、用例与验证结果" }, ios: ... }`；必须恰好覆盖包声明的平台，note 去空白后非空、原输入最多 4000 字符，verified 必须为 true。旧包不发送该字段。要求修改/拒绝时可省略，失败证据写审核 comment。
- 表单仍可保存 verified=false 的草稿；批准前调用 `readCenterReviewEvidence(manifest, form, true)` 获取已校验且规范化的请求值，无需自行复制验证规则或类型断言。该函数是 @tau/plugins/center 的真实导出。
- 审核缺项/多余平台/未确认/空说明返回 400 INVALID_INPUT；修订变化或同修订更换证据重试返回 409 REVISION_CONFLICT；发布开关关闭返回 409 SUBMISSION_LOCKED；角色/登录仍为 403/401。证据绑定审核修订、包摘要和源码提交，发布重试沿用同一记录，不能补传另一套证据替换审批。界面冲突后须读取最新修订，不能沿用旧确认。

## 已交付接口

| 入口                                                 | 导出与用法                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @tau/plugins/center                                  | CenterManifest（旧格式与格式 3 联合）、CenterHost、CenterTarget/CenterTargets、CenterVersion/CenterRelease、CenterReason、CenterCompatibility、CenterCatalogQuery/Page/Entry、CenterResolution、PluginCenterClient；为中心与宿主共用的 workspace 入口，不新增作者运行时 API 或 npm 发布。                                      |
| @tau/plugins/center                                  | normalizeCenterHost/normalizeCenterQuery 规范化条件；centerManifestTargets 投影旧包为 desktop；evaluateCenterCompatibility/resolveCenterRelease 只做结构与能力判定，输入必须已经过发布状态与来源核验，不授予安装权限。                                                                                                         |
| apps/plugin-portal/contracts/index.ts                | PackageManifest 为 CenterManifest 联合类型；上传、提交与审核均支持格式 3；ReviewRequest/ReviewRecord 增加 platformEvidence。旧格式保留原字段，v1 公共分发继续过滤格式 3。                                                                                                                                                      |
| PortalApi.center                                     | queryCatalog、listReleases、getRelease、resolve、statuses、download；沿用真实 HTTP 错误和 Cookie，公开只读 POST 不请求 GitHub 登录/CSRF。支持 AbortSignal，不回退 v1 或 mock。                                                                                                                                                 |
| web/src/features/catalog/center-queries.ts           | useCenterCatalog、useCenterRelease、useCenterResolution、useCenterVersions、useCenterDownload、centerKeys。缓存包含平台、完整宿主及过滤条件；UI 专家已接商店/详情，仍未部署。                                                                                                                                                  |
| web/src/api/mock/mockApi.ts                          | createMockApi({ centerReleases }) 可显式注入 CenterRelease 测试数据；无输入时新目录为空。模拟目录不生成或下载伪 ZIP；测试样本见 tests/fixtures/plugins/center.ts，仅供测试，不导入生产页面。                                                                                                                                   |
| mobile/src/features/plugins/data/usePluginManager.ts | usePluginManager、ManagedPluginItem、PluginManagerAction、PluginActionAvailability、pluginManagerKey。已有开发管理动作均是真实 services 调用；没有新增生产安装通道。                                                                                                                                                           |
| mobile/src/services/pluginCenter.ts                  | createMobilePluginCenterClient、readMobileCenterConfig、installMobileCenterRelease、refreshMobileCenterInstallations、MobileCenterError。请求通过原生命令；错误保留 status/code/message，不回退模拟。                                                                                                                          |
| mobile/src/features/plugins/data/center-queries.ts   | useMobileCenterConfig、useMobileCenterCatalog、useMobileCenterRelease、useMobileCenterVersions、useMobileCenterResolution、useMobileCenterStatuses、useMobileCenterInstall。目录与 resolve 返回 {config,query}，详情/历史/状态直接返回 query；安装返回 install(pluginId,releaseId)、cancel、phase、mutation、refreshStatuses。 |

CenterCompatibility 使用 status（unchecked/compatible/incompatible）、reasons、missingOptional；CenterReason 是按 code 判别的联合类型，附加字段为 minAppVersion、capabilities、formatVersion、apiVersion、profile 或 platform，不是拼接后的 detail 文案。UI 可按 code 生成本地文案，不重写业务判断。CenterTarget 的能力为 string 数组，展示不应丢弃未来能力名；本轮不改变现有运行时 portable 校验器的严格读取规则。

ManagedPluginItem 提供 id/name/version、enabled（下次启动意图）、active（当前运行）、pending、editor、error、hasBackup、settings，以及 actions 的 allowed/reason。控制器返回 loading/refreshing/error、actionError、saved、operation/busy、refresh、developmentInstall、canCancelInstall；动作 actions.run(kind,id)、installDevelopment(text)、cancelInstall 均返回 Promise。UI 可以将 restore 显示为“恢复备份”，cancelPending 显示为“取消待生效更新”，但不要直接调用 service。

MobilePluginPackage 与 ManagedPluginItem 已提供 currentVersion/显示用 version、pendingVersion、centerSource（origin/releaseId）、blocked、revoked（kind/reason）、statusStale；首次仅有 next 的安装不伪造已安装版本。statusStale 表示本次发布状态刷新失败，不证明设备物理离线。安装 phase 为 idle/downloading/checking/pending，仍无字节百分比。readMobileCenterConfig 返回 origin、真实 host、browsingEnabled、installationEnabled；生产浏览判据默认关闭，release 或非移动宿主安装关闭。服务端按平台关闭发行时，resolve 返回 DISTRIBUTION_UNAVAILABLE。

### UI 待办核对与应用级安装

- 应用级控制器已交付：`app/plugins/center-install.ts` 由应用 QueryClient 持有，`useMobileCenterInstall` 只订阅。页面隐藏/卸载不 abort；新页面可读相同 task，显式 cancel 才取消。安装结束后的缓存刷新不依赖页面是否仍挂载。`retry()` 重试本应用会话最近一次失败的确切 releaseId。
- 已安装数据补齐：revoked、statusStale、pendingVersion 已从原生/数据层投影；已有展示组件可消费。生产入口继续关闭，给 UI 的独立判据是 config.browsingEnabled；未来必须先部署并验证 v2，再在发行构建设置 TAU_PLUGIN_CENTER_BROWSING=true。该开关只允许浏览，不开放 release 安装。本次没有改变 UI 入口门禁。
- 更新与重试接口：useMobileCenterUpdate(pluginId, installedVersion) 只返回高于已装版本的兼容 release；ManagedPluginItem.retryAvailable 与 actions.retryCenter(pluginId) 对应最近失败中心任务。其他历史失败可重新进入商店选版，不伪造可重试操作。
- 权限：describeCenterPermissions(requested, previous) 返回 permission/label/newlyRequested；新增的是权限声明，不是已获授权状态。当前移动发布要求 permissions 为空，保留该限制。
- README 继续纯文本显示；本次不引入跨 app 引用或新的富文本执行入口。字节进度没有真实事件数据，因此只保留阶段。
- previousRelease 泛型、旧下载保存工具复用、v1 评论管理查询保留均已处理；diffManifest 对涉及格式 3 的对比跳过顶层 minAppVersion，由 TargetsDiff 表示逐平台变化。展示文件内删除重复函数、传入新状态字段不在本轮逻辑文件修改范围。
- 预检迁移涉及一条消费者测试：只将 packageSubmission.test.tsx 的 v1 夹具/缓存键改成 v2，保留原行为断言；没有为通过旧测试而回退真实数据接口。

安装确认用 resolve 返回的确切 release（版本、大小、manifest.permissions），随后调用 install(pluginId, release.releaseId)。原生重新 resolve，限定下载路径与来源、验证 ZIP；TS 对账规范化清单与审核记录；原生 commit 前再次 resolve。配置与服务端门禁任一关闭都不能提交。权限数组为空是当前移动可发布范围；移动业务数据授权尚未接入，上传含移动目标且声明非空 permissions 的包会被拒绝，不能让 UI 猜测权限已获授予。

移动启动与回到前台会刷新已安装中心版本状态。确认撤回持久保存；离线不清除既有拦截，not_found 不当作撤回。已撤回版本停用页面并把节点写入策略设为 none，静态正文到下次会话移除，原文保留。主线程死循环仍不能抢占；这不代替 D 真机交互验收。

## 后续逻辑工作（未在本批交付）

- UI 专家接上传/审核表单、平台计数和移动商店；本任务不代改其页面文件。
- portable 运行时的未知可选能力前向读取、模板正式发布门禁和旧作者迁移验证。
- 桌面正式格式 3 安装、完整三端中心联调以及 D 待验收矩阵。

## 首批验证记录

全量回归包含共享 worktree 中 UI 专家已经写入的组件，未修改其组件或进度文件。构建使用 output/plugin-logic 下独立目录，避免与 UI 专家的默认 dist 写入冲突。SDK 的 center 入口用于仓库内分发消费者，现有作者 tarball 不增加它；未执行 npm 发布。

- 验证快照合计 797 项通过：SDK 248、网页 85、移动 377、中心 API 87；各组日志在 output/plugin-logic-*.log，重复定向运行不计入总数。
- 一次移动全量并行运行中，既有 PluginProvider 会话测试触发 5 秒超时；未改其断言或超时，定向两文件 11 项通过，随后 maxWorkers=2 的全量 377 项通过。
- SDK、网页、中心 API 和移动类型检查通过。网页/移动普通 Vite 构建通过，保留原有大 chunk 提示；产物在 output/plugin-logic/web 和 mobile，不覆盖 UI 专家的默认 dist。
- 新改动 ESLint 无错误；既有 mockApi 保留 7 条规则警告。插件进程边界、git diff --check、文档检查通过（150 个 Markdown，0 处警告）。data/ 受现有 Prettier 忽略规则影响，本批显式用 --ignore-path /dev/null 对控制器与测试完成格式化。
- D 状态与待验收条目保持不变；未提交本批改动、未发布 npm、未部署或向生产中心写入。UI 专家的并行改动留在共享 worktree，未代其提交或修改。

## 第二批验证记录

- 独立测试组共 937 项通过：SDK 250、门户 API 98、门户前端 98、移动 398、Rust lib 93。各组最终日志为 output/plugin-v2-{sdk,api,web,mobile,rust}-final.log；重复定向运行不重复计数。
- SDK、API、门户与移动类型检查通过；网页/移动 Vite 构建使用 output/plugin-v2 独立目录，保留现有大 chunk 提示。Worker 使用 wrangler deploy --dry-run 校验构建，未部署。
- 回归包括 D1 旧数据迁移与外键、格式 3 审核证据与 CI 待审、v1 隔离、v2 分页/计数/选版、取消与撤回、固定来源与响应大小、离线状态、跨页面继续安装、显式取消与失败重试。原生 HTTP 测试只连接本机测试服务，不访问生产中心。
- 应用级安装取消所有权由页面卸载改为显式取消，相关旧断言已替换为“卸载后继续、新页面订阅同一任务”；没有放宽互斥、完整性或失败保护。提交预检的消费者测试只改接口夹具和缓存键。
- ESLint 无错误；保留存量和测试断言风格警告。格式、插件进程边界、git diff --check、文档检查通过。未引入新 npm 依赖。
- 设备核对：adb 无连接设备；xctrace 只有本机 Mac 和 iOS 26.3.1 模拟器，没有 iPhone/iPad 真机。本批未完成真机或视觉验收，D 状态与原待验收列表逐字保留。
- 尚未提交；未发布 npm、未推送外部模板、未部署生产中心、未打开生产移动安装。生产入口开放、真实发行与 D 验收仍独立推进。

## 展示接线与模拟器批次验证

- 自动回归共 941 项：SDK 250、API 98、网页 98、移动 402、Rust lib 93。移动新增真实版本与撤回投影、生产门禁以及前台监听补偿/清理回归。日志为 output/plugin-center-{sdk,api,web,mobile,rust}-final.log。
- SDK、API、网页、移动类型检查通过；移动普通生产构建通过，未包含自动验证阶段标记或本机中心测试地址。ESLint 无错误，保留现有测试风格警告；Rust 格式、进程/数据库/白板边界与文档检查通过。
- UI 待办 2/3/4/6/7/8/10/12 已接线；第 5 条使用原生 browsingEnabled 独立判据，生产浏览仍默认关闭；第 6 条没有伪造字节百分比；第 9 条 README 继续纯文本；第 11 条目录缓存键保持并由社区测试守护。第 1 条按本批顺序发布执行。
- Android API 36.1 与 iOS 26.3.1 使用专用应用、真实原生 HTTP/ZIP/文件事务、SQLite 与正常 AppShell；中心执行真实 API 处理器和审核逻辑，存储与身份是本机隔离夹具。已通过的报告不等同于生产云端移动安装验收，后者仍关闭。
- 模拟器结果和每阶段报告位于 output/plugin-center-validation/<平台>/；8 组覆盖商店/详情/权限确认、首次安装与启用、真正重启、计数器/ABC 数据往返、跨两层页面更新、损坏包失败与重试、取消下载/待生效、离线运行与撤回持久禁用。最终摘要与发布结果在本批任务表记录。
- 保留 D 原有五项待验收，不发布 npm，不把 simulator .app 成功标成 IPA 归档成功。
