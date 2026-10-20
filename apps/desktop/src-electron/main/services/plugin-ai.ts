import { randomUUID } from "node:crypto";
import type { PluginAIFeature, PluginAIResult, PluginAICapability } from "@tau/plugins";
import { PLUGIN_AI_CAPABILITIES, isPluginAICapability } from "@tau/plugins/package";
import type {
  PluginAIConfig,
  PluginAIInfo,
  PluginAIRunning,
  PluginAIWireRequest,
} from "@/types/plugin-ai";
import type { UsageRecordInput } from "../modules/model-usage/recorder";
import type { PiSingleShotRequest } from "@/types/pi-llm";

interface Session {
  owner: number;
  plugin: PluginAIInfo;
  hostFeature?: PluginAICapability;
}
interface Ledger {
  day: string;
  requests: number;
  tokens: number;
}
interface Running extends PluginAIRunning {
  session: string;
  controller: AbortController;
}

export interface PluginAIDeps {
  read(key: string): string | null;
  write(key: string, value: string): void;
  hostModel?(feature: PluginAICapability): Promise<{ providerId: string; modelId: string } | null>;
  capacity(
    providerId: string,
    modelId: string
  ): Promise<{ contextWindow: number; maxTokens: number }>;
  audit(input: UsageRecordInput): (input: UsageRecordInput) => void;
  execute(
    request: PiSingleShotRequest,
    signal: AbortSignal,
    delta: (text: string) => void,
    record: (input: UsageRecordInput) => void
  ): Promise<{ ok: boolean; text: string; error?: string }>;
}

const keyOf = (id: string) => `plugin-ai:config:${id}`;
const defaults = (): PluginAIConfig => ({
  enabled: false,
  dailyRequests: 100,
  dailyTokens: 1_000_000,
  concurrency: 2,
  assignments: {},
});
const localDay = () => new Date().toLocaleDateString("sv-SE");
const validId = (id: string) =>
  typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id);

function validateImages(messages: PluginAIWireRequest["messages"]) {
  let encodedSize = 0;
  for (const message of messages) {
    const images = "images" in message ? message.images : undefined;
    if (images === undefined) continue;
    if (message.role !== "user" || !Array.isArray(images) || images.length > 10)
      throw new Error("AI_INVALID_REQUEST：图片参数无效");
    for (const image of images) {
      if (!image || typeof image.data !== "string")
        throw new Error("AI_INVALID_REQUEST：图片参数无效");
      encodedSize += image.data.length;
      if (
        encodedSize > 20 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(image.mimeType) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      )
        throw new Error("AI_INVALID_REQUEST：图片格式无效或过大");
    }
  }
}

/** 本机所有窗口共用授权、预占额度和执行中的请求。 */
export class PluginAIService {
  private sessions = new Map<string, Session>();
  private active = new Map<string, Running>();
  constructor(private deps: PluginAIDeps) {}

  register(
    owner: number,
    id: string,
    name: string,
    features: PluginAIFeature[],
    hostFeature?: PluginAICapability
  ): string {
    if (hostFeature !== undefined && !isPluginAICapability(hostFeature))
      throw new Error("AI_UNDECLARED_FEATURE");
    if (
      !validId(id) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 128 ||
      !Array.isArray(features) ||
      features.length > 32
    )
      throw new Error("AI_INVALID_DECLARATION");
    const ids = new Set<string>();
    const clean = features.map(feature => {
      if (
        !validId(feature.id) ||
        ids.has(feature.id) ||
        typeof feature.name !== "string" ||
        !feature.name.trim() ||
        feature.name.length > 128
      )
        throw new Error("AI_INVALID_DECLARATION");
      ids.add(feature.id);
      return {
        id: feature.id,
        name: feature.name,
        description:
          typeof feature.description === "string" ? feature.description.slice(0, 512) : undefined,
      };
    });
    const previous = this.info(id);
    const plugin: PluginAIInfo = {
      id,
      name,
      features: hostFeature ? (previous?.features ?? []) : clean,
      hostFeatures: [
        ...new Set([...(previous?.hostFeatures ?? []), ...(hostFeature ? [hostFeature] : [])]),
      ],
      config: previous?.config ?? defaults(),
    };
    this.deps.write(keyOf(id), JSON.stringify(plugin));
    const session = randomUUID();
    this.sessions.set(session, { owner, plugin, hostFeature });
    return session;
  }

