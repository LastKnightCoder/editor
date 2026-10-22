/**
 * pi 会话生命周期管理（渲染端）：桌面 chat（scope + chatId）↔ pi 会话的绑定与重建。
 * - ensureChatSession：无会话则创建（工具桥清单 + systemPrompt）；模型变化自动重建；
 *   systemPrompt 每轮经 set-system-prompt 热替换（不重建）
 * 会话事实源是 pi JSONL（M4）：创建时传会话文件，pi 自己从文件恢复上下文，不再灌历史。
 * 改会话树（编辑重发/重新生成/删除/建分支/切版本）不经这里：pi-session:edit 在主进程直接改
 * 宿主会话（空闲时）或文件，宿主不重建（M4-d）。
 */
import type { ImageContent } from "@earendil-works/pi-ai";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { PiHostToolSpec } from "@/types/pi-session";
import { piToolDefinitionKey } from "@/types/pi-session";
import type { Skill } from "@/types";
import type { RegisteredTool } from "@/tools/toolRegistry";
import { getChatDatabase } from "./chatDatabase";
import { normalizePiSystemPrompt } from "./piPromptPayload";
import {
  piSessionCreate,
  piSessionDispose,
  piSessionSetActiveTools,
  piSessionSetSystemPrompt,
  type PiSessionRecovery,
} from "@/commands/piSession";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import { resolveAgentSkills } from "@/agent/desktopSkillAdapter";
import { getSkillReadme } from "@/commands/skill";
import {
  initPiToolBridge,
  registerPiToolSessionContext,
  unregisterPiToolSessionContext,
} from "@/services/piToolBridge";

export interface EnsureChatSessionOptions {
  databaseName?: string;
  chatScope: string;
  /** 对话 id = pi 会话 id（草稿首轮以它新建会话，之后从文件恢复） */
  chatId: string;
  /** 会话文件（目录行里存的相对文件名）；草稿为空 */
  sessionFile?: string;
  /** 浏览器扩展对话：会话落在页面目录，按 chatId 找文件（与 sessionFile 互斥） */
  browserPageUrl?: string;
  provider: LLMProviderSetting;
  model: LLMModelSetting;
  /** 本轮完整 system prompt（拼好 skills/隐藏上下文）；每轮热替换 */
  systemPrompt: string;
  thinkingLevel?: PiThinkingLevel;
  /** 是否有审批条与提问卡（缺省 true；浏览器扩展没有，需确认的工具直接拒绝） */
  interactive?: boolean;
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

export interface EnsuredChatSession {
  sessionId: string;
  /** 宿主回传的会话文件名（草稿首轮据此登记目录行）；收养的会话没有 */
  sessionFile?: string;
}

interface ChatSessionDescriptor {
  sessionId: string;
  sessionFile?: string;
  providerId: string;
  modelId: string;
  thinkingLevel?: PiThinkingLevel;
  /** 宿主会话的工作目录（变化即重建，pi 的工具在装配时绑定 cwd） */
  cwd: string;
  /** 交 pi 注册的工具全集指纹（变化才重建） */
  toolUniverse?: string;
  /** 最近一次推给宿主的活跃工具集（仅在真变化时推送，避免白丢提示缓存） */
  activeToolNames?: string[];
}

const sameNames = (a: string[] | undefined, b: string[]): boolean =>
  Boolean(a) && a!.length === b.length && a!.every((name, index) => name === b[index]);

/** chatScope 带 `"pdf-chat:12"` 形态的参数前缀，会话键取冒号前缀（与 conversationKey 约定一致） */
export const chatSessionKey = (
  chatScope: string,
  chatId: string,
  databaseName = getChatDatabase()
): string =>
  `${databaseName ? `${databaseName.replace(/\.db$/, "")}\u0000` : ""}${chatScope.split(":")[0]}:${chatId}`;

/** 会话键 → 对话 id（= chat_session.id）；不是会话键时返回 null */
export const chatIdFromSessionKey = (key: string): string | null => {
  const body = key.slice(key.indexOf("\u0000") + 1);
  const separator = body.indexOf(":");
  return separator > 0 && separator < body.length - 1 ? body.slice(separator + 1) : null;
};

class PiChatSessionManager {
  private readonly sessions = new Map<string, ChatSessionDescriptor>();
  private readonly creating = new Map<string, Promise<EnsuredChatSession>>();

  public resolveSessionId(chatScope: string, chatId: string): string | undefined {
    return this.sessions.get(chatSessionKey(chatScope, chatId))?.sessionId;
  }

