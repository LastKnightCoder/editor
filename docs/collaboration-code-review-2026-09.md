# 实时协作代码腐化审查与治理（2026-09-13）

> 背景：移动端实时协作经 P0/P1 落地 + 三轮 code review + 附录 D 两轮迭代，补丁式修复累积，
> 出现文件膨胀与职责混杂。本次行动：全量 review → 沉淀问题清单 → 逐项评审解法 → 修复 →
> 复审循环，直至无明显问题，构建与测试全绿。
> 范围：`apps/mobile/src/features/collaboration/`、`apps/mobile/src-tauri/src/collaboration.rs`、
> `packages/collaboration/`、`apps/collaboration-server/`，以及详情页/保存链路接入点。

---

## 一、审查方法与基线

- 通读移动端协作全部 26 个文件（~3350 行）、Rust 网关与绑定模块、共享包 document.ts、
  服务端 store.ts/server.ts，对照桌面端实现（调研报告）与设计文档
  （`apps/mobile/docs/移动端实时协作方案设计.md`）逐层核对。
- 基线验证：`apps/mobile` tsc ✅ / 235 测试 ✅；`packages/collaboration` 31 测试 ✅；
  `apps/collaboration-server` 测试 ❌（进程崩溃，见 A1）。

## 二、问题清单与评审结论

每项按「问题 → 影响 → 解法评审（含否决的方案）」记录。标注【修复】的进入执行清单，
标注【接受】的记录理由不动代码。

### A. 测试基建

**A1【修复】collaboration-server 测试崩溃（Channel closed）**
- 现象：`local-content.test.ts` 套件加载即崩：`Cannot read properties of undefined (reading 'getPath')`。
- 根因：该测试经相对路径 import 桌面 `content-repository.ts`；桌面「todo 数据库模块化拆分」
  （提交 a87699e1）后，`tables/resource → operation → card/article/… → calendar-event/todo-item
  → todo-calendar-sync → holiday-service` 的传递依赖把 Electron 顶层单例
  （构造函数调 `app.getPath`）拉进了 Node 测试环境。既有 `database.ts` 桩未覆盖此链路。
- 解法评审：
  - a) vitest alias 给 `holiday-service.ts` 配桩（与 database-stub 同模式）——最小、聚焦 ✅
  - b) 把 `local-content.test.ts` 等桌面逻辑测试搬去 `apps/desktop` ——更正确的包边界，
    但 desktop 目前无 vitest 基建，本次不扩面（记为后续建议）。
  - c) 桌面 holiday-service 改惰性初始化——改生产代码修测试，风险不对等，否决。

### B. manager.ts（804 行）结构腐化

**B1【修复】单类承载 8 种职责，私有块对齐/恢复逻辑内嵌**
- 现状：生命周期（retain/release/start/stop）、启动交错循环、REST 门面、会话 CRUD、
  Hocuspocus 连接、/events 重连、发布共享（shareContent 单方法 110 行）、私有块对齐
  （collectPlaceholders/collectPrivateBlocks/alignPrivateNodes/restoreOwnerPrivateNodes ~130 行）
  全在一个类里。
- 解法评审：
  - 抽 `core/private-blocks.ts`：占位符收集、私有块收集、按位对齐、owner 恢复流程都是
    纯数据操作（不碰 manager 状态），抽出后 manager 回到「会话编排」单一职责 ✅
  - shareContent 拆为类内私有步骤方法（resolveDocumentId/mergePrivateNodes/firstProjection），
    保持事务边界不变 ✅（不抽独立文件——它与 manager 的会话/设备上下文强耦合，硬抽会造成
    参数爆炸）
  - REST 门面 4 个方法（joinByCode/decideJoinRequest/rotateInvitation/removeMember）模板
    重复 `whenReady + rest 调用 + refresh`，收敛为一个私有 helper ✅
  - 否决：整类重写为状态机/事件总线——改动面过大，现有语义经三轮 review 打磨，重写
    得不偿失。
- 双端漂移评审：桌面 `restorePrivateNodes` 只按 collabId 恢复（缺标注即报错），移动端是
  超集（按树位置对齐兜底）。抽取到 packages/collaboration 共享会改变桌面行为且两端数据
  访问层不同（better-sqlite3 vs tauri IPC），【接受】不合并，仅在文档记录差异。

**B2【接受】runStartLoop 的 finally 复活逻辑**
- stop→start 交错窗口的接续启动（第三轮 review 修复 #8 的载体），语义正确、注释完整。
  替代方案（代际计数状态机）复杂度同级，重写纯风险。【接受】保持，随 B1 拆分降低文件密度。

**B3【修复】死代码**
- `encodeDocumentState`（manager.ts 尾部导出）：P1 投影旧路径遗留，全仓无调用方。
- `export { base64ToBytes, bytesToBase64 }` 转导出：无外部使用（rest.ts 直连 bytes.ts）。

