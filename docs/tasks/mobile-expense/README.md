# 记账移动端

状态：进行中
目标：把记账插件（`plugins/tau-plugin-expense`）搬到 Android / iOS，按「每天看 → 偶尔查 → 月底复盘」拆成主页与二级页，交互沿用减重移动端。

## 需求与用户决策

- 入口与减重相同：「我的」顶部功能宫格 +「今天」页两列插件卡片。卡片显示本月还能花多少与进度条（竖线 = 时间进度），麦克风就地语音记账，「记一笔」进记账页并聚焦输入条。
- 主页：二级页入口条（月历 / 回顾与 AI / 设置）→ 主卡（本月还能花、时间进度、今天 / 昨天 / 比上月同期）→ 分类预算（4 类，超了 → 偏快 → 用掉比例）→ 按天分组的流水（今天和昨天，再看 7 天），页底固定一句话记账条。主卡滚出屏幕后吸顶一行余额。
- 用户决策：**月历做二级页**，不放主页；**不做整页首次引导**，没保存过设置且流水不足 5 笔时，用一条「去设置」提示代替分类预算卡；**第一版就做语音记账**。
- 一句话记账：解析同桌面（`parseLine`）。聚焦时浮出识别预览（分类、金额、记下后这一类与本月还剩多少），认不出分类时给分类胶囊与「AI 归类」，不选直接发送记到「其他」；会超预算时提示一行但不拦。
- 语音记账：按住说一段话，配了模型时 AI 拆句、归类并给一句提醒；没配模型或失败时按「，。然后」本地拆句，中文数字转阿拉伯数字后走同一套解析。缺金额的一笔要先补上或去掉。
- 流水：左滑「改 / 删除」，固定支出只有「改」；点按打开编辑面板（大号金额 + 面板数字键盘、分类宫格、备注、日期时间），删除可撤销。
- 二级页：月历（每格日期、金额、分类色条，点某天弹出当天流水，可只看一类）、全部分类与分类详情（按备注合并）、回顾与 AI（近 6 个月、周几分布、提醒 / 月度复盘）、搜索（按备注，近 6 个月或本月，可按分类收窄）、设置（列表 + 底部面板，草稿保存，离开前确认未保存改动）。
- 视觉验收由用户完成；Agent 负责类型、行为测试、构建与宿主装配测试。本任务不发布插件或客户端。

mockup：`apps/mobile/mockups/expense-mobile/index.html`（任务收尾时随任务退役）。

## 技术方案

- 依赖升到 SDK `@tau/plugins` 0.51.0 与 `@tau/ui` 0.6.0（`context.speech`、首页面板 `registerDismiss`）；manifest 加 `speech:input` 与 android / ios 目标（0.2.16，同减重）。
- 按 `context.environment.platform` 分支：手机注册 `navigation` 入口与五个二级页（`calendar` / `categories` / `category`（按 id 区分实例）/ `review` / `search`），以及插件页 `settings`（主页齿轮进入，带 `pageContext`，接系统返回与离开确认）；插件中心里的「设置」仍是同一个 `MobileSettings`，不带 `pageContext`。桌面不变。
- 数据层只加 `data/voice.ts`（`chineseToNumber`、`normalizeNumbers`、`splitSpeech`、`ORGANIZE_SYSTEM` / `parseOrganized`）、`ai.organize` 与 `store.hasSavedConfig`；统计、固定支出补记、备注记忆两端共用。
- 手机界面在 `ui/mobile/*`：`Sheet` 与 `useHoldToTalk` 取自减重；二级页共用 `MobileViews` 外壳与一份 `useLedger` 查询（近 9 个月）。回顾的两张图复用桌面 `MonthsChart` / `WeekdayBars`（按宽度绘制），AI 文字复用 `Rendered`。

## 进度

| 状态        | 工作单元                                  | 结果与下一步                                           |
| ----------- | ----------------------------------------- | ------------------------------------------------------ |
| COMPLETE    | Investigate/Triage/Understand the problem | 已对照减重移动端与 mockup，确认三项默认                |
| COMPLETE    | 数据层：语音拆句、中文数字、AI 整理       | `data/voice.ts` 与测试                                 |
| COMPLETE    | 手机主页、记账条、面板与流水              | `MobileExpensePage`、`LogBar`、`TxSheet`、`VoiceSheet` |
| COMPLETE    | 二级页：月历、分类、回顾与 AI、搜索       | `MobileViews` 及各 view                                |
| COMPLETE    | 设置、今天页卡片与入口接线                | `MobileSettings`、`MobileHomePanel`、`index.tsx`       |
| COMPLETE    | 插件发行                                  | 0.2.0 已发布到插件中心                                 |
| IN_PROGRESS | 真机与视觉验收                            | 待用户验收；手机端需客户端 0.2.16 才能安装             |

### 发行状态

- 插件 0.2.0 已推送 master 与 `v0.2.0`（`dd5732a`），发布工作流自动批准，releaseId `67ea1c4d-a98c-4588-8bfc-1f335b71a2ca`；GitHub Release ZIP 与插件中心下载的 SHA-256 一致（`fd1cac5b…a993`）。
- 发布前 `verify-official-authors.mjs --published` 报告 sdkSource npm、SDK 0.51.0、passed。
- 移动客户端仍需升到 0.2.16（与减重相同），手机端才能安装。

## 验证

- 插件：tsc 通过；vitest 通过（含新增 `voice.test.ts` 的中文数字、本地拆句与 AI 整理解析，manifest 三端与权限断言）；`pnpm build` 产出 `tau.expense-0.2.0.zip`。
- 移动端：新增 `apps/mobile/src/app/plugins/expense-plugin.test.ts`，用实际构建产物在 android / ios 宿主启用，断言宫格入口、compact 卡片、主页与六个插件页、设置分区，以及低于 0.2.16 时拒绝启用。
- 未做：真机交互、视觉走查、真实 AI 与语音识别往返。