  /**
   * 渲染层重载后收养主进程仍持有的会话，接回工具桥并返回运行状态与回答快照。
   */
  public async adoptOrResolveSession(
    chatScope: string,
    chatId: string,
    databaseName = getChatDatabase()
  ): Promise<PiSessionRecovery | undefined> {
    initPiToolBridge();
    const key = chatSessionKey(chatScope, chatId, databaseName);
    const local = this.sessions.get(key)?.sessionId;
    if (local) return { ok: true, sessionId: local };
    const { piSessionFindByScope } = await import("@/commands/piSession");
    const found = await piSessionFindByScope(key);
    if (!found.ok || !found.sessionId || !found.modelRef) return undefined;
    this.sessions.set(key, {
      sessionId: found.sessionId,
      providerId: found.modelRef.providerId,
      modelId: found.modelRef.modelId,
      thinkingLevel: found.thinkingLevel,
      cwd: found.cwd ?? "",
      toolUniverse: found.toolSpecs?.map(piToolDefinitionKey).join("\u0000"),
    });
    registerPiToolSessionContext(found.sessionId, {
      databaseName,
      sessionTools: getToolRegistryAgentTools({
        includeBuiltinSkillTools: true,
        includeDisabled: true,
        toolScope: found.toolScope,
      })
        .filter(tool =>
          found.toolSpecs?.some(spec => piToolDefinitionKey(spec) === piToolDefinitionKey(tool))
        )
        .map(tool => ({ ...tool, executor: tool.execute })),
      conversationKey: key,
    });
    return found;
  }

  /**
   * 确保 chat 有可用 pi 会话：模型/档位/工作目录变化自动重建；systemPrompt 每轮热替换。
   * 工具集变化分两档——启用/停用已注册的工具只切活跃集（不重建、保留本会话授权）；
   * 出现新的工具定义（新连 MCP 服务器、schema 变更）才重建，因为 pi 注册表装配后不可追加。
   * 重建不丢历史：pi 从会话文件恢复。
   */
  public async ensureChatSession(options: EnsureChatSessionOptions): Promise<EnsuredChatSession> {
    options = { ...options, databaseName: options.databaseName ?? getChatDatabase() };
    const key = chatSessionKey(options.chatScope, options.chatId, options.databaseName);
    const pending = this.creating.get(key);
    if (pending) return pending;
    const existing = this.sessions.get(key);
    if (
      existing &&
      existing.providerId === options.provider.id &&
      existing.modelId === options.model.id &&
      existing.thinkingLevel === options.thinkingLevel &&
      existing.cwd === (options.cwd ?? "")
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
      const refreshed = await piSessionSetSystemPrompt(existing.sessionId, options.systemPrompt);
      // 宿主已被主进程回收（空闲超时、切库，M4-e）：本地描述失效，从会话文件重建
      if (!refreshed.ok) {
        this.forgetByKey(key);
        return this.createSession(key, options, loadout);
      }
      return {
        sessionId: existing.sessionId,
        ...(existing.sessionFile ? { sessionFile: existing.sessionFile } : {}),
      };
    }
    if (existing) {
      await this.disposeByKey(key);
    }
    return this.createSession(key, options);
  }

  public async disposeChatSession(chatScope: string, chatId: string): Promise<void> {
    return this.disposeByKey(chatSessionKey(chatScope, chatId));
  }

  /** 宿主已不存在（主进程回收了）：只清本地描述，不再调 dispose */
  private forgetByKey(key: string): void {
    const descriptor = this.sessions.get(key);
    if (!descriptor) return;
    this.sessions.delete(key);
    unregisterPiToolSessionContext(descriptor.sessionId);
  }

  public async disposeByKey(key: string): Promise<void> {
    const pending = this.creating.get(key);
    if (pending) await pending.catch(() => undefined);
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
  ): Promise<EnsuredChatSession> {
    const pending = this.creating.get(key);
    if (pending) return pending;
    const task = this.createSessionInner(key, options, prebuilt, lifecycle);
    this.creating.set(key, task);
    try {
      return await task;
    } finally {
      if (this.creating.get(key) === task) this.creating.delete(key);
    }
  }

