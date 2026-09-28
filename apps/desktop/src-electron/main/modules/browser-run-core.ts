/**
 * 浏览器扩展的一次运行（M5，electron-free 纯编排，可单测）：v2 协议的 runId 生命周期、事件序号、
 * 停止、同一扩展对话同一时刻只跑一轮。真正的会话驱动（建宿主、prompt、释放）由注入的 driver 做，
 * 主进程里是 pi-session-host，测试里是假实现。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AiRunEvent, AiRunEventNotification, AiRunStartParams } from "@tau/shared";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { LLMProviderSetting } from "@/types/pi-llm";
import { createAiRunEventTranslator } from "@/services/aiRunEvents";

export interface BrowserRunHandle {
  /** 一轮跑完（settled 或失败）才 resolve */
  done: Promise<{ ok: boolean; aborted: boolean; error?: string }>;
  abort(): Promise<void>;
  approve(requestId: string, choice: "allow" | "allow-session" | "deny"): boolean;
  answer(requestId: string, answers: unknown): string | undefined;
}

export interface BrowserRunDriver {
  /** 起一轮：订阅 pi 事件与交互快照，返回句柄。driver 负责会话的创建与释放 */
  start(
    params: AiRunStartParams,
    hooks: {
      onEvent(event: AgentSessionEvent): void;
      onInteractions(snapshot: PiSessionInteractionSnapshot): void;
    }
  ): Promise<BrowserRunHandle>;
}

interface ActiveRun {
  runId: string;
  sessionKey: string | undefined;
  handle: BrowserRunHandle | null;
  abortRequested: boolean;
}

/** 设置快照 → 聊天用的服务商与模型（与渲染端 aiServer 的 getLLMConfig 同一口径） */
export function resolveChatModel(
  setting: Record<string, unknown>,
  feature: string
): { providerId: string; modelId: string } {
  const usage = (
    setting.llmUsageSettings as
      Record<string, { providerId?: string; modelId?: string }> | undefined
  )?.[feature];
  const providers = Array.isArray(setting.llmProviders)
    ? (setting.llmProviders as LLMProviderSetting[])
    : [];
  const provider = providers.find(item => item.id === usage?.providerId);
  const model = provider?.models?.find(item => item.id === usage?.modelId);
  if (!provider || !model) throw new Error("未配置 LLM，请在设置中配置聊天模型");
  return { providerId: provider.id, modelId: model.id };
}

/** 扩展对话的唯一键（同一页面同一对话）；一次性调用没有 */
export const browserRunKeyOf = (params: AiRunStartParams): string | undefined =>
  params.session ? `${params.session.pageUrl}\u0000${params.session.id}` : undefined;

export class BrowserRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();

  constructor(
    private readonly driver: BrowserRunDriver,
    private readonly publish: (notification: AiRunEventNotification) => void
  ) {}

  /** 某个扩展对话此刻在跑的 runId（侧栏重开后据此接上或提示） */
  public runningFor(session: { id: string; pageUrl: string }): string | undefined {
    const key = browserRunKeyOf({ runId: "", messages: [], session });
    for (const run of this.runs.values()) if (run.sessionKey === key) return run.runId;
    return undefined;
  }

  /**
   * 起一轮，立即返回（事件经 publish 推送）。同一扩展对话已经在跑时拒绝：两个标签页同时对同一对话
   * 发送，第一轮还没落盘时宿主的文件冲突检查拦不住（文件还不存在），这里按对话兜住。
   */
  public start(params: AiRunStartParams): { ok: true } | { ok: false; error: string } {
    if (this.runs.has(params.runId)) return { ok: false, error: "运行已存在" };
    const sessionKey = browserRunKeyOf(params);
    if (sessionKey && [...this.runs.values()].some(run => run.sessionKey === sessionKey)) {
      return { ok: false, error: "这个对话正在另一处回答，请等它结束或先停止" };
    }
    const run: ActiveRun = { runId: params.runId, sessionKey, handle: null, abortRequested: false };
    this.runs.set(params.runId, run);
    void this.execute(run, params);
    return { ok: true };
  }

  public async abort(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.abortRequested = true;
    await run.handle?.abort();
  }

  public approve(runId: string, requestId: string, choice: "allow" | "allow-session" | "deny") {
    return this.runs.get(runId)?.handle?.approve(requestId, choice) ?? false;
  }

  public answer(runId: string, requestId: string, answers: unknown): string | undefined {
    const handle = this.runs.get(runId)?.handle;
    if (!handle) return "这轮回答已结束";
    return handle.answer(requestId, answers);
  }

  private async execute(run: ActiveRun, params: AiRunStartParams): Promise<void> {
    let seq = 0;
    const emit = (event: AiRunEvent) => this.publish({ runId: run.runId, seq: seq++, event });
    const translator = createAiRunEventTranslator(emit);
    try {
      run.handle = await this.driver.start(params, {
        onEvent: event => translator.handle(event),
        onInteractions: snapshot => translator.applyInteractions(snapshot),
      });
      // 停止在会话建好之前就按了：建好后立刻停
      if (run.abortRequested) await run.handle.abort();
      const outcome = await run.handle.done;
      const aborted = outcome.aborted || run.abortRequested;
      const error = aborted ? undefined : (outcome.error ?? translator.lastError());
      emit({
        type: "settled",
        ok: !aborted && !error,
        aborted,
        ...(error ? { error } : {}),
        lastText: translator.lastText(),
      });
    } catch (error) {
      emit({
        type: "settled",
        ok: false,
        aborted: run.abortRequested,
        error: error instanceof Error ? error.message : String(error),
        lastText: translator.lastText(),
      });
    } finally {
      this.runs.delete(run.runId);
    }
  }
}
