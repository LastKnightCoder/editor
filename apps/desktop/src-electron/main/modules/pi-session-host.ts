/**
 * PiSessionHost 模块（会话 harness 宿主）：
 * 渲染进程的会话生命周期经 IPC 驱动（create/prompt/steer/abort/dispose），
 * AgentSessionEvent 经 pi-session-event 通道按 sessionId 路由回创建窗口。
 * 桌面工具经 pi-tool-call 桥回渲染端 ToolRegistry 执行（结果经 pi-session:tool-* 回传）；
 * 历史（桌面 chat-core 消息）在 create 时转换灌入（desktopMessagesToPi）。
 * 模型注册中心与设置订阅复用 pi-ai 模块的同一数据源（v2 llmProviders）。
 */
import { ipcMain } from "electron";
import userSettingModule from "./user-setting";
import PathUtil from "../utils/PathUtil";
import {
  assembleHostSession,
  createHostModelRuntime,
  createHostResourceLoader,
  detectBashShellPath,
} from "./pi-session-host-core";
import { desktopMessagesToPi, PiToolCallBridge } from "./pi-session-bridge";
import type { PiHostToolSpec, PiToolApprovalChoice } from "@/types/pi-session";
import { PiSessionInteractions } from "./pi-session-interactions";
import { normalizePermissionMode } from "@/services/tool-permission/mode";
import { resolveV2Providers } from "./pi-ai-runtime-core";
import type { LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { RequestMessage } from "@/types";
import type { AgentSession, ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

interface HostedSession {
  session: AgentSession;
  unsubscribe: () => void;
  sender: Electron.WebContents;
  bridge: PiToolCallBridge;
  interactions: PiSessionInteractions;
  detachSender: () => void;
  /** 动态 systemPrompt（before_agent_start 每轮替换，渲染端经 set-system-prompt 更新） */
  systemPromptRef: { current: string };
  scope: string;
  modelRef: { providerId: string; modelId: string };
  thinkingLevel?: PiThinkingLevel;
}

export interface PiSessionCreateRequest {
  sessionId: string;
  scope: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  /** 持久会话目录相对库名（默认当前活跃库）；传 null 强制 inMemory（测试/单轮） */
  persist?: boolean;
  /** 手动指定 bash.exe（pi-dev 面板联调用；产品化的设置项在 M3 工具管理落地） */
  shellPath?: string;
  /** 渲染端 ToolRegistry 工具清单（桥接为 pi customTools） */
  customTools?: PiHostToolSpec[];
  /** 推理档位（缺省由 pi 按模型能力取默认） */
  thinkingLevel?: PiThinkingLevel;
  /** 历史灌入（桌面 chat-core 消息；system/tool 消息由转换器忽略） */
  initialMessages?: RequestMessage[];
  /** agent 层自动重试上限（默认 5，对齐旧链路 DEFAULT_CHAT_MAX_RETRIES） */
  retryMaxRetries?: number;
  /** 有审批条与提问卡的入口：注册 ask-question，需确认的工具等待用户 */
  interactive?: boolean;
}

class PiSessionHostModule {
  private static readonly sessions = new Map<string, HostedSession>();
  private static latestProviders: LLMProviderSetting[] = [];
  private static shellPath: string | undefined;
  private static permissionMode = normalizePermissionMode(undefined);
  /** 取证开关：PI_DUMP_REQUESTS=1 时出站请求写 ~/.editor/pi-request-dumps/（image_url 截断防膨胀） */
  private static readonly requestDumpDir: string | undefined = process.env.PI_DUMP_REQUESTS
    ? join(PathUtil.getAppDir(), "pi-request-dumps")
    : undefined;

  public static init() {
    PiSessionHostModule.shellPath = detectBashShellPath();
    if (PiSessionHostModule.requestDumpDir) {
      mkdirSync(PiSessionHostModule.requestDumpDir, { recursive: true });
      console.log(`[PiSessionHost] 请求 dump 已开启：${PiSessionHostModule.requestDumpDir}`);
    }

    userSettingModule.onSettingChanged(({ newSetting }) => {
      PiSessionHostModule.latestProviders = resolveV2Providers(newSetting);
      PiSessionHostModule.permissionMode = normalizePermissionMode(
        newSetting.agentPermission?.mode
      );
      for (const hosted of PiSessionHostModule.sessions.values())
        hosted.interactions.permissions.modeChanged();
    });
    void userSettingModule.getSettingSnapshot().then(setting => {
      PiSessionHostModule.latestProviders = resolveV2Providers(setting);
      PiSessionHostModule.permissionMode = normalizePermissionMode(setting.agentPermission?.mode);
    });

    ipcMain.handle("pi-session:create", async (event, request: PiSessionCreateRequest) => {
      return PiSessionHostModule.createSession(event.sender, request);
    });
    ipcMain.handle("pi-session:interactions", event => ({
      ok: true,
      snapshots: [...PiSessionHostModule.sessions.values()]
        .filter(hosted => hosted.sender === event.sender)
        .map(hosted => hosted.interactions.snapshot()),
    }));
    ipcMain.handle(
      "pi-session:approve-tool",
      (
        event,
        {
          sessionId,
          requestId,
          choice,
        }: {
          sessionId: string;
          requestId: string;
          choice: PiToolApprovalChoice;
        }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted || hosted.sender !== event.sender) return { ok: false, error: "会话不存在" };
        return hosted.interactions.permissions.decide(requestId, choice)
          ? { ok: true }
          : { ok: false, error: "审批已结束，请刷新会话状态" };
      }
    );
    ipcMain.handle(
      "pi-session:answer-question",
      (
        event,
        {
          sessionId,
          requestId,
          answers,
        }: { sessionId: string; requestId: string; answers: unknown }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted || hosted.sender !== event.sender) return { ok: false, error: "会话不存在" };
        const error = hosted.interactions.questions.answer(requestId, answers);
        return error ? { ok: false, error } : { ok: true };
      }
    );
    ipcMain.handle(
      "pi-session:prompt",
      async (
        _event,
        {
          sessionId,
          text,
          images,
        }: { sessionId: string; text: string; images?: Array<{ path?: string; dataUrl?: string }> }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        try {
          // 渲染端只传定位信息（path/dataUrl），主进程读文件转 pi 的 base64 ImageContent
          const piImages = (
            await Promise.all((images ?? []).map(image => readPromptImage(image)))
          ).filter(Boolean);
          await hosted.session.prompt(text, {
            ...(piImages.length > 0 ? { images: piImages as never } : {}),
          });
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    );
    ipcMain.handle(
      "pi-session:steer",
      async (_event, { sessionId, text }: { sessionId: string; text: string }) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        return { ok: true, disposition: await hosted.session.steer(text) };
      }
    );
    ipcMain.handle("pi-session:abort", async (event, { sessionId }: { sessionId: string }) => {
      const hosted = PiSessionHostModule.sessions.get(sessionId);
      if (!hosted || hosted.sender !== event.sender) return { ok: false, error: "会话不存在" };
      await hosted.session.abort();
      return { ok: true };
    });
    ipcMain.handle("pi-session:dispose", async (event, { sessionId }: { sessionId: string }) => {
      if (PiSessionHostModule.sessions.get(sessionId)?.sender !== event.sender)
        return { ok: false, error: "会话不存在" };
      PiSessionHostModule.disposeSession(sessionId);
      return { ok: true };
    });
    ipcMain.handle("pi-session:find-by-scope", async (event, { scope }: { scope: string }) => {
      // 渲染层重载后本地会话表丢失：按 scope 找主进程仍持有的会话（取最近创建的一个）
      let found: string | undefined;
      for (const [sessionId, hosted] of PiSessionHostModule.sessions) {
        if (hosted.scope === scope && hosted.sender === event.sender) found = sessionId;
      }
      const hosted = found ? PiSessionHostModule.sessions.get(found) : undefined;
      return {
        ok: true,
        sessionId: found,
        modelRef: hosted?.modelRef,
        thinkingLevel: hosted?.thinkingLevel,
      };
    });
    ipcMain.handle(
      "pi-session:set-system-prompt",
      async (_event, { sessionId, systemPrompt }: { sessionId: string; systemPrompt: string }) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        hosted.systemPromptRef.current = systemPrompt;
        return { ok: true };
      }
    );
    ipcMain.handle(
      "pi-session:tool-result",
      async (
        _event,
        {
          sessionId,
          toolCallId,
          result,
        }: { sessionId: string; toolCallId: string; result: unknown }
      ) => {
        PiSessionHostModule.sessions
          .get(sessionId)
          ?.bridge.handleResult(toolCallId, result as never);
        return { ok: true };
      }
    );
    ipcMain.handle(
      "pi-session:tool-error",
      async (
        _event,
        { sessionId, toolCallId, error }: { sessionId: string; toolCallId: string; error: string }
      ) => {
        PiSessionHostModule.sessions.get(sessionId)?.bridge.handleError(toolCallId, error);
        return { ok: true };
      }
    );
    ipcMain.handle(
      "pi-session:tool-update",
      async (
        _event,
        {
          sessionId,
          toolCallId,
          partial,
        }: { sessionId: string; toolCallId: string; partial: Record<string, unknown> }
      ) => {
        PiSessionHostModule.sessions.get(sessionId)?.bridge.handleUpdate(toolCallId, partial);
        return { ok: true };
      }
    );
  }

  private static async createSession(
    sender: Electron.WebContents,
    request: PiSessionCreateRequest
  ) {
    if (PiSessionHostModule.sessions.has(request.sessionId)) {
      return { ok: false, error: "会话已存在" };
    }
    let interactions: PiSessionInteractions | undefined;
    let bridge: PiToolCallBridge | undefined;
    try {
      const setting = await userSettingModule.getSettingSnapshot();
      PiSessionHostModule.permissionMode = normalizePermissionMode(setting.agentPermission?.mode);
      const authPath = join(PathUtil.getAppDir(), "pi", "auth.json");
      const modelRuntime = await createHostModelRuntime(
        authPath,
        PiSessionHostModule.latestProviders
      );
      const sessionDir =
        request.persist === false
          ? undefined
          : join(PathUtil.getAppDir(), "sessions", await PiSessionHostModule.currentDatabaseName());
      bridge = new PiToolCallBridge(sender, request.sessionId);
      interactions = new PiSessionInteractions({
        sessionId: request.sessionId,
        interactive: request.interactive === true,
        tools: request.customTools ?? [],
        getMode: () => PiSessionHostModule.permissionMode,
        send: snapshot => {
          if (sender.isDestroyed()) throw new Error("会话窗口已关闭");
          sender.send("pi-session-interactions", snapshot);
        },
      });
      const customTools = [
        ...bridge.toToolDefinitions(request.customTools ?? []),
        ...interactions.hostTools(),
      ];
      const systemPromptRef = { current: request.systemPrompt ?? "" };
      const initialMessages = request.initialMessages?.length
        ? await desktopMessagesToPi(
            request.initialMessages,
            request.modelRef.providerId,
            request.modelRef.modelId
          )
        : [];
      const session = await assembleHostSession({
        // cwd 为空时落到应用数据目录（正式会话的「当前项目根」绑定在 M4 接入）
        cwd: request.cwd || PathUtil.getAppDir(),
        agentDir: join(PathUtil.getAppDir(), "pi"),
        modelRuntime,
        modelRef: request.modelRef,
        sessionDir,
        systemPrompt: request.systemPrompt,
        shellPath: request.shellPath || PiSessionHostModule.shellPath,
        ...(customTools.length > 0 ? { customTools } : {}),
        ...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel } : {}),
        ...(initialMessages.length > 0 ? { initialMessages } : {}),
        ...(request.retryMaxRetries !== undefined
          ? { retry: { maxRetries: request.retryMaxRetries } }
          : { retry: { maxRetries: 5 } }),
        ...(PiSessionHostModule.requestDumpDir
          ? { dumpRequestDir: PiSessionHostModule.requestDumpDir }
          : {}),
        // 动态 systemPrompt：渲染端经 set-system-prompt 更新，每轮 agent start 前替换
        ...(request.systemPrompt !== undefined
          ? {
              resourceLoader: await createHostResourceLoader({
                cwd: request.cwd || PathUtil.getAppDir(),
                agentDir: join(PathUtil.getAppDir(), "pi"),
                systemPrompt: request.systemPrompt,
                extensionFactories: [createDynamicSystemPromptExtension(systemPromptRef)],
                ...(PiSessionHostModule.requestDumpDir
                  ? { dumpRequestDir: PiSessionHostModule.requestDumpDir }
                  : {}),
              }),
            }
          : {}),
      });
      interactions.install(session);
      if (sender.isDestroyed()) {
        interactions.dispose();
        session.dispose();
        bridge.dispose();
        return { ok: false, error: "会话窗口已关闭" };
      }
      const onSenderClosed = () => PiSessionHostModule.disposeSession(request.sessionId);
      sender.once("destroyed", onSenderClosed);
      sender.once("render-process-gone", onSenderClosed);
      const unsubscribe = session.subscribe(sessionEvent => {
        if (sender.isDestroyed()) return;
        try {
          sender.send("pi-session-event", { sessionId: request.sessionId, event: sessionEvent });
        } catch (error) {
          console.error("[PiSessionHost] 事件序列化失败:", error);
        }
      });
      PiSessionHostModule.sessions.set(request.sessionId, {
        session,
        unsubscribe,
        sender,
        bridge,
        interactions,
        detachSender: () => {
          sender.removeListener("destroyed", onSenderClosed);
          sender.removeListener("render-process-gone", onSenderClosed);
        },
        systemPromptRef,
        scope: request.scope,
        modelRef: request.modelRef,
        thinkingLevel: request.thinkingLevel,
      });
      return { ok: true };
    } catch (error) {
      interactions?.dispose();
      bridge?.dispose();
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private static disposeSession(sessionId: string) {
    const hosted = PiSessionHostModule.sessions.get(sessionId);
    if (!hosted) return;
    hosted.detachSender();
    void hosted.session.abort();
    hosted.interactions.dispose();
    hosted.unsubscribe();
    hosted.session.dispose();
    hosted.bridge.dispose();
    PiSessionHostModule.sessions.delete(sessionId);
  }

  private static async currentDatabaseName(): Promise<string> {
    try {
      const setting = await userSettingModule.getSettingSnapshot();
      const name = setting?.database?.active;
      return typeof name === "string" && name ? name.replace(/\.db$/, "") : "data";
    } catch {
      return "data";
    }
  }
}

