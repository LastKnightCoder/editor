/**
 * pi 会话生命周期管理（渲染端）：桌面 chat（scope + chatId）↔ pi 会话的绑定与重建。
 * - ensureChatSession：无会话则创建（灌历史 + 工具桥清单 + systemPrompt）；模型变化自动重建；
 *   systemPrompt 每轮经 set-system-prompt 热替换（不重建）
 * - recreateChatSession：编辑历史/重试/模型切换等非 append-only 变更时显式重建
 * 会话事实源渐进切向 pi JSONL（M4）；M2-f 期间 chat 行仍是 UI 展示源。
 */
import type { RequestMessage } from "@/types";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { PiHostToolSpec } from "@/types/pi-session";
import type { Skill } from "@/types";
import { piSessionCreate, piSessionDispose, piSessionSetSystemPrompt } from "@/commands/piSession";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import { resolveAgentSkills } from "@/agent/desktopSkillAdapter";
import {
  initPiToolBridge,
  registerPiToolSessionContext,
  unregisterPiToolSessionContext,
} from "@/services/piToolBridge";

export interface EnsureChatSessionOptions {
  chatScope: string;
  chatId: number;
  provider: LLMProviderSetting;
  model: LLMModelSetting;
  /** 本轮完整 system prompt（拼好 skills/隐藏上下文）；每轮热替换 */
  systemPrompt: string;
  /** 灌入历史（仅创建时消费；chat-core 消息序列） */
  history: RequestMessage[];
  thinkingLevel?: PiThinkingLevel;
  toolScope?: string;
  /** 工具执行附加上下文（渲染端执行时的 toolContext） */
  toolContext?: Record<string, unknown>;
  cwd?: string;
  /** 单轮场景（一次性 pi 会话）传 false 禁用 JSONL 持久化 */
  persist?: boolean;
  /** 额外工具（OpenAI function 形状，覆盖同名注册表工具） */
  additionalTools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  /** 额外工具的执行器（返回 null 表示未接管，走注册表） */
  executeAdditionalTool?: (
    toolName: string,
    args: Record<string, unknown>,
    context: { conversationKey: string }
  ) => Promise<{
    content: string;
    modelContent?: string;
    metadata?: Record<string, unknown>;
  } | null>;
}

interface ChatSessionDescriptor {
  sessionId: string;
  providerId: string;
  modelId: string;
  thinkingLevel?: PiThinkingLevel;
}

/** chatScope 带 `"main-chat:123"` 形态的参数前缀，会话键取冒号前缀（与 conversationKey 约定一致） */
export const chatSessionKey = (chatScope: string, chatId: number): string =>
  `${chatScope.split(":")[0]}:${chatId}`;

class PiChatSessionManager {
  private readonly sessions = new Map<string, ChatSessionDescriptor>();

  public resolveSessionId(chatScope: string, chatId: number): string | undefined {
    return this.sessions.get(chatSessionKey(chatScope, chatId))?.sessionId;
  }

  /**
   * 渲染层重载后收养主进程仍持有的会话（ask-question 恢复等场景）：
   * 把 find-by-scope 拿到的 sessionId 记回本地表并接上工具桥上下文。
   */
  public async adoptOrResolveSession(
    chatScope: string,
    chatId: number
  ): Promise<string | undefined> {
    const local = this.resolveSessionId(chatScope, chatId);
    if (local) return local;
    const { piSessionFindByScope } = await import("@/commands/piSession");
    const found = await piSessionFindByScope(chatSessionKey(chatScope, chatId));
    if (!found.ok || !found.sessionId) return undefined;
    this.sessions.set(chatSessionKey(chatScope, chatId), {
      sessionId: found.sessionId,
      providerId: "",
      modelId: "",
    });
    registerPiToolSessionContext(found.sessionId, {
      conversationKey: chatSessionKey(chatScope, chatId),
    });
    return found.sessionId;
  }

  public isStreamingKnown(chatScope: string, chatId: number): boolean {
    return this.sessions.has(chatSessionKey(chatScope, chatId));
  }

  /** 确保 chat 有可用 pi 会话：模型/档位变化自动重建；systemPrompt 每轮热替换 */
  public async ensureChatSession(options: EnsureChatSessionOptions): Promise<string> {
    const key = chatSessionKey(options.chatScope, options.chatId);
    const existing = this.sessions.get(key);
    if (
      existing &&
      existing.providerId === options.provider.id &&
      existing.modelId === options.model.id &&
      existing.thinkingLevel === options.thinkingLevel
    ) {
      await piSessionSetSystemPrompt(existing.sessionId, options.systemPrompt);
      return existing.sessionId;
    }
    if (existing) {
      await this.disposeChatSession(options.chatScope, options.chatId);
    }
    return this.createSession(key, options);
  }

