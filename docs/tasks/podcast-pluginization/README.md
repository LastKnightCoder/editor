# 播客插件化

状态：进行中
目标：把「生成播客」从宿主抽成独立插件，插件自带管理全部播客的页面（关联原文、可跳转），并按新设计稿重做生成界面。

## 需求

- 生成入口：卡片、文章、项目文档的「⋯」菜单（`actions.register`）；Notebook 经插件输出挂载点生成，宿主负责资料选择与脚本生成，插件负责解析与音频合成。
- 生成对话框只问形式、谁来说、多长；标题由 AI 起。生成在后台跑，进度显示在原文正文上方（`views.registerEntityPanel`）与侧栏角标，切页不中断。
- 插件页「播客」：列表（露出原文、点击跳转、点封面即播、迷你播放条）、生成中 / 待审稿 / 失败任务置顶、单期详情（分色波形、跟读脚本、改一句重合成）、原文已删除、空态。
- 设计稿：`apps/desktop/mockups/podcast-plugin/`（`library.html`、`generate.html`，总览 `index.html`）。
- 宿主不再持有播客：删除宿主播客表、各来源的挂载字段、专用生成与播放实现及「播客生成」模型位；存量数据备份后迁入插件实体。

## 方案

### 宿主新增的通用能力（SDK 0.54.0）

- **调用语音合成**：`context.tts.unavailableReason()`、`context.tts.open({ signal })` 返回会话 `{ providerName, textInstructions, getVoices(), synthesize({ text, voiceId, options }), close() }`。沿用用户在「设置 › 语音」里选的服务；权限 `tts:synthesize`，首次 `open` 时询问。宿主接口 `TTSSynthesisAdapter`；未接入时 `open` 抛 `TTS_UNAVAILABLE`。手机暂不提供。
- **保存资源文件**：`context.upload.save(file, { signal })` 按用户当前的资源存储（本地库或资源上传插件）保存，返回可写入正文、可交给 `useResource` / `MediaAudio` 的地址。与正文插入图片同一条路径，不需要权限。

### 插件 `tau.podcast`（`plugins/tau-plugin-podcast`）

- AI 功能由插件自己声明：`ai.features = [{ id: "script", name: "播客脚本" }]`，用户在插件详情页「AI 配置」分配模型；没装插件的人不需要配置。
- 实体 `episode`：key = 来源引用（如 `article:123`），一篇原文一期；正文为带说话人的可读脚本；meta 存 `audioUrl / duration / format / speakers / timeline / source / status`。`links` 由播客指向原文，原文脉络里可见。
- 任务队列在 `activate` 里启动，与页面解耦，单并发；失败保留已合成段落，可从断点续；关窗后只保留脚本。
- 音频拼接与单句替换用 `services.ffmpeg`；合成用 `tts.open`；音频保存用 `upload.save`。

## 决策

用户确认（2026-11-01，「按推荐来」）：

1. 插件经插件中心分发（宿主没有内置插件机制）；有存量播客的库在迁移时自动安装并启用，与问题插件迁移相同。
2. Notebook 的播客改由插件经「Notebook 输出」挂载点接管（用户 2026-11-01 第二次裁决，推翻原先「保留宿主实现」）：AI 走宿主已有的 Notebook 生成流程与资料检索工具，插件只给任务要求、拿回生成正文自己处理，不在插件里跑 AI 循环。宿主删除 Notebook 播客与 `podcasts` 表。
3. 一篇原文一期，重新生成成功后替换旧的。
4. 合成前审稿可选，默认不审，记住上次选择。
5. 形式：双人对谈、圆桌、单人讲述。
6. 音色克隆只留在「设置 › 语音」，生成对话框只放跳转。
7. 卡片、文章、项目文档的播客模型由插件自己声明 AI 功能（用户纠正：不在宿主能力表加 `podcastScript`）；Notebook 的播客用 Notebook 现有的生成模型（`chat` 位），「播客生成」模型位删除。

