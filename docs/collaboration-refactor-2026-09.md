# 实时协作代码治理行动（2026-09）

## 背景与方法

移动端接入实时协作后，与桌面端、collaboration-server、`@tau/collaboration` 共享包形成了四端并存的协作体系。多次迭代后疑似出现补丁式代码堆积与文件膨胀。本次行动的方法：

1. **独立评审**：派出 3 个互不知晓彼此结论的独立 agent，分别评审「服务端+共享包」「移动端」「桌面端（含横向对比）」，避免主上下文锚定判断。
2. **沉淀决策**：所有问题进入本文档逐条决策——采纳修复 / 消融删除 / 搁置（附理由）。
3. **分批修复**：按风险从低到高分批执行，每批后跑构建与测试。
4. **多轮循环**：修复完成后再派独立 agent 复审，直至无明显问题。
5. **消融原则**：对每个抽象层问一句"删掉它会损失什么"——优先删除而非新建；不为"文件变小"而引入新层；不为假设的未来需求保留机制。

## 评审核心结论（三份报告的交叉印证）

- **数据层健康**：`@tau/collaboration`（协议类型 + Yjs 编解码 + 校验）是真正的多端共享包，被服务端、桌面双进程、移动端、editor 包四方消费，职责清晰。
- **腐化集中在连接/状态机层**：同一套 Hocuspocus transport 池、/events 通道、refresh 对账、leave 状态机、发布幂等流程在「桌面主进程 / 移动 TS / 移动 Rust」三处平行维护，且已发生单端修复不回流（`useStableSessionStatus` 的 effect 依赖修复只在移动端）。
- **测试基建侵入生产**：桌面的 `content-repository`/`local-store` 测试寄居在 collaboration-server 包内，Electron 桩进入生产 `src/`，导致服务器包 `pnpm check` 长期红灯、被部署脚本绕过。
- **四个上帝文件**：server `store.ts`(624 行 9 职责、3 套缓存失效契约)、server `server.ts`(7 类关注点)、mobile `manager.ts`(718 行 10 块职责)、desktop `index.ts`(1027 行、23 项注入)。
- **真实风险点**：`alignPrivateNodes` 按位对齐在同类型多私有块时可产生静默错位（E1）；其存在根源是首次投影 fire-and-forget（A5）。

## 问题决策表

严重度：高/中/低。决策：✅采纳 / 🗑️消融（直接删除）/ ⏸️搁置。

### 服务端 + 共享包

| 编号 | 问题 | 严重度 | 决策 | 方案 |
|---|---|---|---|---|
| R6 | 桌面测试寄居服务器包、electron-stub 进生产 src、check 长期红 | 高 | ✅ 批次二 | 桌面模块测试迁 `apps/desktop`；stub 随迁；删服务器 vitest 桌面别名 |
| R19 | store.ts 624 行 9 职责 | 高 | ⏸️ 部分搁置 | 本轮不机械拆文件（拆分收益低于 diff 风险）；先砍 authorizeCache(R5) 与重复块，职责收敛后复审 |
| R5 | 双重 authorize + 5s TTL 缓存补丁 | 中 | 🗑️ 消融 | beforeHandleMessage/beforeSync 共用 hook context 鉴权结果，删 authorizeCache 及失效契约 |
| R8 | awareness color 注入无消费者 | 中 | 🗑️ 消融 | 删除服务端 color 计算；两端 UI 均用 `memberColor` |
| R9 | 资产引用 visit 闭包两份 + ASSET_PREFIX 硬编码 | 中 | ✅ 批次三 | store 内抽私有 `collectAssetReferences`（服务端唯一消费，不上共享包） |
| R18 | GET join-requests 写副作用 + 文档列表 N+1 | 中 | ✅ 批次三 | 过期判定移到读取过滤；列表用单条 SQL 批量取成员 |
| R2 | awareness 限流空串兜底桶 + 两种窗口写法 | 中 | ✅ 批次三 | 无 socketId 直接 return；抽共用滑动窗口 |
| R1 | leave 路由吞 403/410 | 中 | ✅ 批次三 | 区分错误码，只吞"已关闭/非成员" |
| R20 | server.ts 多关注点 | 中 | ⏸️ 搁置 | 限流 helper 收敛后剩余职责内聚可接受；复审再定 |
| R3 | 永久 ALTER TABLE 迁移分支 | 低 | ⏸️ 搁置 | 涉及已部署生产数据，动迁移门禁风险 > 收益；注释说明退役条件 |
| R12 | store.members 占位假数据 | 低 | ✅ 批次三 | 返回类型去掉 online/activity，由 server 层补全 |
| R13 | AssetInfo 死导出 | 低 | 🗑️ 消融 | 删除 |
| R14 | update.sh/rollback.sh 死脚本 | 低 | 🗑️ 消融 | 删除并核对 README |
| R15 | y-protocols 误入 dependencies | 低 | ✅ 批次一 | 移 devDependencies |
| R17 | verify-backup 仅存在性校验 | 低 | ⏸️ 搁置 | 已知风险已记入部署文档 |
| R4/R10/R11 | unlink 重复块 / 65536 魔数 | 低 | ✅ 批次三 | 抽 unlinkIfOrphan 与常量 |

