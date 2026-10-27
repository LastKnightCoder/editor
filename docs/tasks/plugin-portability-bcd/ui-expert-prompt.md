# 给 UI 专家的任务 prompt

以下正文可直接复制到另一个专家任务。首批共享类型、网页数据适配和移动管理控制器已经实现，最新可用导出与文件移交以同目录 logic-handoff.md 为准；工作区状态和文件归属应在开始时再次核对。

---

你负责 Tau 跨端插件中心的网站门户与 Android/iOS 移动端 UI 实现。另一位主任务负责人负责 SDK、清单、HTTP/原生协议、版本兼容、上传审核规则、安装更新事务与数据适配。请把 UI 做成可接入现有产品的页面和组件，不重做协议，也不开发独立演示产品。

## 工作位置与现状

- 在 `/Users/t.xiong/.codex/worktrees/mobile-plugin-spike/editor` 工作，分支为 `codex/mobile-plugin-spike`，已提交实现基线是 `16545e481`。
- 不要在 `/Users/t.xiong/Desktop/projects/editor` 主 checkout 开发。默认与主任务共享上述 worktree，按文件所有权协作；不要切分支、reset/clean/stash、回滚他人改动或 git add -A，不自行提交共享工作区。
- 正式协议方案与分工文档尚未提交，不能假定从基线提交创建的新 worktree 会带上它们。开始先执行只读 git status/diff，保留现有改动。
- 已有一个 SDK、一套模板和真实桌面/移动宿主；计数器和 ABC 在 Android/iOS 模拟器通过验证。仓库内已实现 /v2、格式 3 上传审核与移动原生数据接口，具体导出见逻辑交接；生产服务未部署，移动 release 安装仍关闭。D 的真机、最低系统、性能及 iOS 完整归档等仍待验收。

## 必读上下文

以下路径均以工作区根为基准，先读规范和任务文档，再看相邻代码：

1. `AGENTS.md`：项目与文档规范；只用中文沟通。Agent 不做截图或浏览器视觉走查，视觉与真机手感由用户验收。
2. `docs/tasks/plugin-portability-bcd/work-split.md`：文件所有权、交接顺序、UI/逻辑边界。本 prompt 的具体协作规则以该文档为准。
3. `docs/tasks/plugin-portability-bcd/distribution-plan.md`：后续目标协议，尤其是目录、选版、状态、各端改动与旧插件兼容；不是已实现接口。
4. `docs/tasks/plugin-portability-bcd/README.md`：现有实现、验证与 D 的待验收项，不得关闭或删除它们。
   同时阅读 `docs/tasks/plugin-portability-bcd/logic-handoff.md`，区分已交付的类型/客户端适配器与尚未实现的服务端、移动正式安装。
5. `plugins/tau-plugin-template/docs/portability.md`、`docs/architecture/plugin-portability.md`：现有 SDK 和宿主事实。
6. 网页：`apps/plugin-portal/AGENTS.md`、`README.md`、`web/README.md`、`docs/协议.md`、`contracts/index.ts`。目录内的相对路径以 `apps/plugin-portal/` 为根。版式参考 `apps/plugin-portal/mockups/redesign/index.html`，沿用方案 A 的商店+工作台、统一顶栏、工作台侧栏和提交/审核双栏。
7. 移动：`docs/architecture/mobile.md` 全文、`apps/mobile/README.md`，以及 `apps/mobile/src/features/plugins/`、`features/settings/` 的现有页面；遵循 definePage、页面栈、返回与保活机制。
8. 公共设计：`docs/architecture/design-system.md`、`docs/decisions.md`，复用 @tau/ui、@tau/themes 和现有 Tailwind 语义样式。

## 你负责的界面

网站门户：

- 商店平台筛选（全部、桌面、Android、iOS）、搜索/分类/排序、卡片与分页状态。
- 插件详情和版本历史：逐平台最低版本、能力与节点展示/编辑等级；区分最新版本与可安装版本，显示不可安装原因。
- 作者上传后只读展示包内平台声明，展示新旧版本差异；审核页提供上架确认与修订冲突反馈，不要求审核者测试或填写验证记录。资料仍从 ZIP 提取，不添加可独立覆盖 manifest 的字段。
- 保留现有登录、提交、评论与管理流程，仅修改此次插件中心相关界面。

移动端：

