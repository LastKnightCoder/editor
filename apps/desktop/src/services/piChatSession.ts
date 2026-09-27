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
import {
  piSessionCreate,
  piSessionDispose,
  piSessionSetActiveTools,
  piSessionSetSystemPrompt,
} from "@/commands/piSession";
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
  /** 交 pi 注册的工具全集指纹（变化才重建） */
  toolUniverse?: string;
  /** 最近一次推给宿主的活跃工具集（仅在真变化时推送，避免白丢提示缓存） */
  activeToolNames?: string[];
}

const sameNames = (a: string[] | undefined, b: string[]): boolean =>
  Boolean(a) && a!.length === b.length && a!.every((name, index) => name === b[index]);

/** chatScope 带 `"main-chat:123"` 形态的参数前缀，会话键取冒号前缀（与 conversationKey 约定一致） */
export const chatSessionKey = (chatScope: string, chatId: number): string =>
  `${chatScope.split(":")[0]}:${chatId}`;

class PiChatSessionManager {
  private readonly sessions = new Map<string, ChatSessionDescriptor>();

  public resolveSessionId(chatScope: string, chatId: number): string | undefined {
    return this.sessions.get(chatSessionKey(chatScope, chatId))?.sessionId;
  }

  /**
   * 渲染层重载后收养主进程仍持有的会话（待审批/待回答交互恢复等场景）：
   * 把 find-by-scope 拿到的 sessionId 记回本地表并接上工具桥上下文。
   */
  public async adoptOrResolveSession(
    chatScope: string,
    chatId: number
  ): Promise<string | undefined> {
    initPiToolBridge();
    const local = this.resolveSessionId(chatScope, chatId);
    if (local) return local;
    const { piSessionFindByScope } = await import("@/commands/piSession");
    const found = await piSessionFindByScope(chatSessionKey(chatScope, chatId));
    if (!found.ok || !found.sessionId || !found.modelRef) return undefined;
    this.sessions.set(chatSessionKey(chatScope, chatId), {
      sessionId: found.sessionId,
      providerId: found.modelRef.providerId,
      modelId: found.modelRef.modelId,
      thinkingLevel: found.thinkingLevel,
    });
    registerPiToolSessionContext(found.sessionId, {
      conversationKey: chatSessionKey(chatScope, chatId),
    });
    return found.sessionId;
  }

  public isStreamingKnown(chatScope: string, chatId: number): boolean {
    return this.sessions.has(chatSessionKey(chatScope, chatId));
  }

  /**
   * 确保 chat 有可用 pi 会话：模型/档位变化自动重建；systemPrompt 每轮热替换。
   * 工具集变化分两档——启用/停用已注册的工具只切活跃集（不重建、保留本会话授权）；
   * 出现新的工具定义（新连 MCP 服务器、schema 变更）才重建，因为 pi 注册表装配后不可追加。
   */
  public async ensureChatSession(options: EnsureChatSessionOptions): Promise<string> {
    const key = chatSessionKey(options.chatScope, options.chatId);
    const existing = this.sessions.get(key);
    if (
      existing &&
      existing.providerId === options.provider.id &&
      existing.modelId === options.model.id &&
      existing.thinkingLevel === options.thinkingLevel
    ) {
      const loadout = buildToolLoadout(options);
      if (existing.toolUniverse !== undefined && existing.toolUniverse !== loadout.universe) {
        return this.createSession(key, options, loadout, { dispose: true });
      }
      if (!sameNames(existing.activeToolNames, loadout.activeToolNames)) {
        const outcome = await piSessionSetActiveTools(existing.sessionId, loadout.activeToolNames);
        if (outcome.ok) existing.activeToolNames = loadout.activeToolNames;
        else console.error("同步活跃工具集失败:", outcome.error);
      }
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

  private async createSession(
    key: string,
    options: EnsureChatSessionOptions,
    prebuilt?: ChatToolLoadout,
    lifecycle?: { dispose?: boolean }
  ): Promise<string> {
    if (lifecycle?.dispose) await this.disposeByKey(key);
    initPiToolBridge();
    const sessionId = crypto.randomUUID();
    const loadout = prebuilt ?? buildToolLoadout(options);
    const customTools = loadout.specs;
    const outcome = await piSessionCreate(sessionId, {
      // scope 用会话键（`<scope前缀>:<chatId>`）：渲染层重载后 find-by-scope 靠它收养会话
      scope: key,
      cwd: options.cwd ?? "",
      modelRef: { providerId: options.provider.id, modelId: options.model.id },
      systemPrompt: options.systemPrompt,
      interactive: true,
      ...(options.persist === false ? { persist: false } : {}),
      ...(customTools.length > 0 ? { customTools, activeToolNames: loadout.activeToolNames } : {}),
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
      toolUniverse: loadout.universe,
      activeToolNames: loadout.activeToolNames,
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    });
    return sessionId;
  }
}

/** 工具装配结果：specs = 交 pi 注册的全集（含停用项），activeToolNames = 本轮活跃子集 */
export interface ChatToolLoadout {
  specs: PiHostToolSpec[];
  activeToolNames: string[];
  /** 全集指纹：只有它变化才需要重建会话（pi 注册表装配后不可追加定义） */
  universe: string;
}

/**
 * 组装 pi 工具清单：注册表（含 scoped/skill/停用项）+ 额外工具覆盖同名。
 * **按名字排序**——工具定义渲染在请求最前，顺序变化会整条作废提示缓存，而注册表顺序
 * 取决于各 MCP 服务器异步连接完成的先后，必须在这里定死。
 */
function buildToolLoadout(options: EnsureChatSessionOptions): ChatToolLoadout {
  const registryTools = getToolRegistryAgentTools({
    includeBuiltinSkillTools: true,
    includeDisabled: true,
    ...(options.toolScope ? { toolScope: options.toolScope } : {}),
  });
  const additional = options.additionalTools ?? [];
  const additionalNames = new Set(additional.map(tool => tool.function.name));
  const entries: Array<{ enabled: boolean; spec: PiHostToolSpec }> = registryTools
    .filter(tool => !additionalNames.has(tool.name))
    .map(tool => ({
      enabled: tool.enabled,
      spec: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
        risk: tool.risk ?? "read",
        source: tool.source,
      },
    }));
  for (const tool of additional) {
    entries.push({
      enabled: true,
      spec: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    });
  }
  entries.sort((a, b) => (a.spec.name < b.spec.name ? -1 : a.spec.name > b.spec.name ? 1 : 0));
  const specs = entries.map(entry => entry.spec);
  return {
    specs,
    activeToolNames: entries.filter(entry => entry.enabled).map(entry => entry.spec.name),
    // 描述与参数也进指纹：schema 变了（MCP 服务器升级）同样得重建
    universe: specs
      .map(spec => `${spec.name}\u0001${spec.description}\u0001${JSON.stringify(spec.parameters)}`)
      .join("\u0000"),
  };
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