  unregister(owner: number, session: string) {
    if (this.sessions.get(session)?.owner !== owner) return;
    this.sessions.delete(session);
    for (const entry of this.active.values())
      if (entry.session === session) entry.controller.abort();
  }
  releaseOwner(owner: number) {
    for (const [key, session] of this.sessions)
      if (session.owner === owner) this.unregister(owner, key);
  }
  info(id: string): PluginAIInfo | null {
    if (!validId(id)) throw new Error("AI_INVALID_PLUGIN");
    const value = this.deps.read(keyOf(id));
    return value ? JSON.parse(value) : null;
  }
  configure(id: string, config: PluginAIConfig) {
    const info = this.info(id);
    if (!info) throw new Error("AI_UNKNOWN_PLUGIN");
    if (
      typeof config.enabled !== "boolean" ||
      ![config.dailyRequests, config.dailyTokens, config.concurrency].every(
        n => Number.isSafeInteger(n) && n > 0
      ) ||
      config.concurrency > 16
    )
      throw new Error("请输入正整数额度，并发数最多 16");
    const assignments: PluginAIConfig["assignments"] = {};
    for (const feature of info.features) {
      const value = config.assignments?.[feature.id];
      if (value && (typeof value.providerId !== "string" || typeof value.modelId !== "string"))
        throw new Error("模型分配无效");
      assignments[feature.id] = value
        ? { providerId: value.providerId, modelId: value.modelId }
        : null;
    }
    this.deps.write(
      keyOf(id),
      JSON.stringify({
        ...info,
        config: {
          enabled: config.enabled,
          dailyRequests: config.dailyRequests,
          dailyTokens: config.dailyTokens,
          concurrency: config.concurrency,
          assignments,
        },
      })
    );
    if (!config.enabled) {
      for (const entry of this.active.values())
        if (entry.pluginId === id && !this.sessions.get(entry.session)?.hostFeature)
          entry.controller.abort();
    }
  }
  revoke(id: string) {
    const info = this.info(id);
    if (info) this.configure(id, { ...info.config, enabled: false });
    this.cancelPlugin(id);
  }
  cancelPlugin(id: string) {
    for (const entry of this.active.values()) if (entry.pluginId === id) entry.controller.abort();
  }
  cancel(requestId: string) {
    this.active.get(requestId)?.controller.abort();
  }
  cancelOwn(owner: number, session: string, requestId: string) {
    if (
      this.sessions.get(session)?.owner === owner &&
      this.active.get(requestId)?.session === session
    )
      this.cancel(requestId);
  }
  running(): PluginAIRunning[] {
    return [...this.active.values()].map(
      ({ requestId, pluginId, pluginName, featureName, startedAt, hostFeature }) => ({
        requestId,
        pluginId,
        pluginName,
        featureName,
        startedAt,
        hostFeature,
      })
    );
  }
  private binding(owner: number, session: string, feature: string) {
    const binding = this.sessions.get(session);
    if (!binding || binding.owner !== owner) throw new Error("AI_DISABLED：插件已停用");
    const declaration = binding.hostFeature
      ? feature === binding.hostFeature
        ? { id: feature, name: PLUGIN_AI_CAPABILITIES[binding.hostFeature].name }
        : undefined
      : binding.plugin.features.find(item => item.id === feature);
    if (!declaration) throw new Error("AI_UNDECLARED_FEATURE：插件未声明此 AI 功能");
    const info = this.info(binding.plugin.id);
    if (!info) throw new Error("AI_UNKNOWN_PLUGIN");
    return { info, declaration, hostFeature: binding.hostFeature };
  }
  private async resolve(owner: number, session: string, feature: string) {
    const binding = this.binding(owner, session, feature);
    const assignment = binding.hostFeature
      ? ((await this.deps.hostModel?.(binding.hostFeature)) ?? null)
      : binding.info.config.assignments[feature];
    return { ...binding, assignment };
  }
  async status(owner: number, session: string, feature: string) {
    const { info, assignment, hostFeature } = await this.resolve(owner, session, feature);
    let configured = false;
    if (assignment) {
      try {
        await this.deps.capacity(assignment.providerId, assignment.modelId);
        configured = true;
      } catch {
        /* 已删除的模型视为未配置。 */
      }
    }
    return { configured, enabled: hostFeature ? true : info.config.enabled };
  }

