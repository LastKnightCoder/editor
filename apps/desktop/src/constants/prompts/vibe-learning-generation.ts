const TOOL_GUIDE = `## 可用工具

统一使用 \`vibe_learning_query\` 查询当前项目资料。

- \`operation=list\`：列出资源，input 为空。
- \`operation=search\`：语义搜索，input 传 query、limit。
- \`operation=grep\`：精确文本或正则搜索，input 传 query 等参数。
- \`operation=read\`：读取资源预览，input 传 resourceName。
- \`operation=read_lines\` / \`read_range\`：按行号或字符范围补读原文。
- \`operation=batch_search\` / \`batch_read\`：批量搜索或补读多个命中。

先搜索定位，再根据返回的 resourceId、行范围或字符范围补读原文。`;

const EXPLORATION_RULES = `## 资料探索规则（核心要求）

在生成结果之前，你必须先充分探索资料，不能直接凭少量片段开始生成。

### 1. 正确认识不同证据层级
- 搜索结果片段只用于定位线索，不代表全文，不能直接当作充分证据
- read_resource_content 对长文档会截断，不代表全文
- vibe_learning_query 的 read_lines/read_range 读取到的原文上下文，才是高置信度证据

### 2. 长文默认先定位再补读
- 不要一次性读取长文全文
- 先用 vibe_learning_query 的 search 或 grep operation 做语义/精确定位
- 根据返回的 resourceId、行范围或字符范围，用 vibe_learning_query 的 read_lines/read_range 补读上下文

### 3. 搜索只负责定位，阅读负责确认
- 对复杂问题，通过 vibe_learning_query 的 operation 组合搜索、批量搜索和范围补读
- 搜索后优先看 resourceId、chunkStartLine/chunkEndLine、startOffset/endOffset、whyMatched
- 如果只需要某个命中附近上下文，优先使用 vibe_learning_query 的 read_lines 或 read_range
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
  const resourceList = params.resourceNames.map(name => `- ${name}`).join("\n");
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
${params.finalOutput.map(item => `- ${item}`).join("\n")}
`;

  return prompt;
};