### 移动端

| 编号 | 问题 | 严重度 | 决策 | 方案 |
|---|---|---|---|---|
| E1 | alignPrivateNodes 按位对齐静默错位 | 高 | 🗑️ 消融 | 删除对齐层；无标注一律判冲突/留空走防覆盖提示（宁要明确失败不要静默错位） |
| A5 | 首次投影 fire-and-forget | 中(与 E1 联动) | ✅ 批次四 | 首次投影失败显式抛错（房间已建、绑定已写，重试路径自动补投影），消灭"绑定在而标注缺"的窗口 |
| A1 | useEditContent 三层保存兜底三口子 | 高 | ✅ 批次四 | 收敛为单一 `saveMode`；守卫拒绝被动转投影保留为内部防御 |
| B1/B2 | session-status / presence 与桌面逐行复制已漂移 | 高 | ✅ 批次五 | 下沉 `packages/collaboration/src/view.ts`，两端消费同一实现，桌面获得 bug 修复 |
| C1/C2 | snapshot()/selectSession() 死代码 | 中 | 🗑️ 消融 | 批次一删除 |
| C7 | changed() 按键级全量广播 + 元素引用共享 | 中 | ✅ 批次四 | 广播前摘要比对 + sessions 元素浅拷贝 |
| B3 | normalizeServerUrl 三份实现 | 中 | ✅ 批次四 | TS 侧统一 import 共享实现，删手抄副本 |
| B4 | 退出/结束共享双实现 | 中 | ✅ 批次四 | 抽 `useLeaveCollab` |
| B5 | 幂等键两端格式不兼容 | 中 | ✅ 批次五 | 规范（字段+派生）写入 protocol.ts；两端键格式统一为共享构造器，跨端重复发布可去重 |
| B6 | 双协作编辑页能力不对称 + UI 重复 | 中 | ✅ 批次四 | 抽共用状态横幅组合；CollabEditorPage 补 retry |
| F1 | manager.ts 职责过载 + core→cards 反向依赖 | 中 | ✅ 部分 | getContentLength 上移共享包；不机械拆文件，复审再定 |
| F2 | CollaborativeEditor 241 行过载 | 中 | ✅ 批次四 | 拆出兜底裁决弹窗 |
| F3 | runtime 挂载靠 7 处纪律 | 中 | ✅ 批次四 | manager 在未启动时读设置兜底（防御收口到一处） |
| 4.3-1 | 四页面五件套协作样板 | 中 | ✅ 批次四 | 抽 `useContentCollabEntry` |
| 4.3-2 | ContentDetailPage 布尔组合态机 | 中 | ✅ 批次四 | 显式 editMode 枚举统一派生 |
| G1 | secret 明文落盘 | 中 | ⏸️ 搁置 | 需引入平台 Keychain 插件，属独立功能项，不在本轮防腐范围 |
| C3 | frozen/mode 协议字段移动端空转 | 低 | ✅ 批次四 | 移动端类型收窄注释（协议字段保留，桌面消费） |
| C5 | throttleHandleEditorContentChange 误导别名 | 低 | 🗑️ 消融 | 批次一删除 |
| C6 | 协作中心审批 busy 恒 false | 低 | ✅ 批次四 | 接 busy 管理 |
| B7 | getContentLength 双端手抄 | 低 | ✅ 批次五 | 上移共享包 |
| B8 | RemoteDocument 冗余交叉类型 | 低 | 🗑️ 消融 | 批次一改用 SharedDocumentInfo |
| D | bytes.ts 三端 base64 碎片 | 低 | ✅ 批次五 | 上移共享包 encoding.ts |
| G2 | disposeSession 后 doc 监听残留 | 低 | ✅ 批次四 | 摘除监听 |
| G3 | 附件 P2 缺口无降级渲染 | 低 | ⏸️ 搁置 | 属功能缺失而非腐化，记入后续路线 |
| G4 | 测试失衡 | 低 | ✅ 随批补 | 关键修复各带测试（消融对齐层、saveMode、广播优化） |

