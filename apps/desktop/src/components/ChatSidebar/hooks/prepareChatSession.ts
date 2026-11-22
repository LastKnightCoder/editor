import { DEFAULT_SYSTEM_PROMPT, buildSessionAwareSystemPrompt } from "@/constants";
import {
  buildPiChatSystemPrompt,
  piChatSessionManager,
  withForcedSkillReadmes,
} from "@/services/piChatSession";
import { resolveChatCwd } from "@/stores/useChatSessionStore";
import type { ChatMessage, Skill } from "@/types";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";

/**
 * 每个对话的基础 system prompt（含会话时间上下文）在本次运行内固定：时间精确到分钟，
 * 每轮重算会让 system 段每轮都变、整条提示缓存作废。重载后重新生成一次（只丢一次缓存）。
 */
const SESSION_SYSTEM_PROMPTS = new Map<string, { base: string; prompt: string }>();
const sessionSystemPromptOf = (chatId: string, base: string): string => {
  const cached = SESSION_SYSTEM_PROMPTS.get(chatId);
  if (cached && cached.base === base) return cached.prompt;
  const prompt = buildSessionAwareSystemPrompt(base);
  SESSION_SYSTEM_PROMPTS.set(chatId, { base, prompt });
  return prompt;
};

interface ChatSessionSetup {
  chatProviderConfig: LLMProviderSetting | null;
  chatModelConfig: LLMModelSetting | null;
  skills: Skill[];
  thinkingLevel: PiThinkingLevel;
  chatScope: string;
  customSystemPrompt?: string;
  forcedSkills?: string[];
  toolScope?: string;
  toolContext?: Record<string, unknown>;
}

export async function prepareChatSession(
  chat: ChatMessage,
  {
    chatProviderConfig,
    chatModelConfig,
    skills,
    thinkingLevel,
    chatScope,
    customSystemPrompt,
    forcedSkills = [],
    toolScope,
    toolContext,
  }: ChatSessionSetup
) {
  if (!chatProviderConfig || !chatModelConfig) throw new Error("请先在设置中配置对话功能的大模型");
  const baseSystem = sessionSystemPromptOf(chat.id, customSystemPrompt || DEFAULT_SYSTEM_PROMPT);
  const systemPrompt = buildPiChatSystemPrompt(
    baseSystem,
    await withForcedSkillReadmes(skills, forcedSkills),
    forcedSkills
  );
  // 不传历史：pi 从会话文件恢复上下文（草稿首轮以对话 id 新建会话）
  return piChatSessionManager.ensureChatSession({
    databaseName: chat.databaseName,
    chatScope,
    chatId: chat.id,
    ...(chat.sessionFile ? { sessionFile: chat.sessionFile } : {}),
    provider: chatProviderConfig,
    model: chatModelConfig,
    systemPrompt,
    // 只有主对话可选工作目录；学习项目由主进程按场景固定，PDF / 视频笔记在应用数据目录
    cwd: chatScope === "main-chat" ? resolveChatCwd(chat.id) : "",
    ...(chatModelConfig.reasoning ? { thinkingLevel } : {}),
    ...(toolScope ? { toolScope } : {}),
    ...(toolContext ? { toolContext } : {}),
  });
}
