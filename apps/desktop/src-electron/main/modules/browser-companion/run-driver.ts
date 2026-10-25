/**
 * 伴读对话的一轮运行：建 pi 宿主会话、prompt、释放。工具有两类：
 * - 页面工具（扩展声明的 browserTools）：经发起这轮的那条连接反向请求扩展执行；
 * - 应用工具：授予了 tools scope 时给桌面对话的同一份工具清单（ToolRegistry、Skill、MCP、插件工具），
 *   转给主窗口渲染端的工具桥执行；审批跟随桌面的工具权限模式，等待项经交互快照推给扩展。
 * pi 自带的文件与命令工具（read/edit/write/bash…）一律不启用：对话上下文来自不可信网页。
 */
import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import {
  COMPANION_METHODS,
  type CompanionRunStartParams,
  type PageToolResult,
} from "@tau/shared/browser-companion";
import type { PiHostToolSpec, PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { LLMProviderSetting } from "@/types/pi-llm";
import userSettingModule from "../user-setting";
import PiSessionHostModule, { type PiSessionClient } from "../pi-session-host";
import { getMainWindows } from "../../windows";
import {
  resolveChatModel,
  type BrowserRunDriver,
  type BrowserRunHandle,
} from "../browser-run-core";
import type { CompanionPeer } from "./peer";

const PAGE_TOOL_TIMEOUT_MS = 2 * 60 * 1000;
// 首次要工具时渲染端还要加载 Skills 清单
const DESKTOP_TOOL_CATALOG_TIMEOUT_MS = 8000;

export const SYSTEM_PROMPT = [
  "你是 Tau 的网页伴读助手，帮助用户理解当前网页。",
  "回答依据网页正文时，在相应句子后用 [n] 标出所依据的段落编号（正文里以 [n] 开头的段落），不要编造编号。",
  "用户没有要求时不要复述整页内容；回答简洁，使用与用户相同的语言。",
].join("\n");

/** 主进程客户端：宿主会话的事件在进程内直接回调，不经 IPC */
class InProcessClient implements PiSessionClient {
  private readonly closeListeners = new Set<() => void>();
  private destroyed = false;

  constructor(
    private readonly handlers: {
      onEvent(event: unknown): void;
      onInteractions(snapshot: PiSessionInteractionSnapshot): void;
      onToolCall(payload: ToolCallPayload): void;
      onToolCancel(payload: { sessionId: string; toolCallId: string; executionId?: string }): void;
    }
  ) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, payload: unknown): void {
    if (this.destroyed) return;
    if (channel === "pi-session-event")
      this.handlers.onEvent((payload as { event: unknown }).event);
    else if (channel === "pi-session-interactions")
      this.handlers.onInteractions(payload as PiSessionInteractionSnapshot);
    else if (channel === "pi-tool-call") this.handlers.onToolCall(payload as ToolCallPayload);
    else if (channel === "pi-tool-cancel") this.handlers.onToolCancel(payload as never);
  }

  once(_event: string, listener: () => void) {
    this.closeListeners.add(listener);
    return this;
  }

  removeListener(_event: string, listener: () => void) {
    this.closeListeners.delete(listener);
    return this;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeListeners.forEach(listener => listener());
  }
}

interface ToolCallPayload {
  executionId?: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

const promptTextOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item: { type?: string; text?: string }) =>
      item.type === "text" ? (item.text ?? "") : ""
    )
    .filter(Boolean)
    .join("\n");
};

/** 扩展指定的模型必须是设置里已配置的；否则按功能默认 */
export function resolveRunModel(
  setting: Record<string, unknown>,
  requested: CompanionRunStartParams["model"],
  feature: string
): { providerId: string; modelId: string } {
  if (requested) {
    const providers = Array.isArray(setting.llmProviders)
      ? (setting.llmProviders as LLMProviderSetting[])
      : [];
    const provider = providers.find(item => item.id === requested.providerId);
    if (provider?.models?.some(model => model.id === requested.modelId)) {
      return { providerId: provider.id, modelId: requested.modelId };
    }
  }
  return resolveChatModel(setting, feature);
}