### 桌面端

| 编号 | 问题 | 严重度 | 决策 | 方案 |
|---|---|---|---|---|
| D2 | 三个死 IPC handler（content-title/binding/metadata） | 高 | 🗑️ 消融 | 批次一删除（全仓无调用） |
| D4 | useStableSessionStatus effect 依赖缺陷 | 中 | ✅ 批次五 | 随 B1 下沉自动修复 |
| D5 | leave 内联 SQL 绕过 clearBinding | 中 | ✅ 批次六 | 复用 clearBinding |
| D6 | createContent finally 二次猜测 | 中 | ✅ 批次六 | 读码后显式化 |
| D10 | JSON.stringify 对比共享内容 | 中 | ✅ 批次六 | 读码后换稳定比较 |
| D9 | 命令层内联 import() 类型 | 低 | ✅ 批次一 | 顶部 type import |
| D11 | re-export 转发链 | 低 | 🗑️ 消融 | 批次一清理 |
| D1 | God Class 1027 行 | 高 | ⏸️ 部分搁置 | 本轮只做死代码/合并排空逻辑等低风险项；完整拆分作为路线图（见后） |
| D3 | 窗口排空逻辑三处平行 | 中 | ⏸️ 评估后定 | 批次六读码评估合并成本 |
| D7 | local 模式特判 15+ 处 | 中 | ⏸️ 搁置 | 重构面大、纯桌面内部，复审轮再评估 |
| D12 | 测试归属错置 | 低 | ✅ 批次二 | 随 R6 迁移 |

### 架构级建议的消融裁决

评审提出的两项大架构改造，本轮裁决如下：

- **共享 runtime 子模块**（把 transport/events/refresh/leave/发布流程下沉 `@tau/collaboration`，消除 600+ 行三端重复）：⏸️ **方向认可、本轮不做**。理由：桌面主进程（Electron/Node）与移动端（WebView+Rust 网关）环境差异大，统一 runtime 需要传输适配器抽象，属于"先建架构再验证"的高风险改造；本轮先把**零依赖的展示层推导**（session-status/presence）下沉拿到 80% 收益，runtime 统一留待下一轮以真实需求驱动。
- **包入口 exports map**：⏸️ **搁置**。monorepo 内部 TS 源直接消费，现有 `/src/*` 子路径风格统一后即可；exports map 对内部包是过度工程。

## 执行批次

- 批次一：纯删除与别名清理（死代码、死脚本、死导出、误导别名、re-export 链、y-protocols 依赖位置）
- 批次二：测试基建（桌面测试迁出服务器包，恢复 check 绿灯）
- 批次三：服务端简化（砍 authorizeCache、资产引用收敛、N+1、限流兜底、leave 吞错、占位假数据、魔数）
- 批次四：移动端结构（E1+A5 消融对齐层、saveMode 收敛、广播优化、B4/B6、F2、G2、C6、五件套收敛、editMode 枚举）
- 批次五：共享包下沉（view.ts、encoding、getContentLength、幂等键规范）
- 批次六：桌面端（死 handler 删除后的收尾、leave SQL、createContent、JSON.stringify）
- 终验：全量构建 + 测试；第二轮独立复审；消融实验总结。

## 执行记录

### 批次一：纯删除与别名清理
- 移动端：删 `manager.snapshot()`、`store.selectSession()`、`throttleHandleEditorContentChange` 误导别名（两处调用方改名）、`RemoteDocument` 冗余交叉类型（改用 `SharedDocumentInfo`）。
- 服务端：删 awareness `user.color` 注入（全仓无消费者，两端均用 `memberColor` 派生）；`y-protocols` 移出 dependencies；删 `scripts/update.sh`/`rollback.sh` 死脚本并更新 README。
- 桌面端：删 `content-title`/`binding`/`metadata` 三个死 IPC handler；清理 `memberColor`/`editingMemberCount` re-export 转发链；`commands/collaboration.ts` 内联 `import()` 改顶部 type import。
- 验证：三端 tsc 绿，服务器测试 26 全绿。

