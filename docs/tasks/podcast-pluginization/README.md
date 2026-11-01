# 播客插件化

状态：进行中
目标：把「生成播客」从宿主抽成独立插件，插件自带管理全部播客的页面（关联原文、可跳转），并按新设计稿重做生成界面。

## 需求

- 生成入口：卡片、文章、项目文档的「⋯」菜单（`actions.register`）；Notebook 的播客生成保留在宿主（决策 2）。
- 生成对话框只问形式、谁来说、多长；标题由 AI 起。生成在后台跑，进度显示在原文正文上方（`views.registerEntityPanel`）与侧栏角标，切页不中断。
- 插件页「播客」：列表（露出原文、点击跳转、点封面即播、迷你播放条）、生成中 / 待审稿 / 失败任务置顶、单期详情（分色波形、跟读脚本、改一句重合成）、原文已删除、空态。
- 设计稿：`apps/desktop/mockups/podcast-plugin/`（`library.html`、`generate.html`，总览 `index.html`）。
- 宿主不再持有卡片、文章、项目文档的播客：删除这三张表的 `podcast_id`、挂载命令与详情页入口、宿主生成弹窗；`podcasts` 表、`PodcastPlayer` 与「播客生成」模型位只为 Notebook 保留。

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
2. Notebook 保留宿主实现（用户 2026-11-01 裁决）：它靠 AI 用工具读 Notebook 资料的转换文字，插件读不到；Notebook 的播客不迁。
3. 一篇原文一期，重新生成成功后替换旧的。
4. 合成前审稿可选，默认不审，记住上次选择。
5. 形式：双人对谈、圆桌、单人讲述。
6. 音色克隆只留在「设置 › 语音」，生成对话框只放跳转。
7. 播客模型由插件自己声明 AI 功能（用户纠正：不在宿主能力表加 `podcastScript`）；宿主的「播客生成」模型位因 Notebook 仍在用而保留。

8. 存量播客迁移破例按插件 ID 写入（用户 2026-11-01 同意），做法同问题插件：备份、单事务，全部设备迁移后随清洁版删除。

待决：

- 插件中心首次提交：中心 API 尚不认识 `tts:synthesize`，需部署含 SDK 0.54.0 的插件中心 API；首次提交还需在网页提交一次以绑定仓库，之后 tag 由 CI 自动提交。

## 进度

- [x] 1 宿主能力：`tts.open`、`upload.save`、权限 `tts:synthesize`、桌面接线（`app/plugins/tts-synthesis.ts`、`runtime.ts` 的 `upload.save` 走 `uploadResource`）、SDK 0.54.0 CHANGELOG 与模板作者文档（`ui.md#朗读`、`user-data.md#保存资源文件`、`portability.md`、`plugin-basics.md`）
      验证：`packages/plugins` `pnpm check` 通过、全量 vitest 64 文件 348 项通过（新增 `tts-synthesis.test.ts` 6 项）；`pnpm check`（桌面 tsc）通过；移动端 tsc 通过；桌面 `app/plugins` 与 `features/plugins` 相关测试 162 项通过（`plugin-skills` 并行超时一次，单跑通过，与本改动无关）。