8. 存量播客迁移破例按插件 ID 写入（用户 2026-11-01 同意），做法同问题插件：备份、单事务，全部设备迁移后随清洁版删除。

9. Notebook 输出（用户 2026-11-01 同意推荐）：宿主对话框里勾资料并点「开始」即同意，插件不另申请权限、读不到资料本身；用 Notebook 的 `chat` 模型；用量记在 `generation:plugin:<插件 ID>`，不占插件 AI 额度；插件输出排在内置应用之后、按启用顺序；一个 Notebook 可以有多期播客；对话里的生成产物工具不列插件输出。

## 进度

### 审查修复

- [x] 调查改动与调用链，确认图标注册、迁移条件、产物加载和取消重试的五项问题。
- [x] 修复：组件校验接受 memo/forwardRef；迁移前要求插件至少 0.2.0 且已声明 `episode` 的 Notebook 输出；空表直接清理；查询未就绪保留选择；取消清理后再允许重试，已删除实体重新 prepare 并打开新产物。
- [x] 验证：桌面相关测试 26 项、SDK 相关测试 47 项、播客插件测试 2 项通过；覆盖空表免安装、旧版升级、能力缺失阻止迁移、查询迟到保留选择、确认删除清除选择、取消清理完成后重试、保留实体与重建实体两条重试路径。桌面、SDK、播客插件类型检查通过；改动文件 Oxlint 与格式检查通过；桌面 Vite 生产构建与隔离首次挂载检查、SDK 构建、播客插件 0.2.0 构建、插件进程边界及 Schema 对账通过。未执行真实 TTS 合成或视觉验收。

### 插件实现

- [x] 1 宿主能力：`tts.open`、`upload.save`、权限 `tts:synthesize`、桌面接线（`app/plugins/tts-synthesis.ts`、`runtime.ts` 的 `upload.save` 走 `uploadResource`）、SDK 0.54.0 CHANGELOG 与模板作者文档（`ui.md#朗读`、`user-data.md#保存资源文件`、`portability.md`、`plugin-basics.md`）
      验证：`packages/plugins` `pnpm check` 通过、全量 vitest 64 文件 348 项通过（新增 `tts-synthesis.test.ts` 6 项）；`pnpm check`（桌面 tsc）通过；移动端 tsc 通过；桌面 `app/plugins` 与 `features/plugins` 相关测试 162 项通过（`plugin-skills` 并行超时一次，单跑通过，与本改动无关）。
- [x] 2 插件 MVP（`plugins/tau-plugin-podcast`，仓库 https://github.com/LastKnightCoder/tau-plugin-podcast ，submodule）：`index.tsx` 注册实体 `episode`、AI 功能 `script`、页面 `podcasts`、侧栏（学习组，角标为进行中 / 待审 / 失败数）、对象动作「生成播客」、详情区块；`gen/jobs.ts` 单并发队列（写脚本 → 逐段合成 → FFmpeg 拼接 → `upload.save`），进度只放内存，段落按「音色 + 文字」缓存可从断点续，启用时把中断的任务标为失败；界面 `GenerateDialog`（形式 / 说话人 + 试听 / 时长 / 审稿开关，缺模型或语音服务时只显示引导）、`SourcePanel`、`LibraryPage`（列表 + 任务 + 迷你播放条）、`DetailView`（分色波形、跟读、改句重合成、导出）、`ReviewView`。
  - 「⋯ › 生成播客」的对话框：动作先 `app.open` 原文，再由原文上方的详情区块弹出，对话框留在宿主界面树里（Esc 由宿主处理）；播客库「新建播客」经 `app.pick` 选原文后走同一路径。
  - 验证：`pnpm check`、`pnpm build`（产出 `dist/tau.podcast-0.1.0.zip`）、`vitest` 2 项（脚本解析、时间轴）通过。**未在 Tau 中运行验证**：当前安装的客户端没有 `tts.open` / `upload.save`，需用本仓库开发版启动后 `pnpm install:local` 安装。
  - 发布：SDK `@xiongtao.xt/tau-plugins@0.54.0` 已上 npm，插件改用 npm 依赖并冻结安装；`v0.1.0` 工作流测试、构建与 GitHub Release（`tau.podcast-0.1.0.zip`）成功。插件中心首次提交与权限问题已解决，当前由 0.2.0 完成自动发布。`minAppVersion` 为 0.61.0，须与带宿主能力的客户端版本一致。