### 批次二：测试基建
- `local-content.test.ts`/`content-sessions.test.ts`（测桌面模块）迁至 `apps/desktop/src-electron/main/modules/collaboration/__tests__/`，内联 `vi.mock("electron")` 对齐桌面既有测试风格；补齐迁移测试缺失的 `viewActiveTabs` 字段（寄居期间桌面代码已演进）。
- 删服务器 `src/testing/electron-stub.ts` 与 vitest 桌面别名；服务器 devDeps 删 `slate`/`@slate-yjs/core`/`y-protocols`。
- **服务器 `pnpm check` 恢复绿灯**（此前因跨端测试别名长期红灯，部署文档 2026-09-06 条目已更正）。
- 桌面 vitest 增加 better-sqlite3 → Node ABI 实例别名（解析到 collaboration-server 的实例，该实例由根 postinstall 维持 Node ABI）；顺带修复既有 src-electron 测试的 ABI 问题（diary-table 从 9/9 失败到 8/9 通过，余 1 个为产品代码演进后的既有桩缺失，与本轮无关）。
- 根 package.json 增 `test:collaboration:desktop` 使迁移测试可被发现。

### 批次三：服务端简化
- **消融 authorizeCache**：删除 5s TTL 鉴权缓存与 `invalidateAuthorization` 失效契约（3 处调用）。鉴权收口为 `beforeHandleMessage`（每条消息必经，hocuspocus 4.6.0 已核实）+ `appendUpdate` 内部防御，撤权/封禁实时生效（"撤权后拒绝更新"测试通过佐证）。
- 资产引用遍历收敛为模块级 `collectAssetReferences`（用 `ASSET_PREFIX`，消除两份硬编码 visit 闭包）；孤儿文件删除收敛为 `unlinkIfOrphan`；`WS_OVERHEAD_BYTES` 常量替代 65536 魔数。
- `requests()` 读路径写副作用移除（SELECT 过滤过期，decide 显式报 EXPIRED——用户可见变化：过期申请审批由静默忽略改为报错提示）。
- 文档列表 N+1 修复：`store.membersOf()` 一条 SQL 批量取成员 + server 层 `mergeOnline` 合并在线态。
- awareness 限流空串兜底桶修复（`!context || !socketId` fail-closed）；两套手写限流收敛为 `windowLimiter` 工厂。
- `store.members()` 返回 `Omit<Member, "online"|"activity">`（去占位假数据）；leave 路由幂等吞 403/410 补注释；PATCH `/v1/devices/me` 返回 `{id, nickname}`。

### 批次四 a：移动端核心机制
- **消融对齐层（E1）+ 首次投影同步化（A5）**：删除 `alignPrivateNodes` 树位置对齐（同类型多私有块时按位对齐可产生静默错位）；首次投影失败显式抛 `COLLAB_PROJECTION_FAILED`（房间与绑定已就绪，重试走复用路径自动补投影），消灭"绑定在而标注缺"的窗口。私有块对应关系只认 collabId 一种来源，无标注判冲突引导重新发起（宁要明确失败不要静默错位）。
- `useEditContent` 三口子（persistEnabled/persistVia/onProjectionPersisted）收敛为单一 `saveMode: "direct" | "collabProjection" | false`；守卫拒绝被动转投影保留为内部防御。
- `ContentDetailPage` 布尔组合态收敛为 `detailEditMode()` 枚举单点派生（local/collabConnecting/collabLive/collabFallback）。
- `changed()` 广播优化：摘要比对（无变化不写 store）+ sessions 元素浅拷贝（切断引用共享）；`stop()` 同步失效摘要。
- `disposeSession` 摘除 doc 标题监听（`detachDocListener`）。
- `whenReady` 兜底启动：协作页面漏挂 runtime 时按用户设置就地启动，不发往默认服务器（防御收口到 manager 一处）。
- `CollaborationSection` 删手抄 `validateServerUrl`，复用共享 `normalizeServerUrl`。