const sortByName = (tools: PiHostToolSpec[]) =>
  tools.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/**
 * 每轮的 driver 由连接上下文决定：页面工具发回这条连接，桌面工具按这条连接的 scope 放行。
 * 连接与 scope 在 start 时取（scope 可能被设置页改过）。
 */
export function createCompanionRunDriver(
  contextOf: (runId: string) => { peer: CompanionPeer; allowTools: boolean } | null
): BrowserRunDriver {
  return {
    start: async (raw, hooks) => {
      const params = raw as CompanionRunStartParams;
      const context = contextOf(params.runId);
      if (!context) throw new Error("浏览器扩展已断开");
      const session = params.session;
      const setting = (await userSettingModule.getSettingSnapshot()) as Record<string, unknown>;
      const modelRef = resolveRunModel(setting, params.model, params.feature ?? "chat");
      const hostId = randomUUID();
      const pageToolNames = new Set((params.browserTools ?? []).map(tool => tool.function.name));
      const desktop = context.allowTools
        ? await requestDesktopTools(hostId)
        : { tools: [], window: null, skillsPrompt: "" };
      const releaseDesktop = () => {
        if (desktop.window && !desktop.window.isDestroyed())
          desktop.window.send("browser-bridge:tool-release", { sessionId: hostId });
      };

      let settledResolve!: () => void;
      const settled = new Promise<void>(resolve => {
        settledResolve = resolve;
      });
      const client = new InProcessClient({
        onEvent: event => {
          hooks.onEvent(event as never);
          if ((event as { type?: string }).type === "agent_settled") settledResolve();
        },
        onInteractions: snapshot => hooks.onInteractions(snapshot),
        onToolCall: payload =>
          void executeTool(payload, pageToolNames, session.pageUrl, context.peer, desktop.window),
        onToolCancel: payload => {
          if (desktop.window && !desktop.window.isDestroyed())
            desktop.window.send("pi-tool-cancel", payload);
        },
      });
      const pageSpecs: PiHostToolSpec[] = (params.browserTools ?? []).map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        risk: "read",
      }));
      const customTools = sortByName([
        ...desktop.tools.filter(tool => !pageToolNames.has(tool.name)),
        ...pageSpecs,
      ]);
      const systemPrompt = [
        SYSTEM_PROMPT,
        params.pageContext
          ? `当前网页：\n- URL: ${params.pageContext.url}\n- 标题: ${params.pageContext.title}`
          : "",
        params.systemPrompt ?? "",
        desktop.skillsPrompt,
      ]
        .filter(Boolean)
        .join("\n\n");
      const created = await PiSessionHostModule.create(client, {
        sessionId: hostId,
        scope: `browser:${session.id}`,
        cwd: "",
        modelRef,
        systemPrompt,
        interactive: true,
        hostToolsOnly: true,
        piSessionId: session.id,
        browserPageUrl: session.pageUrl,
        ...(customTools.length > 0 ? { customTools } : {}),
        ...(params.thinkingLevel ? { thinkingLevel: params.thinkingLevel as never } : {}),
      });
      if (!created.ok) {
        releaseDesktop();
        throw new Error(created.error ?? "会话创建失败");
      }

      const message = params.messages.at(-1);
      if (!message || message.role !== "user") {
        client.destroy();
        PiSessionHostModule.dispose(hostId);
        releaseDesktop();
        throw new Error("缺少本轮的用户消息");
      }
      const baseMessages = PiSessionHostModule.transcriptOf(hostId);
      let aborted = false;
      const done = (async () => {
        const prompted = PiSessionHostModule.prompt(
          hostId,
          promptTextOf(message.content),
          [],
          Array.isArray(message.content) ? { content: message.content as never } : undefined
        );
        // prompt 在空闲会话上要等整轮跑完才返回；拒绝则立刻返回失败
        const outcome = await Promise.race([prompted, settled.then(() => ({ ok: true }))]);
        if (!outcome.ok)
          return { ok: false, aborted, error: (outcome as { error?: string }).error };
        await settled;
        return { ok: true, aborted };
      })().finally(() => {
        releaseDesktop();
        client.destroy();
        PiSessionHostModule.dispose(hostId);
      });

      const handle: BrowserRunHandle = {
        baseMessages,
        done,
        abort: async () => {
          aborted = true;
          await PiSessionHostModule.abort(hostId);
        },
        approve: (requestId, choice) =>
          PiSessionHostModule.interactionsOf(hostId)?.permissions.decide(requestId, choice) ??
          false,
        answer: (requestId, answers) => {
          const interactions = PiSessionHostModule.interactionsOf(hostId);
          return interactions
            ? interactions.questions.answer(requestId, answers)
            : "这轮回答已结束";
        },
      };
      return handle;
    },
  };
}