  async run(
    owner: number,
    session: string,
    requestId: string,
    input: PluginAIWireRequest,
    delta: (text: string) => void
  ): Promise<PluginAIResult> {
    if (typeof requestId !== "string" || this.active.has(requestId))
      throw new Error("AI_INVALID_REQUEST");
    const { info, declaration, hostFeature } = this.binding(owner, session, input?.feature);
    if (this.running().filter(item => item.pluginId === info.id).length >= info.config.concurrency)
      throw new Error("AI_CONCURRENCY_LIMIT：并发额度已满");
    const controller = new AbortController();
    this.active.set(requestId, {
      requestId,
      session,
      controller,
      pluginId: info.id,
      pluginName: info.name,
      featureName: declaration.name,
      hostFeature,
      startedAt: Date.now(),
    });
    try {
      return await this.runRequest(owner, session, requestId, input, delta, controller);
    } finally {
      this.active.delete(requestId);
    }
  }

  private async runRequest(
    owner: number,
    session: string,
    requestId: string,
    input: PluginAIWireRequest,
    delta: (text: string) => void,
    controller: AbortController
  ): Promise<PluginAIResult> {
    if (
      !input ||
      !Array.isArray(input.messages) ||
      input.messages.length === 0 ||
      input.messages.length > 200 ||
      input.messages.some(
        m =>
          !m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string"
      ) ||
      input.messages.reduce((n, m) => n + m.content.length, 0) > 500_000
    )
      throw new Error("AI_INVALID_REQUEST：消息无效或过长");
    validateImages(input.messages);
    const resolved = await this.resolve(owner, session, input.feature);
    let { info, assignment, declaration } = resolved;
    const { hostFeature } = resolved;
    if (controller.signal.aborted) throw new Error("AI_ABORTED：请求已取消");
    if (!hostFeature && !info.config.enabled) throw new Error("AI_DISABLED：用户未授权 AI 调用");
    if (!assignment)
      throw new Error(
        hostFeature
          ? `AI_NOT_CONFIGURED：请先在应用设置中分配${declaration.name}模型`
          : "AI_NOT_CONFIGURED：请先分配模型"
      );
    const reference = assignment;
    const capacity = await this.deps.capacity(reference.providerId, reference.modelId);
    if (controller.signal.aborted) throw new Error("AI_ABORTED：请求已取消");
    ({ info, assignment, declaration } = await this.resolve(owner, session, input.feature));
    if (controller.signal.aborted) throw new Error("AI_ABORTED：请求已取消");
    if (!hostFeature && !info.config.enabled) throw new Error("AI_DISABLED：用户已关闭授权");
    if (
      assignment?.providerId !== reference.providerId ||
      assignment?.modelId !== reference.modelId
    )
      throw new Error("AI_CONFIG_CHANGED：模型分配已改变，请重试");
    const maxOutput = input.maxOutputTokens ?? Math.min(4096, capacity.maxTokens);
    if (!Number.isSafeInteger(maxOutput) || maxOutput <= 0 || maxOutput > capacity.maxTokens)
      throw new Error("AI_INVALID_REQUEST：输出上限无效");
    if (this.running().filter(item => item.pluginId === info.id).length > info.config.concurrency)
      throw new Error("AI_CONCURRENCY_LIMIT：并发额度已满");
    // 以模型容量保守预占，未知用量保留预占；不将粗略字符估算当作硬额度。
    const reserve = capacity.contextWindow + maxOutput;
    const ledgerKey = `plugin-ai:quota:${info.id}:${localDay()}`;
    const saved = this.deps.read(ledgerKey);
    const ledger: Ledger = saved ? JSON.parse(saved) : { day: localDay(), requests: 0, tokens: 0 };
    if (
      ledger.requests >= info.config.dailyRequests ||
      ledger.tokens + reserve > info.config.dailyTokens
    )
      throw new Error("AI_QUOTA_EXCEEDED：今日额度不足（包含运行中请求预占）");
    ledger.requests++;
    ledger.tokens += reserve;
    this.deps.write(ledgerKey, JSON.stringify(ledger));
    const startedAt = this.active.get(requestId)?.startedAt ?? Date.now();
    let usage: UsageRecordInput | undefined;
    let finish: ((input: UsageRecordInput) => void) | undefined;
    const initial: UsageRecordInput = {
      ts: startedAt,
      library: null,
      kind: "llm",
      providerId: reference.providerId,
      model: reference.modelId,
      feature: `plugin:${info.id}:${input.feature}`,
      pluginId: info.id,
      pluginName: info.name,
      pluginFeatureName: declaration.name,
      scope: "plugin",
      sessionId: null,
      entityId: null,
      status: "running",
      errorMessage: null,
      latencyMs: null,
      ttftMs: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      usageKnown: false,
      units: null,
      cost: 0,
      costSource: "none",
    };
    try {
      finish = this.deps.audit(initial);
      const outcome = await this.deps.execute(
        {
          requestId,
          ...reference,
          system: input.messages
            .filter(m => m.role === "system")
            .map(m => m.content)
            .join("\n\n"),
          messages: input.messages
            .filter(m => m.role !== "system")
            .map(m => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              ...(m.role === "user" && m.images ? { images: [...m.images] } : {}),
            })),
          maxOutputTokens: maxOutput,
          source: {
            feature: initial.feature,
            pluginId: info.id,
            pluginName: info.name,
            pluginFeatureName: declaration.name,
          },
        },
        controller.signal,
        text => {
          if (!controller.signal.aborted) delta(text);
        },
        record => {
          usage = record;
        }
      );
      if (controller.signal.aborted) throw new Error("AI_ABORTED：请求已取消");
      if (!outcome.ok || outcome.error)
        throw new Error("AI_REQUEST_FAILED：模型请求失败，请检查服务商配置");
      return {
        text: outcome.text,
        usage: usage?.usageKnown
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            }
          : null,
      };
    } finally {
      try {
        finish?.({
          ...(usage ?? initial),
          pluginId: info.id,
          pluginName: info.name,
          pluginFeatureName: declaration.name,
          status: controller.signal.aborted ? "aborted" : (usage?.status ?? "error"),
          errorMessage: controller.signal.aborted
            ? "用户或插件生命周期取消"
            : usage?.status === "ok"
              ? null
              : "模型调用未成功完成",
        });
        if (usage?.usageKnown) {
          const latest: Ledger = JSON.parse(this.deps.read(ledgerKey) ?? JSON.stringify(ledger));
          latest.tokens = Math.max(0, latest.tokens - reserve + usage.totalTokens);
          this.deps.write(ledgerKey, JSON.stringify(latest));
        }
      } finally {
        this.active.delete(requestId);
      }
    }
  }
}