/** 动态 systemPrompt 扩展：每轮 agent start 前用宿主当前值替换（渲染端 set-system-prompt 更新） */
const createDynamicSystemPromptExtension = (systemPromptRef: {
  current: string;
}): InlineExtension => ({
  name: "dynamic-system-prompt",
  hidden: true,
  factory: (pi: ExtensionAPI) => {
    pi.on("before_agent_start", () => {
      const current = systemPromptRef.current;
      return current ? { systemPrompt: current } : undefined;
    });
  },
});

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

/** prompt 附带图片 → pi ImageContent（path 读文件 / dataURL 解析；失败返回 null 跳过） */
async function readPromptImage(image: {
  path?: string;
  dataUrl?: string;
}): Promise<unknown | null> {
  try {
    if (image.dataUrl) {
      const match = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) return { type: "image", data: match[2], mimeType: match[1] };
      return null;
    }
    if (image.path && existsSync(image.path)) {
      const buffer = readFileSync(image.path);
      const extension = image.path.slice(image.path.lastIndexOf(".")).toLowerCase();
      return {
        type: "image",
        data: buffer.toString("base64"),
        mimeType: MIME_BY_EXTENSION[extension] ?? "image/png",
      };
    }
    if (/^https?:\/\//i.test(image.path ?? "")) {
      const response = await fetch(image.path!);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        type: "image",
        data: buffer.toString("base64"),
        mimeType: response.headers.get("content-type")?.split(";", 1)[0] || "image/png",
      };
    }
    return null;
  } catch (error) {
    console.error("[PiSessionHost] 读取 prompt 图片失败:", error);
    return null;
  }
}

export default PiSessionHostModule;
