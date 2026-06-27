const TOOL_GUIDE = `## 可用工具

你可以使用以下工具来获取资料内容：

### 1. list_project_resources
- 功能：列出当前项目的所有上传资源
- 用途：了解项目中有哪些资料可用

### 2. read_resource_content
- 功能：读取指定资源的 Markdown 内容
- 参数：resourceName（资源名称）
- 用途：读取完整 Markdown 的开头内容；长文档会截断，不能替代精确补读

### 3. search_resource_content
- 功能：语义搜索项目资料
- 参数：query（搜索关键词或问题）、limit（返回数量，默认 5）
- 用途：快速定位相关 chunk，并获得 resourceId、chunkIndex、行范围和字符范围

### 4. grep_resource_content
- 功能：使用 ripgrep 做精确关键词或正则搜索
- 参数：query、isRegex、ignoreCase、limit
- 用途：定位精确字面匹配，并获得 lineNumber、startOffset、endOffset、matchedText 和 preview

### 5. read_resource_lines
- 功能：按行范围读取指定资源的内容
- 参数：resourceName（资源名称）、startLine（起始行）、endLine（结束行）
- 用途：根据 search 返回的 chunkStartLine/chunkEndLine 或 grep 返回的 lineNumber 补读上下文

### 6. read_resource_range
- 功能：按字符范围读取指定资源的内容
- 参数：resourceId 或 resourceName、startOffset（起始字符）、endOffset（结束字符）
- 用途：根据 search/grep 返回的 startOffset/endOffset 精确补读上下文

### 7. batch_search_project_knowledge
- 功能：批量执行多个搜索查询
- 参数：queries（查询数组，每项为 { label, query }）、limitPerQuery
- 用途：对复杂问题并行比较多个搜索角度，减少单一表述漏召回

### 8. batch_read_search_hits
- 功能：批量补读多个搜索命中的上下文
- 参数：hits（命中数组，每项应带 resourceId/resourceName 和字符范围或行范围）
- 用途：在已拿到多个候选证据时，统一按字符范围或行范围补上下文`;

const EXPLORATION_RULES = `## 资料探索规则（核心要求）

在生成结果之前，你必须先充分探索资料，不能直接凭少量片段开始生成。

### 1. 正确认识不同证据层级
- 搜索结果片段只用于定位线索，不代表全文，不能直接当作充分证据
- read_resource_content 对长文档会截断，不代表全文
- read_resource_lines/read_resource_range 读取到的原文上下文，才是高置信度证据

### 2. 长文默认先定位再补读
- 不要一次性读取长文全文
- 先用 search_resource_content 做语义定位，或用 grep_resource_content 做精确字面定位
- 根据返回的 resourceId、行范围或字符范围，用 read_resource_lines/read_resource_range 补读上下文

### 3. 搜索只负责定位，阅读负责确认
- 对复杂问题，先自己决定需要哪些步骤，再组合使用 search_resource_content、grep_resource_content、batch_search_project_knowledge、read_resource_lines、read_resource_range
- 搜索后优先看 resourceId、chunkStartLine/chunkEndLine、startOffset/endOffset、whyMatched
- 如果只需要某个命中附近上下文，优先使用 read_resource_lines 或 read_resource_range
- 如果问题需要跨多个主题、多个搜索角度搜集资料，且预计会产生较多搜索命中、上下文补读或并行查证需求，应优先使用全局工具 subagent_research 把资料搜集任务拆给多个 SubAgent；不要让主 Agent 独自串很长的资料搜集链路

### 4. 生成前必须达到证据门槛
- 至少覆盖每个已选资源的核心模块，而不是只覆盖几个零散片段
- 细节、定义、步骤、因果、对比、案例等内容，必须回到正文确认
- 如果当前证据不足以支持高质量生成，继续探索，而不是勉强输出`;

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
    "对于长文档，先 search 或 grep 定位，再按行或字符范围补读上下文",
    "搜索结果只用于定位线索，关键内容要回到原文范围确认",
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
