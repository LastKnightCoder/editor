const TOOL_GUIDE = `## 可用工具

你可以使用以下工具来获取资料内容：

### 1. list_project_resources
- 功能：列出当前项目的所有上传资源
- 用途：了解项目中有哪些资料可用

### 2. read_resource_content
- 功能：读取指定资源的 Markdown 内容
- 参数：resourceName（资源名称）
- 用途：对于普通文档返回全文；对于大型分章文档返回结构索引/摘要索引，用于建立整体理解

### 3. read_resource_range
- 功能：按行范围读取指定资源的内容
- 参数：resourceName（资源名称）、startLine（起始行）、endLine（结束行）
- 用途：分段读取普通大文件，或在已确认资源相关后补足上下文

### 4. list_resource_chapters
- 功能：列出大型分章文档的所有章节标题、摘要和索引
- 参数：resourceName（资源名称）
- 用途：理解长文结构，决定下一步该读哪些章节

### 5. read_resource_chapter
- 功能：读取大型分章文档的指定章节全文
- 参数：resourceName（资源名称）、chapterIndex（章节索引）
- 用途：获取章节正文证据

### 6. read_resource_chapter_range
- 功能：按行范围读取大型分章文档的指定章节片段
- 参数：resourceName（资源名称）、chapterIndex（章节索引）、startLine（起始行）、endLine（结束行）
- 用途：章节较长时分段深读，只读取最相关的正文部分

### 7. search_project_knowledge
- 功能：在项目资料中搜索关键词或问题
- 参数：query（搜索关键词或问题）、limit（返回数量，默认 5）
- 用途：快速定位线索。返回结果会尽量标注命中属于摘要还是章节正文，以及所属章节信息

### 8. read_search_hit_context
- 功能：读取某个搜索命中附近的上下文
- 参数：resourceName（资源名称）、chunkIndex（命中片段索引）、radius（上下文扩展范围）
- 用途：在不立即整章通读的前提下补足命中前后文

### 9. deep_read_resource
- 功能：对大型分章文档进行高成本深度阅读分析
- 参数：resourceName（资源名称）、question（问题）、focusChapters（可选重点章节）
- 用途：仅在常规探索后仍不足以完成任务，或需要跨多个章节综合分析时使用`;

const EXPLORATION_RULES = `## 资料探索规则（核心要求）

在生成结果之前，你必须先充分探索资料，不能直接凭少量片段开始生成。

### 1. 正确认识不同证据层级
- 搜索结果片段只用于定位线索，不代表全文，不能直接当作充分证据
- read_resource_content 对大型分章文档返回的是结构索引/摘要索引，不是正文
- 章节正文（read_resource_chapter / read_resource_chapter_range）和普通文档全文，才是高置信度证据

### 2. 长文默认先建立全局理解
- 如果资源是大型分章文档，先使用 read_resource_content 或 list_resource_chapters 理解整体结构
- 根据章节标题和摘要决定下一步应读哪些章节
- 不要把长文摘要当成正文依据

### 3. 搜索只负责定位，阅读负责确认
- 先保留用户原始需求，再按不同角度补充 1-3 个搜索查询
- 搜索命中后，结合 hitType、chapterIndex、chapterTitle 判断是否需要继续读取正文
- 如果命中上下文不完整，优先使用 read_search_hit_context
- 如果已定位到长文某一章节，优先使用 read_resource_chapter 或 read_resource_chapter_range 获取正文证据

### 4. 生成前必须达到证据门槛
- 至少覆盖每个已选资源的核心模块，而不是只覆盖几个零散片段
- 细节、定义、步骤、因果、对比、案例等内容，必须回到正文确认
- 如果当前证据不足以支持高质量生成，继续探索，而不是勉强输出

### 5. deep_read_resource 的使用边界
- 只有在需要跨多个章节综合分析，或常规章节阅读后仍不足时才使用
- 不要把 deep_read_resource 当成默认第一步`;

export const VIBE_LEARNING_GENERATION_RULES = `${TOOL_GUIDE}

${EXPLORATION_RULES}`;

export const buildVibeLearningGenerationUserPrompt = (params: {
  title: string;
  resourceNames: string[];
  userPrompt?: string;
  finalOutput: string[];
  extraReminders?: string[];
}): string => {
  const resourceList = params.resourceNames
    .map((name) => `- ${name}`)
    .join("\n");
  const reminders = [
    "先获取资料内容，不要在证据不足时直接开始生成",
    "对于大型分章文档，先读结构索引，再按需读取章节正文",
    "搜索结果只用于定位线索，关键内容要回到正文确认",
    "确保信息已经足够覆盖主要知识点后，再输出最终结果",
    ...(params.extraReminders || []),
  ];

  let prompt = `
请为以下资源完成「${params.title}」任务：

**待处理的资源列表**：
${resourceList}

**重要提醒**：
${reminders.map((item, index) => `${index + 1}. ${item}`).join("\n")}
`;

  if (params.userPrompt && params.userPrompt.trim()) {
    prompt += `
**用户的额外要求**：
${params.userPrompt}
`;
  }

  prompt += `
**最终输出**：
${params.finalOutput.map((item) => `- ${item}`).join("\n")}
`;

  return prompt;
};
