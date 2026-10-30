# 移动端 AI 模型设置与语音整理

状态：进行中
目标：在移动端提供 AI 服务商配置与按功能分配模型的入口，并把「语音输入整理」接到编辑器听写；为后续对话功能准备可用模型。

## 需求

- 入口「我的 › AI」分组下的「AI 模型」行，进入设置模块 `ai-models`。
- 主页上方「功能分配」：对话（`chat`）、语音输入整理（`speechInputRefinement`）各选一个模型；下方「服务商」列表与「添加」。
- 添加服务商先选预设（来自 pi 内置目录，只列三种受支持协议的服务商），只需填 API Key；最后一项「自定义」手填名称、地址、协议、模型。
- 服务商详情：API Key（遮挡，可显示）、接口地址、测试连接、模型列表（预设服务商从目录勾选，自定义手填 id 与容量）、删除服务商。
- 功能模型选择器：按服务商分组、单选；能力标签只给「推理」「图片」；未填 Key 的服务商置灰并说明原因；可清除分配。
- 「我的 › 语音输入」新增「AI 整理」分组：整理模型（跳同一个选择器）、整理方式（轻度 / 整理并分段）。分配了模型即开启，清除分配即关闭，与桌面同义。
- 编辑器听写传入 `refine`：录音开始时固定模型与风格；整理失败保留原文。「重试」重新整理。
- 视觉以 `apps/mobile/mockups/ai-mobile/`（第 1、5 页）为准。

本任务不做：对话页、首页问答条、内容页就近提问（第二、三期）；MCP 管理；用量统计；补充要求输入。

## 方案

### 数据

- 沿用 `setting.json` 的 `llmProviders`（`LLMProviderSetting[]`）与 `llmUsageSettings`（`Record<功能键, {providerId, modelId} | null>`），类型来自 `@tau/ai/models`，不新增平行字段。
- 设置文件只在本机，不参与数据库同步；手机服务商独立配置。
- API Key 不进 WebView：所有把设置交给页面的命令（`read_setting_json`、`ai_settings_mutate`、`plugin_provider_*`、`plugin_tts_mutate`）都经 `public_setting` 删除 apiKey/headers，改为 `configured` 与 `keyHint`。普通全量写入 `write_setting_json` 由 `preserve_managed_fields` 原样保留 `llmProviders` 与 `llmUsageSettings`，页面整份回写不会抹掉 Key。
- 原生新增串行命令 `ai_settings_mutate(mutation)`（`src-tauri/src/ai_settings.rs`，走 `mutate_setting_value`）：
  - `upsertProvider { provider, apiKey? }`：`apiKey` 缺省表示保留原 Key，空串表示清除；校验 id/name/baseUrl（http/https）/api 三选一、模型 id 唯一且非空、自定义模型容量为正整数。
  - `removeProvider { providerId }`：同时清除指向它的分配。
  - `assign { feature, model: {providerId, modelId} | null }`：feature 限白名单（`chat`、`speechInputRefinement`）；模型必须存在。
  - `setSpeechRefinement { style }`：写 `speechInput.refinement`，保留 `instructions`。
  - 返回脱敏后的 `{ llmProviders, llmUsageSettings, speechInput }`，前端合并进设置快照。
- 删除模型时同步清除指向该模型的分配。
- 预设目录：`@tau/ai/catalog` 的 `listCatalogProviders/listCatalogModels` 基于 pi 内置目录，过滤三种协议；桌面主进程复用其中的 `toCatalogModel/isSupportedModel`。添加面板置顶 DeepSeek、Kimi、智谱、MiniMax、OpenRouter、Anthropic、OpenAI，其余收进「更多」；含占位符地址的网关类服务商不列，走自定义。
- 测试连接：`getMobileAiService().models.verify(databaseName, ref)`，用已保存的配置与第一个模型；有未保存修改时按钮为「保存并测试连接」。
- 新增服务商先以草稿进入详情页（`aiProvider` 页带 `preset` 参数），保存前不写设置。

### 语音整理执行

- `services/speechRefinement.ts` 的 `prepareSpeechRefinement(setting)`：读 `speechInputRefinement` 分配与 `speechInput.refinement`，录音开始时固定；执行用 `getMobileAiService().generation.start`（单发、不建会话），系统提示与桌面同文（抽到 `@tau/asr` 的 `buildSpeechRefinementPrompt`，两端共用）；流式快照经 `onPreview` 回传；`stopReason !== "stop"` 或空文本视为失败。
- `MobileEditorBottomToolbar` 与 `ContentDetailPage` 的 `DictationTrigger` 传入 `refine`；分配为空时不传。

### UI 规格（Tailwind，消费 --tau-* 语义类）

- 复用 `GroupCard / GroupRow / GroupNote / GroupLabel / SwitchButton / CheckBubble / PageHeader / BottomSheet`；不新增 CSS 文件。
- 行内徽标（「可用」「未填 Key」「推理」「图片」）必须是 `inline-flex` 小胶囊，与标题同行，不得独占一行。
- 抽屉标题行的关闭按钮 `shrink-0` 正圆 30px，不被标题挤压。
- 服务商行：字母块 + 名称（含状态徽标）+ 次行「N 个模型 · sk-…尾号」；未填 Key 次行写「填写 Key 后可用」。Key 尾号由原生在公开配置里给出 `keyHint`（末 4 位），不回传完整 Key。

## 决策

- 2026-10-30 用户确认：入口采用首页问答条 + 内容页就近提问（A + D）；其余按设计稿推荐执行；mockup 中标出的三处视觉问题（行内徽标被撑成整行、抽屉关闭按钮被挤扁、对话记录左滑行被截断与按住说话取消区压住字幕）实现时规避。
- 分期：第一期本任务；第二期对话页 + 首页问答条 + 对话记录（工具只读）；第三期就近提问、@ 引用、写入确认、拍照提问。

## 进度

- [x] 设计稿与视觉问题修正
- [x] 原生 `ai_settings_mutate` 与快照脱敏 + Rust 测试
- [x] `@tau/ai/catalog` 目录抽取，桌面复用
- [x] AI 模型主页 / 添加服务商 / 服务商详情 / 模型选择器
- [x] 语音输入页 AI 整理分组 + 听写接入 refine
- [x] 架构文档同步（mobile.md「本机 AI 服务」「语音输入」）
- [ ] 真机验收：真实 Key 测试连接、语音整理端到端、视觉走查（用户）

## 验证

- `pnpm --filter mobile run check:rust`：fmt、clippy 通过，315 项 Rust 测试通过（`ai_settings` 9 项，含快照脱敏与派生字段不落盘）。
- 移动 vitest：设置、语音输入与整理相关 32 个文件 184 项通过（新增 `aiModels.page.test.tsx` 5 项、`speechRefinement.test.ts` 4 项、`useDictationSession` 重试与固定润色器 2 项）。全量 `pnpm test` 另有 6 个文件 14 项失败，均为改动前已存在（stash 后同样失败：插件运行时、中心安装、正文计数、页面块选择、快速捕获），与本任务无关。
- 移动 `tsc --noEmit` 与 `vite build` 通过；内置模型目录拆在独立 chunk，首屏 `index` 包不含目录数据。
- `@tau/ai` 83 项、`check:browser` 通过（catalog 在纯 Web VM 可用）；`@tau/asr` 27 项通过；桌面 `tsc --noEmit` 通过。
- 未做：真实模型调用、真机运行与视觉走查。
