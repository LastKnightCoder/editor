import type { CodexInputItem } from "./codexInputAdapter";

const TAU_CODEX_CONTEXT_START = "<TAU_CODEX_CONTEXT>";
const TAU_CODEX_CONTEXT_END = "</TAU_CODEX_CONTEXT>";

const stripTauCodexContext = (prompt: string) => {
  const pattern = new RegExp(
    `${TAU_CODEX_CONTEXT_START}[\\s\\S]*?${TAU_CODEX_CONTEXT_END}\\n?`,
    "g",
  );
  return prompt.replace(pattern, "").trimEnd();
};

const TAU_CODEX_CONTEXT = `${TAU_CODEX_CONTEXT_START}
你运行在 Tau 笔记应用的聊天侧边栏中，不是在普通代码仓库助手环境中。

Tau 应用上下文规则：
- 当用户提到“左侧卡片”、“当前卡片”、“当前文章”、“当前编辑区”、“当前打开内容”、“正在编辑的内容”、“笔记内容”等 Tau 应用上下文时，优先调用 tau_notes MCP 工具读取上下文，不要优先尝试截图、读取工作区文件或猜测。
- 读取当前激活编辑区/左侧内容时，先调用 get_active_editing_context；如果需要正文内容，再根据返回的 contentId 调用 get_content_markdown。
- 需要定位或修改 Tau 内容时，优先使用 resolve_entity_content_id、find_content_ranges、apply_content_edit_operations、replace_content_by_text、rewrite_content_full 等 Tau 工具。
- 当用户提到使用 skill、某个 skill 名称，或请求按特定流程/能力完成任务时，先使用 Tau 自己的 skill 工具检查是否有相关 skill；优先调用 list_skills，再按需调用 get_skill_readme、get_skill_tree、read_skill_file 获取执行说明和附带文件，不要只依赖 Codex 自身的 skill 系统或记忆。
- Tau 工具的权限和业务校验由 Tau 应用内部决定；你可以直接调用可用的 tau_notes MCP 工具。
- 如果工具返回无法确定当前上下文，再向用户说明需要在 Tau 中激活对应卡片或文章。
${TAU_CODEX_CONTEXT_END}`;

export const buildCodexSystemPrompt = (basePrompt: string) => {
  const cleanPrompt = stripTauCodexContext(basePrompt);
  return `${cleanPrompt}\n\n${TAU_CODEX_CONTEXT}`;
};

export const prependCodexSystemPromptToInput = (
  input: string | CodexInputItem[],
  systemPrompt: string,
): string | CodexInputItem[] => {
  const prompt = systemPrompt.trim();
  if (!prompt) {
    return input;
  }

  if (typeof input === "string") {
    return `${prompt}\n\n用户消息：\n${input}`;
  }

  const nextInput = [...input];
  const firstTextIndex = nextInput.findIndex((item) => item.type === "text");
  if (firstTextIndex >= 0) {
    const textItem = nextInput[firstTextIndex] as Extract<
      CodexInputItem,
      { type: "text" }
    >;
    nextInput[firstTextIndex] = {
      ...textItem,
      text: `${prompt}\n\n用户消息：\n${textItem.text}`,
    };
    return nextInput;
  }

  return [
    {
      type: "text",
      text: prompt,
    },
    ...nextInput,
  ];
};