/** 向主窗口要桌面对话的工具清单（ToolRegistry 只在渲染端）；没有主窗口或超时就不给 */
function requestDesktopTools(
  sessionId: string
): Promise<{ tools: PiHostToolSpec[]; window: Electron.WebContents | null; skillsPrompt: string }> {
  const [win] = getMainWindows();
  if (!win || win.webContents.isDestroyed())
    return Promise.resolve({ tools: [], window: null, skillsPrompt: "" });
  const contents = win.webContents;
  const requestId = randomUUID();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      ipcMain.removeListener("browser-bridge:tool-catalog-result", onResult);
      if (!contents.isDestroyed()) contents.send("browser-bridge:tool-release", { sessionId });
      resolve({ tools: [], window: null, skillsPrompt: "" });
    }, DESKTOP_TOOL_CATALOG_TIMEOUT_MS);
    const onResult = (
      _event: unknown,
      payload: { requestId: string; tools: PiHostToolSpec[]; skillsPrompt?: string }
    ) => {
      if (payload?.requestId !== requestId) return;
      clearTimeout(timer);
      ipcMain.removeListener("browser-bridge:tool-catalog-result", onResult);
      resolve({
        tools: payload.tools ?? [],
        window: contents,
        skillsPrompt: typeof payload.skillsPrompt === "string" ? payload.skillsPrompt : "",
      });
    };
    ipcMain.on("browser-bridge:tool-catalog-result", onResult);
    contents.send("browser-bridge:tool-catalog", { requestId, sessionId });
  });
}

async function executeTool(
  payload: ToolCallPayload,
  pageToolNames: Set<string>,
  pageUrl: string,
  peer: CompanionPeer,
  desktopWindow: Electron.WebContents | null
): Promise<void> {
  const bridge = PiSessionHostModule.bridgeOf(payload.sessionId);
  if (!bridge) return;
  if (pageToolNames.has(payload.toolName)) {
    try {
      const result = (await peer.request(
        COMPANION_METHODS.pageTool,
        { pageUrl, name: payload.toolName, args: payload.args ?? {} },
        PAGE_TOOL_TIMEOUT_MS
      )) as PageToolResult | null;
      bridge.handleResult(
        payload.toolCallId,
        { content: result?.content ?? "" },
        payload.executionId
      );
    } catch (error) {
      bridge.handleError(
        payload.toolCallId,
        error instanceof Error ? error.message : String(error),
        payload.executionId
      );
    }
    return;
  }
  if (!desktopWindow || desktopWindow.isDestroyed()) {
    bridge.handleError(
      payload.toolCallId,
      "Tau 窗口已关闭，这个工具暂时不能用",
      payload.executionId
    );
    return;
  }
  const gone = () =>
    bridge.handleError(payload.toolCallId, "工具执行窗口已关闭或重载", payload.executionId);
  desktopWindow.once("destroyed", gone);
  desktopWindow.once("render-process-gone", gone);
  desktopWindow.once("did-navigate", gone);
  bridge.onCallFinished(payload.toolCallId, payload.executionId, () => {
    desktopWindow.removeListener("destroyed", gone);
    desktopWindow.removeListener("render-process-gone", gone);
    desktopWindow.removeListener("did-navigate", gone);
  });
  try {
    desktopWindow.send("pi-tool-call", payload);
  } catch {
    gone();
  }
}