- [x] 2 插件 MVP（`plugins/tau-plugin-podcast`，仓库 https://github.com/LastKnightCoder/tau-plugin-podcast ，submodule）：`index.tsx` 注册实体 `episode`、AI 功能 `script`、页面 `podcasts`、侧栏（学习组，角标为进行中 / 待审 / 失败数）、对象动作「生成播客」、详情区块；`gen/jobs.ts` 单并发队列（写脚本 → 逐段合成 → FFmpeg 拼接 → `upload.save`），进度只放内存，段落按「音色 + 文字」缓存可从断点续，启用时把中断的任务标为失败；界面 `GenerateDialog`（形式 / 说话人 + 试听 / 时长 / 审稿开关，缺模型或语音服务时只显示引导）、`SourcePanel`、`LibraryPage`（列表 + 任务 + 迷你播放条）、`DetailView`（分色波形、跟读、改句重合成、导出）、`ReviewView`。
  - 「⋯ › 生成播客」的对话框：动作先 `app.open` 原文，再由原文上方的详情区块弹出，对话框留在宿主界面树里（Esc 由宿主处理）；播客库「新建播客」经 `app.pick` 选原文后走同一路径。
  - 验证：`pnpm check`、`pnpm build`（产出 `dist/tau.podcast-0.1.0.zip`）、`vitest` 2 项（脚本解析、时间轴）通过。**未在 Tau 中运行验证**：当前安装的客户端没有 `tts.open` / `upload.save`，需用本仓库开发版启动后 `pnpm install:local` 安装。
  - 发布：SDK `@xiongtao.xt/tau-plugins@0.54.0` 已上 npm，插件改用 npm 依赖并冻结安装；`v0.1.0` 工作流测试、构建与 GitHub Release（`tau.podcast-0.1.0.zip`）成功，提交插件中心被拒（`未知插件权限：tts:synthesize`），见待决。`minAppVersion` 为 0.61.0，须与带宿主能力的客户端版本一致。
- [x] 3 迁移与删码
  - 主进程 `modules/podcast-plugin-migration.ts`：卡片、文章、项目文档上 `podcast_id` 指向的播客写成 `tau.podcast` 的 `episode`（key `类型:ID`、meta 与插件 `episodeMeta` 同形、正文为可读脚本），由实体指向原文建 `source` 关联并登记 `plugin_ref_grants`，清空 `podcast_id`，删除迁走后不再被 Notebook 引用的 `podcasts` 行；先 `VACUUM INTO` 备份，单事务，原文已有实体时只清指针。命令 `podcast-migration:pending/run`。
  - 渲染端 `app/plugins/podcast-migration.ts`：`PluginProvider` 在本地插件刷新后调用；有待迁数据时从插件中心安装（已装直接启用）并等待激活，再迁移；失败弹可重试通知。
  - Schema：三张表删 `podcast_id` 列与 3 个索引（主库 99 表、119 索引），共享主库版本 10 → 11；已有库保留该列（开库只补不删），由迁移清空。`database-schema.md` 同步。
  - 删码：`card.ts` / `article.ts` / `project.ts` 的播客 JOIN、解析与 attach/detach 命令；`ICard` / `IArticle` / `ProjectItem` 的播客字段；卡片、文章、项目文档（含网页条目）详情与菜单入口；`ArticlePodcast`、`usePodcastAttachment`、`usePodcastGeneration`、生成弹窗主体（`index` / `ResultPreview` / `ScriptEditor` / `ProgressView`）、`podcast-audio` 主进程模块与命令；`commands/podcast.ts` 只留 Notebook 用的 `createPodcast` / `getPodcastById`；`PodcastPlayer` 去掉编辑 / 删除。`SpeakerConfig`、`VoiceClonePanel` 仍被 Notebook 与语音设置使用，保留。
  - 网页类项目文档原来用剪藏正文生成播客；插件读的是文档正文，网页条目暂不能从插件生成（存量照常迁移）。
  - 验证：`pnpm db:schema:build/check/prepare` 通过；`pnpm check` 通过；迁移单测 4 项（不迁、全量形状与关联、重复执行与 Notebook 保留、失败回滚）与相关现有测试共 179 项通过。
  - 发版顺序：SDK 0.54.0 → 播客插件上插件中心 → 宿主（含迁移）发布；插件未上架时有存量播客的用户会看到可重试通知，数据不丢。
- [ ] 4 完善：审稿页拖动排序；远端存储下「改一句」读取整期音频依赖可跨域读取，需实测。
      已在 MVP 内完成：审稿页（改说话人、改字、删 / 加一句，自动保存草稿）、改句重合成、失败续跑。

验证：见各步记录。