### 批次四 b：移动端 UI 去重
- `leaveCollab.ts`：退出/结束共享的文案与执行单源（原三处手抄：编辑页 screen、成员 Sheet）。
- `useCollabSession`：`useCollaborationDocument + useCollaborationPresence + useCollabProjection + useStableSessionStatus` 四件套组合，两个编辑页共用；`CollabEditorPage` 补重试按钮（与详情页能力对齐）。
- `LocalFallbackChoiceDialog`：裁决弹窗从 `CollaborativeEditor` 拆出（keepLocal/adoptCloud 逻辑随之迁移）。
- `useContentCollabEntry`：四类详情页（文章/卡片/知识库/项目文档）的五件套（绑定查询/菜单项/ShareSheet/onResume/结束回调）收敛为一行 hook + 一个渲染片段。
- 协作中心审批行接入 busy 管理（防连点重复提交）。

### 批次五：共享包下沉
- 新增 `packages/collaboration/src/view.ts`（sessionStatus/useStableSessionStatus/useCollaborationPresence）、`encoding.ts`（base64 分块编解码）、`content-length.ts`（字数统计唯一口径）。两端原路径改为薄转发，消费方零改动；**桌面自动获得瞬时同步 effect 依赖修复**（高频广播下"正在同步"徽标曾被无限推迟）。
- `packages/collaboration` 增 `words-count` 依赖与 optional react peer；移动端 `manager.ts` 的 core→cards 反向依赖解除（getContentLength 直连共享包）；移动端/桌面 `words-count` 直接依赖随之清理。
- 幂等键跨端不互认的现状**文档化**于 `protocol.ts`（跨端统一需先对齐桌面 generation 语义，属行为变更，本轮不做）。
- 新增 encoding/content-length 测试 8 个；修复既有 `tabs-migrate-doc.test.ts` 类型错误。

### 批次六：桌面端
- `clearBinding(session, discard)` 参数化：丢弃语义跳过投影与进行中检查，删除 leave handler 的内联 SQL 兜底。
- `createContent` 的 finally 二次猜测改为显式 catch 失败恢复。
- `useContentSessionStore` 改稳定序列化（键序无关）对比，消除漏更新。
- `discard-local` IPC 契约删除被 handler 忽略的第二参数（调用方/契约/实现对齐）。

### 第二轮独立复审（2 个互不知晓的 agent）
- **现状复审**：前轮六项结论全部确认落地（鉴权链完整、静默失败消除、单源收敛、死代码清零）；无高严重度新问题；新代码质量整体评价高。
- **diff 审查**抓出 1 高 3 中，全部修复：
  1. 【高】投影通道 `drift`/`unbound` 未落库被当保存成功（改动静默丢失）→ `projectContent()` 返回落库与否，未落库回退常规直写，双通道竞态时显式报保存失败。
  2. 【中】绑定出现瞬间节流窗口内输入被丢弃 → `collabConnecting` 期 saveMode 改 `collabProjection`（残留输入按本地兜底改动处理，经裁决弹窗解决）。
  3. 【中】单文档建会话失败拖垮整个列表刷新 → `Promise.allSettled` 逐项容错，全部失败才按连接失败处理。
  4. 【中】根 postinstall 的 prebuild-install 无容错 → try-catch + 警告（对齐 rebuild 容错）。
- 复审另发现：桌面 `init()` 单条缓存损坏瘫痪全模块（→ 逐会话 try-catch + 丢弃 + 清资源目录）、`discard-local` 契约不符（→ 上述）。
- 补充测试：`useEditContent` 新增 saveMode 四态用例（投影成功/漂移回退/双通道兜底失败/false 短路）。

### 第三轮验证复审
- 8 处第二轮修复逐项验证**全部通过**；抽查（requests 注释与 SQL、words-count 清理）无异常；结论：**无中/高严重度遗留，达到可收敛状态**。
- 剩余 3 项低严重度已顺手处理：init 丢弃路径补资源目录清理；direct 模式投影兜底成功也标记待裁决（守卫拒绝本身证明绑定仍在）；saveMode 测试补缺。

## 消融实验记录

「删掉它会损失什么」——每一项都经过删除后构建+测试验证：

