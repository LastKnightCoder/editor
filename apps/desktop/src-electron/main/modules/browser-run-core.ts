/**
 * 浏览器扩展的一次运行（M5，electron-free 纯编排，可单测）：v2 协议的 runId 生命周期、事件序号、
 * 停止、同一扩展对话同一时刻只跑一轮。真正的会话驱动（建宿主、prompt、释放）由注入的 driver 做，
 * 主进程里是 pi-session-host，测试里是假实现。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  applyChatStreamEvent,
  createAssistantMessage,
  type AiRunEvent,
  type AiRunEventNotification,
  type AiRunSnapshot,
  type AiRunStartParams,
  type ChatSessionMessage,
  type ResponseMessage,
} from "@tau/shared";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { LLMProviderSetting } from "@/types/pi-llm";
import { createAiRunEventTranslator } from "@/services/aiRunEvents";

export interface BrowserRunHandle {
  /** 这一轮开始前的对话投影（会话建好、prompt 之前读的；侧栏重开接回时作底） */
  baseMessages: ChatSessionMessage[];
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
  /** 接回用的快照：与接收端同一套归约，重开的侧栏拿到它就等于从头收过所有事件 */
  request: AiRunSnapshot["request"];
  response: ResponseMessage;
  interactions: AiRunSnapshot["interactions"];
  retry: AiRunSnapshot["retry"];
  lastSeq: number;
}

/** 快照也要归约的事件：text/reasoning/tool-calls/turn-finish 组装回答，其余更新状态 */
const reduceIntoRun = (run: ActiveRun, event: AiRunEvent): void => {
  switch (event.type) {
    case "text":
    case "reasoning":
    case "tool-calls":
    case "turn-finish":
      applyChatStreamEvent(run.response, event);
      return;
    case "retry":
      run.retry = event.status;
      return;
    case "interactions":
      run.interactions = { approvals: event.approvals, questions: event.questions };
      return;
    default:
      return;
  }
};

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

  /**
   * 某个扩展对话此刻在跑的那一轮的快照（侧栏重开后接回）。快照与 lastSeq 同步取，之后的事件
   * 按 seq 续接不丢不重；回答对象是深拷贝，接收端可以原地继续归约。
   * `readFileBase`：会话还在建（没有句柄）时读会话文件的投影作底——还没 prompt，本轮什么都没写，
   * 文件投影就是本轮之前的对话。必须同步读：与取快照之间不能让出事件循环。
   */
  public snapshotFor(
    session: { id: string; pageUrl: string },
    readFileBase: () => ChatSessionMessage[]
  ): AiRunSnapshot | undefined {
    const key = browserRunKeyOf({ runId: "", messages: [], session });
    const run = [...this.runs.values()].find(item => item.sessionKey === key);
    if (!run) return undefined;
    return {
      runId: run.runId,
      lastSeq: run.lastSeq,
      baseMessages: run.handle?.baseMessages ?? readFileBase(),
      request: run.request,
      response: structuredClone(run.response),
      interactions: run.interactions,
      retry: run.retry,
    };
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
    const run: ActiveRun = {
      runId: params.runId,
      sessionKey,
      handle: null,
      abortRequested: false,
      request: params.messages.at(-1) ?? { role: "user", content: "" },
      response: createAssistantMessage(),
      interactions: { approvals: [], questions: [] },
      retry: null,
      lastSeq: -1,
    };
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
    const emit = (event: AiRunEvent) => {
      reduceIntoRun(run, event);
      run.lastSeq += 1;
      this.publish({ runId: run.runId, seq: run.lastSeq, event });
    };
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
