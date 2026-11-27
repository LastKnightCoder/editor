// 由 scripts/build-user-docs-skill.mjs 从 apps/website/content/docs/ 自动生成，请勿手工修改。

export const USER_DOCS_SKILL_README =
  "# Tau 使用文档\n\n本 Skill 内置当前版本的 Tau 官方使用文档。回答用户关于 Tau 怎么用、功能入口、界面操作、快捷键、配置、同步、协作、发布、插件、手机端或故障排查的问题时，先从下方目录挑选 1～2 篇最相关的文档，再按相对路径读取对应的 `references/<slug>.md` 文件（如调用 `read_skill_file` 或 `read_skill_resource`）。\n\n## 使用原则\n\n- 仅在用户询问 Tau 本身的使用方法或排查问题时使用；若用户询问自己记录的笔记与知识库内容，不要调用本 Skill。\n- 按需读取最相关的 1～2 篇；如文中链接到其他 `references/*.md` 且确有必要，再继续读取，避免一次读完所有文件。\n- 严格依据已读文档回答，不编造不存在的菜单、按钮、设置项或快捷键；涉及电脑端与手机端差异时明确说明。\n- 文档未涵盖或涉及最新下载/版本动态时如实告知用户。\n\n## 文档目录\n\n### 开始\n\n- [Tau 是什么](references/index.md)：认识 Tau：本地优先的个人知识工作台。\n- [下载与安装](references/install.md)：在 macOS、Windows 与 Android 上安装 Tau。\n- [五分钟上手](references/quick-start.md)：写下第一张卡片，再把它连进你的知识网。\n- [选一条路线](references/paths.md)：按你想做的事，挑三四篇先读。\n\n### 日常\n\n- [今日](references/today.md)：打开 Tau 的第一屏：今天要做的、要复习的、刚写过的。\n- [待办与日程](references/todos.md)：记下要做的事，排进日历，到点提醒。\n- [日记](references/diary.md)：每天一页，回头翻看某一天写了什么。\n- [番茄专注](references/pomodoro.md)：一次专注一件事，计时、休息与专注记录。\n\n### 知识\n\n- [编辑器基础](references/editor.md)：所见即所得的 Markdown 编辑：语法、快捷键与常用块。\n- [Markdown 文件](references/markdown-files.md)：把 Tau 当电脑上的 Markdown 编辑器：双击打开，所见即所得，保存回原文件。\n- [卡片](references/cards.md)：随笔、短思考和一闪念，用标签和引用连起来。\n- [文章](references/articles.md)：展开论述的长文，配合创作模式对照资料来写。\n- [项目](references/projects.md)：用目录层级把一个主题系统地整理成一套文档。\n- [白板](references/whiteboard.md)：在无限画布上摊开想法：思维导图、画框与演示。\n- [数据库](references/database.md)：一份数据，表格、看板、画廊、日历多种视图。\n- [查询数据库](references/query-database.md)：用 DSL 或 JavaScript 查询已有内容，按标签、日期和项目组织实时结果。\n\n### 学习\n\n- [收集与阅读](references/reading.md)：网页、PDF 与书里的划线，带着出处收进 Tau。\n- [视频笔记](references/video-notes.md)：左边看、右边记：跟着字幕读，划一句摘进笔记，按章节跳着看。\n- [Notebook](references/notebook.md)：围绕一组资料提问，把读懂的整理成大纲。\n- [闪卡复习](references/flashcards.md)：把要记住的做成闪卡，按遗忘规律安排复习。\n- [漫步与知识地图](references/walk.md)：和旧想法重逢，看见内容之间的关联。\n\n### AI\n\n- [AI 对话与洞见](references/ai.md)：连接模型后，让 AI 读你的内容、替你动手、帮你查漏补缺。\n- [Skill 与 MCP](references/skills-mcp.md)：把常用做法存成 Skill，接上 MCP 让 AI 用外部工具。\n\n### 分享\n\n- [发布](references/publish.md)：把内容发布成自己的静态网站。\n- [协作](references/collaboration.md)：邀请别人和你一起实时编辑同一份内容。\n\n### 更多\n\n- [手机端](references/mobile.md)：在手机上随手记、刷闪卡、录音转文字，和电脑自动同步。\n- [插件](references/plugins.md)：在插件中心挑选、安装与管理插件。\n- [数据与同步](references/data.md)：数据存在哪里，怎样在设备之间同步、备份和迁移。\n- [快捷键](references/shortcuts.md)：常用操作的快捷键速查。\n- [常见问题](references/faq.md)：使用 Tau 时常被问到的问题。\n\n### 附录\n\n- [Tau 伴读隐私政策](references/browser-companion-privacy.md)：「Tau 伴读」浏览器扩展会处理哪些数据、存在哪里、交给谁。\n";

export const USER_DOCS_SKILL_RESOURCE_PATHS: readonly string[] = [
  "references/index.md",
  "references/install.md",
  "references/quick-start.md",
  "references/paths.md",
  "references/today.md",
  "references/todos.md",
  "references/diary.md",
  "references/pomodoro.md",
  "references/editor.md",
  "references/markdown-files.md",
  "references/cards.md",
  "references/articles.md",
  "references/projects.md",
  "references/whiteboard.md",
  "references/database.md",
  "references/query-database.md",
  "references/reading.md",
  "references/video-notes.md",
  "references/notebook.md",
  "references/flashcards.md",
  "references/walk.md",
  "references/ai.md",
  "references/skills-mcp.md",
  "references/publish.md",
  "references/collaboration.md",
  "references/mobile.md",
  "references/plugins.md",
  "references/data.md",
  "references/shortcuts.md",
  "references/faq.md",
  "references/browser-companion-privacy.md",
];

let resourceCache: Promise<Readonly<Record<string, string>>> | undefined;

export async function loadUserDocsSkillResource(relativePath: string): Promise<string | undefined> {
  resourceCache ??= import("./user-docs-resources.generated").then(
    module => module.USER_DOCS_SKILL_RESOURCES
  );
  const resources = await resourceCache;
  return Object.prototype.hasOwnProperty.call(resources, relativePath)
    ? resources[relativePath]
    : undefined;
}