| # | 删除的架构/机制 | 理由 | 验证 |
|---|---|---|---|
| 1 | `alignPrivateNodes` 树位置对齐层 | 同类型多块按位对齐可静默错位（真身绑错 collabId）；首次投影同步化后"无标注"只剩异常场景 | tsc + 全测试绿；无标注路径判冲突，链路自洽 |
| 2 | `authorizeCache`（5s TTL + 失效契约） | 同一消息双重鉴权的自我补丁；实时查库（better-sqlite3 微秒级）换撤权即时生效，消除"每个撤权路径都要记得 invalidate"的隐式契约 | "撤权后拒绝更新"实时测试通过 |
| 3 | 服务端 awareness `user.color` 注入 | 全仓无消费者（两端均用 `memberColor`），纯死功能 | grep 证据 + 测试绿 |
| 4 | `persistEnabled`/`persistVia` 双参数 | 三层保存兜底收敛为单一 `saveMode`，调用方不再需要理解三态组合 | 新增 4 个 saveMode 测试锁定 |
| 5 | ContentDetailPage 布尔组合态 | `detailEditMode()` 枚举单点派生替代 4 个散落布尔的组合推理 | tsc + 既有测试绿 |
| 6 | 两端手抄 session-status/presence/getContentLength（桌面 5 份→1 份） | 已实际发生单端漂移（effect 依赖修复只在移动端）；收敛共享包单源 | 共享包 38 测试 + 两端转发零改动 |
| 7 | 三个死 IPC handler、re-export 链、`snapshot()`/`selectSession()`/`AssetInfo`/`RemoteDocument`/`bytes.ts`/别名 | 全仓无调用方（逐项 grep 验证后删除） | 三端 tsc 绿 |
| 8 | `update.sh`/`rollback.sh`、electron-stub 生产桩、`requests()` 读路径 UPDATE、桌面 leave 内联 SQL | 死路径/测试基建越界/读副作用/绕过抽象 | 服务器 check 恢复绿灯 + 测试绿 |
| 9 | **未采纳的架构建议**（防过度工程）：共享 runtime 子模块（暂缓——先拿下 80% 收益的展示层下沉，环境差异大的传输层统一留待真实需求驱动）；包 exports map（拒绝——monorepo 内部 TS 直消费，现有 `/src/*` 风格统一即可）；store.ts 机械拆分（拒绝——先砍缓存与重复，复审确认剩余职责内聚）；幂等键跨端统一（降级为协议注释——桌面 generation 语义需单独评审） | 消融原则同样适用于"新架构"：不建没有当下收益的层 | 复审确认"看起来可以再改但不值得改"清单一致 |

## 验证

- 类型检查：mobile / desktop / collaboration-server / packages/collaboration 四处 `tsc --noEmit` 全绿（服务器 `check` 自 2026-09-06 起首次恢复绿灯）。
- 测试：`pnpm -r test` 全 workspace 绿——platform 7、collaboration 38（新增 8）、rpc 25、shared 8、contracts 1、collaboration-server 16、web-server 32、**mobile 239**（新增 saveMode 4）、browser-extension 45、blog 33；桌面协作迁移测试 10（根 `test:collaboration:desktop`）。
- 构建：collaboration-server tsup 产物构建成功；desktop `vite build` 三阶段（渲染层/主进程/preload）全部成功（需按既有配置带 `--max-old-space-size`）。
- 已知无关项：`ActionSheet.test.tsx` 动画计时测试存在既有偶发 flake（本轮未触碰该文件，机器负载敏感）；`diary-table.test.ts` 1 个既有失败（产品 `broadcastOthers` 演进后测试桩未更新）——均属桌面测试基建欠账，已记录待后续处理。

## 遗留与后续路线

- 移动端 `manager.ts` 约 790 行（原 718）：复审确认其为内聚的会话编排器（启动交错/会话幂等/事件重连各有注释与语义），机械拆分只增加状态传递面，**接受现状**。
- 桌面 `index.ts` 约 1030 行：同上接受；local 模式特判与多窗口排空逻辑的进一步收敛留待真实需求。
- 共享 runtime 子模块（消除三端连接管理重复）：方向认可，建议以"下一个必须同时改三端连接行为的需求"为触发点启动。
- secret 明文落盘（两端统一现状）、附件 P2、`ALTER TABLE` 迁移分支退役：见上文搁置理由。