- [x] 3 迁移与删码
  - 主进程 `modules/podcast-plugin-migration.ts`：卡片、文章、项目文档上 `podcast_id` 指向的播客写成 `tau.podcast` 的 `episode`（key `类型:ID`、meta 与插件 `episodeMeta` 同形、正文为可读脚本），由实体指向原文建 `source` 关联并登记 `plugin_ref_grants`，清空 `podcast_id`，删除迁走后不再被 Notebook 引用的 `podcasts` 行；先 `VACUUM INTO` 备份，单事务，原文已有实体时只清指针。命令 `podcast-migration:pending/run`。
  - 渲染端 `app/plugins/podcast-migration.ts`：`PluginProvider` 在本地插件刷新后调用；有待迁数据时从插件中心安装（已装直接启用）并等待激活，再迁移；失败弹可重试通知。
  - Schema：三张表删 `podcast_id` 列与 3 个索引（主库 99 表、119 索引），共享主库版本 10 → 11；已有库保留该列（开库只补不删），由迁移清空。`database-schema.md` 同步。
  - 删码：`card.ts` / `article.ts` / `project.ts` 的播客 JOIN、解析与 attach/detach 命令；`ICard` / `IArticle` / `ProjectItem` 的播客字段；卡片、文章、项目文档（含网页条目）详情与菜单入口；`ArticlePodcast`、`usePodcastAttachment`、`usePodcastGeneration`、生成弹窗主体（`index` / `ResultPreview` / `ScriptEditor` / `ProgressView`）、`podcast-audio` 主进程模块与命令；`commands/podcast.ts` 只留 Notebook 用的 `createPodcast` / `getPodcastById`；`PodcastPlayer` 去掉编辑 / 删除。`SpeakerConfig`、`VoiceClonePanel` 仍被 Notebook 与语音设置使用，保留。
  - 网页类项目文档原来用剪藏正文生成播客；插件读的是文档正文，网页条目暂不能从插件生成（存量照常迁移）。
  - 验证：`pnpm db:schema:build/check/prepare` 通过；`pnpm check` 通过；迁移单测 4 项（不迁、全量形状与关联、重复执行与 Notebook 保留、失败回滚）与相关现有测试共 179 项通过。
  - 发版顺序：SDK 0.54.0 → 播客插件上插件中心 → 宿主（含迁移）发布；插件未上架时有存量播客的用户会看到可重试通知，数据不丢。