  /** 强制重建（编辑历史/重试/分支回退等非 append-only 变更） */
  public async recreateChatSession(options: EnsureChatSessionOptions): Promise<string> {
    const key = chatSessionKey(options.chatScope, options.chatId);
    await this.disposeChatSession(options.chatScope, options.chatId);
    return this.createSession(key, options);
  }

  public async disposeChatSession(chatScope: string, chatId: number): Promise<void> {
    return this.disposeByKey(chatSessionKey(chatScope, chatId));
  }

  public async disposeByKey(key: string): Promise<void> {
    const descriptor = this.sessions.get(key);
    if (!descriptor) return;
    this.sessions.delete(key);
    unregisterPiToolSessionContext(descriptor.sessionId);
    await piSessionDispose(descriptor.sessionId);
  }

  public async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(key => this.disposeByKey(key)));
  }

  private async createSession(key: string, options: EnsureChatSessionOptions): Promise<string> {
    initPiToolBridge();
    const sessionId = crypto.randomUUID();
    const customTools = buildToolSpecs(options);
    const outcome = await piSessionCreate(sessionId, {
      scope: options.chatScope,
      cwd: options.cwd ?? "",
      modelRef: { providerId: options.provider.id, modelId: options.model.id },
      systemPrompt: options.systemPrompt,
      ...(options.persist === false ? { persist: false } : {}),
      ...(customTools.length > 0 ? { customTools } : {}),
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
      ...(options.history.length > 0 ? { initialMessages: options.history } : {}),
    });
    if (!outcome.ok) {
      throw new Error(outcome.error ?? "pi 会话创建失败");
    }
    registerPiToolSessionContext(sessionId, {
      conversationKey: key,
      ...(options.toolContext ? { toolContext: options.toolContext } : {}),
    });
    this.sessions.set(key, {
      sessionId,
      providerId: options.provider.id,
      modelId: options.model.id,
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    });
    return sessionId;
  }
}

/** 组装 pi customTools 清单：注册表（含 scoped，含 skill 工具）+ 额外工具覆盖同名 */
function buildToolSpecs(options: EnsureChatSessionOptions): PiHostToolSpec[] {
  const registryTools = getToolRegistryAgentTools({
    includeBuiltinSkillTools: true,
    ...(options.toolScope ? { toolScope: options.toolScope } : {}),
  });
  const additional = options.additionalTools ?? [];
  const additionalNames = new Set(additional.map(tool => tool.function.name));
  const specs: PiHostToolSpec[] = registryTools
    .filter(tool => !additionalNames.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    }));
  for (const tool of additional) {
    specs.push({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    });
  }
  return specs;
}

/** 桌面图片块 → pi ImageContent（dataURL 解析；http/base64 原样交主进程处理） */
export function toPiImageContent(image: string, mimeType = "image/png"): ImageContent {
  const dataUrlMatch = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return { type: "image", data: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
  }
  return { type: "image", data: image, mimeType };
}

const formatSkillsList = (skills: Skill[]) =>
  skills
    .map(
      skill =>
        `${skill.folderName} metadata:
  - Name: ${skill.name}
  - Description: ${skill.description || "无描述"}
  - Path: ${skill.path || "unknown"}`
    )
    .join("\n");

/**
 * 会话 systemPrompt = 基础 system + Skills 注入（SkillMessageContributor 的 pi 等价物）：
 * 可用清单 + 本轮 `$` 点名 Skill 的 SKILL.md 全文。
 */
export function buildPiChatSystemPrompt(
  baseSystem: string,
  skills: Skill[],
  forcedSkills: string[]
): string {
  const resolved = resolveAgentSkills(skills, forcedSkills);
  if (resolved.length === 0 && forcedSkills.length === 0) return baseSystem;

  const forced = resolved.filter(skill => forcedSkills.includes(skill.folderName));
  const listed = resolved.filter(skill => !forcedSkills.includes(skill.folderName));
  const sections: string[] = [];
  if (listed.length > 0) {
    sections.push(
      "## 可用 Skills",
      "",
      "以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 `get_skill_readme` 工具获取详细说明：",
      "",
      formatSkillsList(listed)
    );
  }
  if (forced.length > 0) {
    const bodies = forced.map(
      skill =>
        `### ${skill.name}（${skill.folderName}）\n\n${skill.readmeContent ?? "（无 SKILL.md 内容）"}`
    );
    if (sections.length > 0) sections.push("");
    sections.push(
      "## 本轮指定的 Skills",
      "",
      "用户在本条消息里用 `$` 点名了以下 Skill，请按其说明完成任务；附带的其它文件可用 `read_skill_file` 读取，脚本可用 `run_skill_script` 执行：",
      "",
      ...bodies
    );
  }
  return `${baseSystem}\n\n${sections.join("\n")}`;
}

export const piChatSessionManager = new PiChatSessionManager();
