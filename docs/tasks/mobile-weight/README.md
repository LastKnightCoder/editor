# 减重移动端

状态：进行中
目标：把减重插件（`plugins/tau-plugin-weight`）搬到 Android / iOS，并为手机单独设计交互；同时补齐移动宿主缺的首页面板、宫格入口与插件语音输入三项能力。

## 需求与用户决策

- 主页结构 C：主页只放今天（主卡 → 趋势迷你卡 → 今天流水），底部固定一句话记录条；趋势、打卡、四组对比与 AI 分析进二级页「趋势与效果」。
- 一句话记录：常吃命中时立即预览热量、± 步进；没记过的发送后立刻入账，AI 在后台估算，回来自动补上并吐司提示；失败或没配模型显示「填热量」。估算中的条目不计入余额与少吃判定。离开页面后估算回来不发系统通知，下次打开时高亮。
- 语音记录：按住麦克风说一段话，AI 拆成多条饮食 / 运动并各自估算，再给一两句评估；用户可删改后「全部记下」，或「先记下，后台算」。没配模型时语音只转文字填进输入条。
- 称体重：底部面板，默认刻度尺（每格 0.1 kg，起点为上次同时段读数），点数字切到面板数字键盘。
- 今天流水：左滑「改 / 删除」，点按打开编辑面板，删除可撤销；占位行（晚饭、运动）点按预填输入条。
- 首次打开整页引导两步：身体数据（含「现在体重」，实时预览预算）→ 三行用法 +「在今天页显示」开关；可跳过。
- 入口：「我的」顶部功能宫格，内置功能在前，插件按启用顺序接在后面，不做拖动排序；超过 8 格时最后一格为「更多」，点开全部功能面板。
- 今天页插件卡片：首屏可见，放在问答条下、日程上，两列小卡；与桌面同一个 `home.registerPanel`。
- 视觉验收由用户完成；Agent 负责类型、行为测试、构建与仓库外作者验证。本任务不发布 SDK、插件或客户端。

mockup：`apps/mobile/mockups/weight-mobile/index.html`（任务收尾时随任务退役）。

## 技术方案

### SDK（`@tau/plugins` 0.51.0、`@tau/ui` 0.6.0）

- 新增 `context.speech`（`unavailableReason()`、`start({ signal, onPreview })` → `{ result, stop, cancel }`）与权限 `speech:input`；宿主接口 `SpeechAdapter`。PluginHost 校验声明与授权，录音 signal 并入激活 signal。移动白名单（`portable.ts` 的 `MOBILE_SPEECH_MIN_VERSION` = 0.2.16、`plugin_permissions.rs`）开放；桌面未接，`start` 抛 `SPEECH_UNAVAILABLE`。
- `PluginHomePanelProps` 新增可选 `registerDismiss`：面板里的浮层登记后系统返回 / Esc 先关浮层；两端首页都传入。
- `@tau/ui` toast 增加 `key`（同 key 原位替换、重新计时）、`ToastHost` 的 `variant`（default / inverse）与 `zoneClassName`、`toast.items()`；移动端改为只挂 `ToastHost variant="inverse"`，`components/toast` 成为保留调用形态的适配层（用户裁决：两套统一为一套，手机保留深色胶囊外观）。

### 移动宿主

- 今天页 `features/home/PluginHomePanels`：问答条与日程之间的两列插件卡片。
- 「我的」功能宫格并入插件入口（`usePluginFeatureEntries`），超过 8 格收进「更多」；`PluginEntries` 只留插件中心一行。
- `app/plugins/speech`：插件语音与应用听写共用识别服务实例与不可用原因。

### 插件（`tau-plugin-weight` 0.2.0）