- [x] 5 Notebook 输出挂载点（SDK 0.55.0）
  - SDK `context.notebooks.registerOutput({ id, title, icon, kind, options, view, prepare, complete, fail })`：宿主在 Notebook 的 ＋ 菜单与「基于这份资料」列出；对话框外壳（资料勾选 + 额外要求）由宿主画，中间嵌插件 `options`；`prepare` 建占位并返回任务要求（`instructions` / `reminders` / `title`）；宿主自动建「插件实体 → Notebook」的 `output` 关联、登记 Notebook 引用，用 `vibe_learning` 来源与检索工具跑生成（任务类型 `plugin`），正文交 `complete`；`complete` 期间的阶段与进度写进同一条任务；失败或停止时调 `fail`。
  - 产物列表按 `output` 关联把插件实体与笔记、测验混排；阅读区渲染插件 `view`。
  - 插件：Notebook 来源的一期 key 为 `notebook:<ID>:<UUID>`；选项组件与卡片入口共用；`complete` 解析脚本后直接合成（或停在审稿）。
  - 宿主删除：Notebook 播客分支、`podcastAudio.ts`、编排 `podcast` 任务、`services/podcast.ts`、`PodcastPlayer`、`SpeakerConfig`、`types/podcast.ts`、`commands/podcast.ts`、`tables/podcast.ts`、「播客生成」模型位；`VoiceClonePanel` 移到设置页。Schema 删 `podcasts` 与 `vl_note.podcast_id`，主库版本 11 → 12。
  - 迁移：`vl_note` 的播客笔记写成插件实体（`output` 关联指向所在 Notebook），删笔记与正文；全部迁完后 DROP `podcasts`。
  - 实现：SDK `notebooks.ts` + `host.ts` 包装（`NotebooksAdapter`，贡献类型 `notebook-output`）；桌面 `app/plugins/notebook-outputs.tsx`、`runtime.ts` 登记；`tasks/runner.ts` 的 `plugin` 分支、`generation-orchestrator` 的 `plugin` 任务；`OutputGroup` / `ResourceStage` / `GenerateDialog` / `TaskStage` / `PluginOutputStage` 接入；主进程 `plugin-entities:notebook-outputs`。插件 0.2.0：`PodcastOptions.tsx` 抽出共用表单，`NotebookOutput.tsx`（选项区与阅读区），`jobs.prepareNotebook / completeNotebook / failNotebook`。设置升级删除 `llmUsageSettings.podcastGeneration`。
  - 验证：SDK `pnpm check`、全量 vitest 65 文件 350 项（新增 `notebooks.test.ts` 2 项）；桌面 `pnpm check`；相关测试 356 项通过（`runner.database.test.ts` 播客两项换为插件产物两项、`generation-orchestrator.test.ts` 播客项换为插件任务项、迁移单测新增 Notebook 与残留表两项）；`pnpm db:schema:build/check/prepare`（98 表、118 索引）；插件 `tsc`、vitest、构建 `tau.podcast-0.2.0.zip`。**未在 Tau 中运行验证**。
  - SDK `@xiongtao.xt/tau-plugins@0.55.0` 已发布，npm 的 `latest` 指向 0.55.0；注册表及下载包的 SHA-512 均与本地发布包一致。SDK 65 个测试文件、350 项测试通过；仓库外真实 npm 安装、冻结安装、Notebook 输出公开类型检查和作者工程构建通过。发布验证报告为 `output/plugin-release/sdk-0.55.0-published.json`。
  - 插件依赖已切为 `npm:@xiongtao.xt/tau-plugins@0.55.0`，锁文件不再引用本地 `.sdk`。本地冻结安装、类型检查、现有测试、构建及 ZIP 完整性通过；独立作者目录使用真实 npm 依赖冻结安装、构建和测试通过（`output/plugin-release/podcast-0.2.0-authors.json`）。
  - 插件提交 `2074e7741f80687ab5560af544b7d3afe26644b4` 已推送 main 与 `v0.2.0`；[发布工作流](https://github.com/LastKnightCoder/tau-plugin-podcast/actions/runs/41276015298)成功，[GitHub Release](https://github.com/LastKnightCoder/tau-plugin-podcast/releases/tag/v0.2.0)已发布。插件中心由 CI 自动上传、自动审核通过并发布 0.2.0；中心记录和实际下载的 SHA-256 均与 GitHub ZIP 一致，发布验证报告为 `output/plugin-release/podcast-0.2.0-published.json`。
- [ ] 4 完善：审稿页拖动排序；远端存储下「改一句」读取整期音频依赖可跨域读取，需实测。
      已在 MVP 内完成：审稿页（改说话人、改字、删 / 加一句，自动保存草稿）、改句重合成、失败续跑。

验证：见各步记录。