**B4【修复】CollaborativeEditor.fallbackContent 死 prop**
- prop 声明「binding 就绪前的本地内容」，组件内从未使用（keepLocal 走 getContentDetail
  现取）；ContentDetailPage 每次渲染还为其做 normalizeEditorContent。删除 prop 与传参。

**B5【修复】refresh() 串行建会话**
- `for (const info of documents) await this.openSession(info)`：每个文档一次 state 拉取
  （弱网含 3 次退避重试），10 个房间最坏阻塞启动 1 分钟+。openSession 已幂等
  （sessions + opening 双表去重），并行化安全：`Promise.all(documents.map(openSession))`。

### C. UI 一致性 / DRY

**C1【修复】MemberRow 活动文案双重显示**
- `memberActivity(member)` 同时渲染在第 139 行文本位与第 143 行徽章位，同一行重复两遍。

**C2【修复】待审批列表双实现**
- `CollaborationCenterPage` 的 `ApprovalRow` 组件与 `MemberManageSheet` 的内联 JSX 是同一
  交互的两份代码（头像/文案/拒绝/批准），文案已轻微漂移（「凭协作码申请」vs「批准后即可
  实时协同编辑」）。抽 `components/ApprovalRow.tsx` 共用，副文案参数化。

**C3【修复】协作中心分组列表重复 JSX**
- 「我发起的/我加入的」两组各写一遍 GroupLabel+容器+map，抽局部 `SessionGroup`。

### D. Rust 网关

**D1【修复】ensure_identity TOCTOU 竞态 + 每请求读盘**
- `collab_request` 每次都 `read_identities`（磁盘 IO）；且「读→无→注册→写」非原子，
  首次注册窗口内并发命令会向服务器注册两个设备（服务端限流 5/h，双身份其一即失效浪费）。
- 解法：进程内 `tokio::sync::Mutex` 保护的内存缓存（OnceLock），注册串行化、命中走内存。

### E. 评审过、明确不动的（防复发备忘）

| 项 | 结论 |
| --- | --- |
| 服务端 store.ts 624 行 | 职责分段清晰（鉴权/票据/文档/Yjs/资产/配额），已部署服务，拆分收益 < 回归风险 |
| useEditContent 三向保存兜底 | 复杂但必要（附录 D 第二轮记录的三种竞态），语义已收敛，不动 |
| 移动端 WS 由 WebView 直连 vs Rust 桥 | 设计文档 §3.1 已定案（方案 A），不动 |
| 桌面 CollaborationManager 1027 行 | 桌面端不在本次范围（移动端接入引发的腐化聚焦），仅记录 |
| @tau/collaboration 包入口引 yjs 进主 bundle | 既有决策（editorContentUtils 注释 + store.ts 别名导入），本次保持 |

## 三、执行结果

### 第一轮修复（按问题清单逐项落地）

| 项 | 落地方式 | 验证 |
| --- | --- | --- |
| A1 | 三层修复：① 测试对桌面传递依赖的 Electron API 改用 `vi.mock`（`tables/resource` + `video-note-index-queue`，对齐桌面自家测试的做法）+ vitest alias `electron` → 最小桩 + 补 `@tau/db-schema` 别名；② better-sqlite3 从 13.0.3 降到 12.10.1（13 的 win32 prebuild 在 Node 22.13.1 加载即段错误，12.10.1 正常）；③ 根 postinstall 增加 Node ABI 恢复（见下） | 6 文件 26 测试全过（此前进程崩溃） |
| B1 | `core/private-blocks.ts` 新模块（占位符/真身收集、按位对齐、`mergeSessionPrivateNodes`、`restoreOwnerPrivateNodes`，116 行）；manager.ts 804→718 行，REST 门面收敛为 `act()` 模板，shareContent 拆出 `publishNewDocument` / `seedSessionPrivateNodes` | tsc + 235 测试过；懒 chunk 保持 |
| B3 | 删除 `encodeDocumentState` 与 bytes 转导出 | tsc 过（无引用残留） |
| B4 | 删除 `CollaborativeEditor.fallbackContent` 死 prop 及 ContentDetailPage 传参 | tsc 过 |
| B5 | `refresh()` 改 `Promise.all` 并行建会话（openSession 幂等去重不变） | 235 测试过 |
| C1 | MemberRow 删除与徽章重复的活动文案行 | 构建过 |
| C2 | 新 `components/ApprovalRow.tsx`，协作中心与成员 Sheet 共用（副文案参数化，消除双实现漂移） | 构建过 |
| C3 | 协作中心抽 `SessionGroup` 局部组件，消除两组分组 JSX 重复 | 构建过 |
| D1 | Rust `identity_cache()`（OnceLock + tokio::sync::Mutex）：注册串行化消灭 TOCTOU 双注册，缓存命中免去每请求读盘 | cargo check 过 |

### A1 的深层根因与结构性修复（postinstall ABI 循环）

排查中发现一个超越「代码腐化」的环境级腐化链，正是协作服务器测试长期「跑不起来」的根源：