- `Entry.estimate`：`ready` / `pending` / `failed`，旧记录读为 ready；`entry` 集合加 `estimate` 索引。统计跳过非 ready 条目的热量，运动分钟照常计入；有未定饮食时当天少吃为 unknown。
- `data/estimates`：运行时级后台估算队列，启用时补跑 pending；结果写回前重读，被删或已手填则丢弃，冲突重排；失败标 failed。桌面一句话记录同样不等估算。
- `ai.organize` + `parseOrganized` / `splitSpeech`：语音拆条、估算与评估，失败退回本地拆句。
- 手机界面 `ui/mobile/*`：主页（主卡、趋势迷你卡、流水左滑、页底记录条与常吃胶囊）、单独注册的二级页 `trend`、称重面板（刻度尺 / 键盘）、编辑面板、语音整理面板、两步引导、今天页小卡；按 `context.environment.platform` 分支，手机注册 `navigation` 入口，桌面仍注册侧边栏。偏好 `prefs`（onboarded、homeCard）存插件 storage。
- manifest：`permissions` 加 `speech:input`，`targets` 加 android / ios（0.2.16）。

### 发行状态

- SDK `@xiongtao.xt/tau-plugins@0.51.0` 与 `@xiongtao.xt/tau-ui@0.6.0` 已由用户发布到 npm，registry integrity 与本地打包产物一致。
- 减重插件依赖已改回这两个 npm 版本并重新生成锁文件（`minimumReleaseAgeExclude` 同步）；插件 0.2.0 尚未推送与打标签。
- 模板 `plugins/tau-plugin-template` 仍声明 SDK 0.50.0，其 `docs/` 已含本任务的移动端说明；升级模板依赖并跑 `--published --frozen-template` 属于模板发行步骤，尚未执行。
- 移动客户端版本需升到 0.2.16（插件 targets 与 `MOBILE_SPEECH_MIN_VERSION` 依此），尚未升级。

## 进度

| 状态        | 工作单元                                  | 结果与下一步                                                 |
| ----------- | ----------------------------------------- | ------------------------------------------------------------ |
| COMPLETE    | Investigate/Triage/Understand the problem | 已核对 SDK 契约、移动宿主、插件结构与 mockup 定稿            |
| COMPLETE    | SDK 0.51.0 契约                           | speech、home registerDismiss、移动白名单与作者文档           |
| COMPLETE    | 移动宿主：首页面板、宫格入口、语音        | 今天页卡片、宫格 + 更多、插件语音适配                        |
| COMPLETE    | toast 统一                                | @tau/ui 唯一实现，移动 inverse 外观，适配层保留调用形态      |
| COMPLETE    | 插件数据层：pending、后台估算、语音整理   | 统计口径、队列、organize 及测试                              |
| COMPLETE    | 插件移动界面                              | ui/mobile 全部页面与面板                                     |
| COMPLETE    | SDK 发布与插件改用 npm 依赖               | 两个 SDK 已发布；插件冻结安装、构建与 published 作者验证通过 |
| IN_PROGRESS | 真机与视觉验收、插件与客户端发行          | 待用户验收；插件 0.2.0 与客户端 0.2.16 均未发布              |

## 验证

- `@tau/plugins`：vitest 63 文件全部通过（含新增 `speech.test.ts`、portable 语音版本断言、API 支持矩阵）；tsc 通过。
- `@tau/ui`：vitest 全部通过（含 toast 同 key 替换与 inverse 外观）；tsc 通过。
- 移动端：tsc 通过；vitest 203 文件 / 1367 用例全部通过，含 `home-speech.test.ts` 与 `weight-plugin.test.ts`（用实际构建的 `tau.weight-0.2.0.zip` 在 android / ios 宿主启用，断言宫格入口、compact 卡片、两个页面，低版本拒绝）；`vite build` 通过；Rust `plugin_permissions` 测试通过。
- 桌面：tsc 通过；vitest 4071 用例中 7 例失败，均在本任务未改动的文件（`resource-retirement`、`pi-session-resume`、`portable-abc`、`WhiteBoardContentView`），在不含本任务 SDK/UI/桌面改动的工作树上同样失败，属既有问题。
- 插件：改用 npm SDK 后冻结安装、tsc、vitest 37 用例通过；`pnpm build` 产出 `tau.weight-0.2.0.zip`；`verify-official-authors.mjs --published` 报告 sdkSource npm、passed；移动端 `weight-plugin.test.ts` 用新产物通过。
- `pnpm check:docs`、`check:plugin-process-boundaries` 通过。
- 未做：真机交互、视觉走查、真实 AI 与语音识别往返。