  private async createSessionInner(
    key: string,
    options: EnsureChatSessionOptions,
    prebuilt?: ChatToolLoadout,
    lifecycle?: { dispose?: boolean }
  ): Promise<EnsuredChatSession> {
    if (lifecycle?.dispose) await this.disposeByKey(key);
    initPiToolBridge();
    // 宿主登记键（这一次打开）与 pi 会话 id（这条对话）是两回事：前者每次重建都换
    const sessionId = crypto.randomUUID();
    const loadout = prebuilt ?? buildToolLoadout(options);
    const customTools = loadout.specs;
    const outcome = await piSessionCreate(sessionId, {
      toolScope: options.toolScope,
      ...(options.databaseName ? { databaseName: options.databaseName } : {}),
      // scope 用会话键（`<scope前缀>:<chatId>`）：渲染层重载后 find-by-scope 靠它收养会话
      scope: key,
      chatScope: options.chatScope,
      cwd: options.cwd ?? "",
      modelRef: { providerId: options.provider.id, modelId: options.model.id },
      systemPrompt: options.systemPrompt,
      interactive: options.interactive ?? true,
      piSessionId: options.chatId,
      ...(options.sessionFile ? { sessionFile: options.sessionFile } : {}),
      ...(options.browserPageUrl ? { browserPageUrl: options.browserPageUrl } : {}),
      ...(options.persist === false ? { persist: false } : {}),
      ...(customTools.length > 0 ? { customTools, activeToolNames: loadout.activeToolNames } : {}),
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    });
    if (!outcome.ok) {
      throw new Error(outcome.error ?? "pi 会话创建失败");
    }
    registerPiToolSessionContext(sessionId, {
      databaseName: options.databaseName,
      sessionTools: loadout.tools,
      toolScope: options.toolScope,
      scopedTools: loadout.tools.filter(tool => tool.source === options.toolScope),
      conversationKey: key,
      // 子代理沿用对话的工作目录（subagentTool 从 toolContext.cwd 读）
      ...(options.toolContext || options.cwd
        ? { toolContext: { ...options.toolContext, ...(options.cwd ? { cwd: options.cwd } : {}) } }
        : {}),
    });
    this.sessions.set(key, {
      sessionId,
      ...(outcome.sessionFile ? { sessionFile: outcome.sessionFile } : {}),
      providerId: options.provider.id,
      modelId: options.model.id,
      cwd: options.cwd ?? "",
      toolUniverse: loadout.universe,
      activeToolNames: loadout.activeToolNames,
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    });
    return { sessionId, ...(outcome.sessionFile ? { sessionFile: outcome.sessionFile } : {}) };
  }
}

/** 工具装配结果：specs = 交 pi 注册的全集（含停用项），activeToolNames = 本轮活跃子集 */
export interface ChatToolLoadout {
  tools: RegisteredTool[];
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
        executionIdentity: tool.executionIdentity,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
        risk: tool.risk ?? "execute",
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
        // 额外工具（浏览器扩展的页面读取工具、扩展本地的提问）只读当前页面：按 read 声明。
        // 不声明的话权限层按 execute 处理，扩展会话不可交互，默认手动确认模式下会被全部拒绝
        risk: "read",
      },
    });
  }
  entries.sort((a, b) => (a.spec.name < b.spec.name ? -1 : a.spec.name > b.spec.name ? 1 : 0));
  const specs = entries.map(entry => entry.spec);
  return {
    tools: registryTools
      .filter(tool => !additionalNames.has(tool.name))
      .map(tool => ({
        ...tool,
        parameters: structuredClone(tool.parameters),
        executor: tool.execute,
      })),
    specs,
    activeToolNames: entries.filter(entry => entry.enabled).map(entry => entry.spec.name),
    // 描述与参数也进指纹：schema 变了（MCP 服务器升级）同样得重建
    universe: specs.map(piToolDefinitionKey).join("\u0000"),
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

/** 点名的磁盘 Skill（我的、关联目录、插件包）没有内联正文，注入前先读取 SKILL.md。 */
export async function withForcedSkillReadmes(
  skills: Skill[],
  forcedSkills: string[]
): Promise<Skill[]> {
  return Promise.all(
    skills.map(async skill =>
      skill.readmeContent === undefined && forcedSkills.includes(skill.folderName)
        ? {
            ...skill,
            readmeContent: (await getSkillReadme(skill.path).catch(() => null)) ?? undefined,
          }
        : skill
    )
  );
}

/**
 * 会话 systemPrompt = 基础 system + Skills 注入（SkillMessageContributor 的 pi 等价物）：
 * 可用清单 + 本轮 `$` 点名 Skill 的 SKILL.md 全文。
 */
export function buildPiChatSystemPrompt(
  baseSystem: string,
  skills: Skill[],
  forcedSkills: string[]
): string {
  baseSystem = normalizePiSystemPrompt(baseSystem);
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