1. 根 `package.json` 的 `postinstall` 每次 install 都执行 desktop 的
   `electron-rebuild -f -w better-sqlite3,node-pty`；
2. electron-rebuild 在 pnpm 布局下会遍历整个 store，把**所有** better-sqlite3 实例
   （含 collaboration-server 依赖的）重编为 Electron ABI（输出可见 "Building modules:
   better-sqlite3, node-pty, better-sqlite3" 两份）；
3. 于是 collaboration-server 在 Node 下加载 better-sqlite3 即 ABI 报错/段错误
   （此前 13.0.3 时代表现为 worker 直接崩溃）。

修复：`scripts/postinstall.mjs` 承载安装后 ABI 治理——先跑 desktop rebuild（个别模块
本机编译失败仅告警不阻塞），随后对 collaboration-server 的 better-sqlite3 目录执行
`prebuild-install` 恢复 Node ABI 二进制。跨平台（纯 node 脚本，规避 cmd/bash 的
`||`/`true` 差异），并给嵌套 pnpm 关闭 `verify_deps_before_run` 防止二次安装循环。
端到端验证：`node scripts/postinstall.mjs` → rebuild 完成 → 恢复完成 → 26 测试全过；
桌面 patched 12.10.0（Electron ABI）与 server 12.10.1（Node ABI）双实例并存互不干扰。

另外：既有 vitest.config 的 database-stub 绝对路径 alias 属死配置（Vite alias 按原始
导入说明符匹配，绝对路径 key 永不命中），已移除；改用 `vi.mock`（按解析后路径匹配，
可命中传递依赖）。

### 第二轮复审发现（含已修与记录项）

1. **【已修】自身引入的注释失实**：Rust `identity_cache` 首版注释声称「锁按 URL 隔离」
   但实现是全局单锁——改写注释如实说明（注册每服务器仅一次，全局锁足够，不值得分锁）。
2. **【已修】`seedSessionPrivateNodes` 缺 async**（内含投影 await），tsc 捕获后修正；
   过程中一处误编辑产生的垃圾行已即时清除。
3. **【已修】postinstall 初版 `|| true &&` 写法**在 Windows cmd 下不可用，改为 node 脚本。
4. **【记录】主 bundle 实际包含 yjs**：vite manifest 证实入口的全部协作组件均为
   dynamicImports、协作运行时在 `manager-*.js` 懒 chunk ✅；但主 bundle 经
   `@tau/editor` 的静态协作插件层（`withCollaboration` 顶层 import）包含了 yjs 运行时
   （manager 懒 chunk 静态依赖主 chunk，共享同一份 yjs，无重复打包）。设计文档附录 C
   「入口 chunk 不含 yjs」的验证结论不准确。属编辑器包既有设计（桌面同构），非本次
   引入；根治需把 `withCollaboration`/`Cursors` 改为按需装配，影响面大，列为后续优化。
5. **【记录】`restoreOwnerPrivateNodes` 物化时机微调**：抽取后 cloudContent 在调用时
   （await tauri 前）物化，原实现是等待后物化。差异窗口内 provider 同步的更新不再反映
   到对齐输入；对齐场景（首投影未完成、无并发写者）无实际影响，失败仍有投影防覆盖兜底。
6. **【记录】服务端 `local-content.test.ts` 等桌面逻辑测试归属错位**：跨包 import 桌面
   源码是包边界违规（本次靠 vi.mock 修复其可运行性），建议后续迁至 apps/desktop 的
   测试基建（desktop 目前无 vitest node 配置）。

## 四、最终验证（2026-09-13）

| 检查 | 结果 |
| --- | --- |
| `apps/mobile` `npx tsc --noEmit` | ✅ 通过 |
| `apps/mobile` vitest | ✅ 49 文件 235 测试全过 |
| `apps/mobile` `npx vite build` | ✅ 通过；`manager-*.js` 懒 chunk 保持（协作运行时不进主入口的直接依赖） |
| `apps/mobile/src-tauri` `cargo check` | ✅ 通过 |
| `packages/collaboration` vitest | ✅ 3 文件 31 测试全过 |
| `apps/collaboration-server` vitest | ✅ 6 文件 26 测试全过（修复前：进程崩溃） |
| `node scripts/postinstall.mjs`（ABI 治理链） | ✅ rebuild + 恢复 + 测试全过 |

## 五、后续建议（未在本次执行）

1. **@tau/editor 协作插件按需装配**：消除主 bundle 中的 yjs（约省 50KB gz 预估），
   需同步回归桌面协作编辑。
2. **桌面逻辑测试迁移**：`local-content.test.ts` / `content-sessions.test.ts` 中测
   桌面模块的部分迁至 apps/desktop，消除跨包源码 import。
3. **桌面 CollaborationManager（1027 行）同型治理**：本次范围外的桌面端，可复用本文
   的拆分思路（私有块模块化 / REST 门面模板）。
4. 真机联调（Android 光标补丁 × withYjs，设计文档 §7 R1）仍是上线前必验项。