- “我的”插件中心入口，商店目录/搜索/详情/历史，以及“已安装”管理；区分插件商店和已启用插件的功能入口。
- 完整展示下载、校验、待生效、启用/停用、失败、已撤回等状态，提供对应取消/重试/更新动作。
- 卸载保留数据；清当前工作区数据是独立确认；代码备份不代表数据也能回退。按逻辑层提供的允许状态呈现动作。
- 手机与宽屏布局、加载/空态/失败、触摸与可访问性。使用移动导航协议，不直接改浏览器 history，不自建系统返回监听。

此次不重做计数器自定义页面、ABC 编辑器、标准源码组件或全站视觉风格。

## 代码边界与接口协作

- 你主要修改网页展示组件、页面、必要的界面路由与对应测试，以及移动 `features/plugins/` 展示层、新页面和设置中的插件入口。
- 网页 `contracts/`、`api/`、`infra/`，以及 `web/src/api/`、`app/api.tsx`、`app/session.ts`、`features/**/queries.ts` 和上传/审核业务辅助模块由主任务负责。具体例外文件见 work-split.md。
- 移动 `services/`、`app/plugins/`、`src-tauri/`、拟新增 `features/plugins/data/`、`PluginPageView.tsx`、底层 router、AppShell 由主任务负责；不要直接 invoke/fetch 或自写选版规则。
- PluginManager.tsx 已抽出逻辑到 data/usePluginManager.ts 并交接给 UI；你可以修改页面展示，控制器仍由主任务维护。不要移除 DEV/发行门禁来让安装按钮生效。
- SDK、模板、桌面端、共享 UI/主题包、package.json 和锁文件不在你的写入范围。缺少组件、token 或接口时，在 UI 进度中写清最小需求与受影响路径，交给相应文件所有者实现。
- 主任务会提供共享 TypeScript 类型、PortalApi/移动服务适配及 hooks/动作。UI 管理搜索输入、Tab、弹层等界面状态，消费业务结果；兼容、选版、审核资格和动作允许性由逻辑层判断。
- /v2 还没实现时，先完成布局、纯展示组件和组件测试，用测试专用 fixture/props 覆盖状态；不要复制一套 HTTP DTO，不要让正式页面返回假成功。真实接口就绪后再接线，交付时明确列出待接部分。
- 网页选中 Android 标签仅表示浏览该平台插件；没有真实 host 时不能显示“当前设备可安装”。网页下载 ZIP 不等于装到手机。移动只展示中心 releaseId 安装，不开放任意 URL/JSON 来源给普通用户。

## 过程、验证与交付

在 `docs/tasks/plugin-portability-bcd/ui-progress.md` 建立并持续维护自含的 UI 任务文档，记录需求、页面清单、界面选择、实现进度、接口依赖、改动文件和验证。不要修改主任务的协议和总进度文件；如果发现协议缺项，记录具体问题，先继续独立组件工作。

按根 AGENTS.md 渐进规划；有任务列表工具时先只创建 Investigate/Triage/Understand the problem，调查后再拆工作。工具不可用时在 UI 任务文档维护列表。不要因缺少一个接口停止所有可独立推进的 UI 工作，也不要为绕过缺口实现第二套协议。

完成相关组件行为测试、类型检查和前端构建。已有命令包括：

- `pnpm --filter @tau/plugin-portal check:web`
- `pnpm --filter @tau/plugin-portal test:web`
- `pnpm --filter @tau/plugin-portal build:web`
- `pnpm --filter mobile exec tsc --noEmit`
- `pnpm --filter mobile test`（开发过程中可先运行相关文件）
- `pnpm --filter mobile exec vite build`
- `pnpm check:docs`

不要与主任务同时写同一构建目录或锁文件；原生构建和最终全量回归由主任务安排。网页构建所需 API 配置遵循现有说明，构建不等于授权请求生产服务。模拟仅允许显式开发/测试模式，不因真实请求失败自动回退模拟数据。

不发布 npm，不推送外部模板，不部署或修改生产插件中心，不向真实插件写入测试评论、上传包或执行审核，不打开移动正式安装开关。不要把 UI 完成写成 D 验收通过。

完成后交付：实现页面与状态列表、准确改动文件、测试和构建结果、仍待接的接口、需用户视觉/真机验收的项目。让主任务接真实逻辑并做整体集成，不只提供静态效果图。
