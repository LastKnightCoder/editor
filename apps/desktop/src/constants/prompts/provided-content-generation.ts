export const PROVIDED_CONTENT_GENERATION_RULES = `## 已提供内容使用规则（核心要求）

在生成结果之前，你必须先完整理解当前已经提供给你的内容，并且只能基于这些内容生成结果。

### 1. 证据边界
- 只能使用当前消息中已经提供的内容作为依据
- 不要补充内容中没有出现、没有明确暗示的事实
- 如果某个细节在已提供内容中不存在，就不要自行脑补

### 2. 生成前的理解要求
- 先建立对已提供内容整体结构的理解，再组织输出
- 不要只抓住局部片段就下结论
- 重要定义、步骤、因果、案例、对比等内容，必须能在已提供内容中找到依据

### 3. 表达要求
- 输出应像直接在讲知识本身，而不是在转述“材料说了什么”
- 不要出现“原文中提到”“材料里说”“根据上述内容”等元表述
- 如果已提供内容不足以支撑某个强结论，优先保守表达

### 4. 质量门槛
- 确保输出覆盖已提供内容中的主要模块，而不是只围绕某一小段展开
- 保持内容准确，不要因为追求完整而虚构细节`;

export const buildProvidedContentGenerationUserPrompt = (params: {
  title: string;
  content: string;
  userPrompt?: string;
  finalOutput: string[];
  extraReminders?: string[];
}): string => {
  const reminders = [
    "只基于下面已经提供的内容生成，不要补充内容中没有依据的信息",
    "先理解整体结构，再组织输出",
    "如果某个细节没有明确依据，就不要自行脑补",
    ...(params.extraReminders || []),
  ];

  let prompt = `
请基于以下已提供内容完成「${params.title}」任务：

**已提供内容**：
---
${params.content}
---

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
