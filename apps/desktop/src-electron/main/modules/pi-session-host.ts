/**
 * PiSessionHost 模块（会话 harness 宿主，M2 骨架）：
 * 渲染进程的会话生命周期经 IPC 驱动（create/prompt/steer/abort/dispose），
 * AgentSessionEvent 经 pi-session-event 通道按 sessionId 路由回创建窗口。
 * 模型注册中心与设置订阅复用 pi-ai 模块的同一数据源（v2 llmProviders 上线后生效）。
 */
import { ipcMain } from "electron";
import userSettingModule from "./user-setting";
import PathUtil from "../utils/PathUtil";
import {
  assembleHostSession,
  createHostModelRuntime,
  detectBashShellPath,
} from "./pi-session-host-core";
import { resolveV2Providers } from "./pi-ai-runtime-core";
import type { LLMProviderSetting } from "@/types/pi-llm";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

interface HostedSession {
  session: AgentSession;
  unsubscribe: () => void;
  sender: Electron.WebContents;
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
}

class PiSessionHostModule {
  private static readonly sessions = new Map<string, HostedSession>();
  private static latestProviders: LLMProviderSetting[] = [];
  private static shellPath: string | undefined;

  public static init() {
    PiSessionHostModule.shellPath = detectBashShellPath();

    userSettingModule.onSettingChanged(({ newSetting }) => {
      PiSessionHostModule.latestProviders = resolveV2Providers(newSetting);
    });
    void userSettingModule.getSettingSnapshot().then(setting => {
      PiSessionHostModule.latestProviders = resolveV2Providers(setting);
    });

    ipcMain.handle("pi-session:create", async (event, request: PiSessionCreateRequest) => {
      return PiSessionHostModule.createSession(event.sender, request);
    });
    ipcMain.handle(
      "pi-session:prompt",
      async (
        _event,
        { sessionId, text, images }: { sessionId: string; text: string; images?: unknown[] }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        try {
          await hosted.session.prompt(text, images as never);
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
    ipcMain.handle("pi-session:abort", async (_event, { sessionId }: { sessionId: string }) => {
      const hosted = PiSessionHostModule.sessions.get(sessionId);
      if (!hosted) return { ok: false, error: "会话不存在" };
      await hosted.session.abort();
      return { ok: true };
    });
    ipcMain.handle("pi-session:dispose", async (_event, { sessionId }: { sessionId: string }) => {
      PiSessionHostModule.disposeSession(sessionId);
      return { ok: true };
    });
  }

  private static async createSession(
    sender: Electron.WebContents,
    request: PiSessionCreateRequest
  ) {
    if (PiSessionHostModule.sessions.has(request.sessionId)) {
      return { ok: false, error: "会话已存在" };
    }
    try {
      const authPath = join(PathUtil.getAppDir(), "pi", "auth.json");
      const modelRuntime = await createHostModelRuntime(
        authPath,
        PiSessionHostModule.latestProviders
      );
      const sessionDir =
        request.persist === false
          ? undefined
          : join(PathUtil.getAppDir(), "sessions", await PiSessionHostModule.currentDatabaseName());
      const session = await assembleHostSession({
        // cwd 为空时落到应用数据目录（正式会话的「当前项目根」绑定在 M4 接入）
        cwd: request.cwd || PathUtil.getAppDir(),
        agentDir: join(PathUtil.getAppDir(), "pi"),
        modelRuntime,
        modelRef: request.modelRef,
        sessionDir,
        systemPrompt: request.systemPrompt,
        shellPath: request.shellPath || PiSessionHostModule.shellPath,
      });
      const unsubscribe = session.subscribe(sessionEvent => {
        if (sender.isDestroyed()) return;
        try {
          sender.send("pi-session-event", { sessionId: request.sessionId, event: sessionEvent });
        } catch (error) {
          console.error("[PiSessionHost] 事件序列化失败:", error);
        }
      });
      PiSessionHostModule.sessions.set(request.sessionId, { session, unsubscribe, sender });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private static disposeSession(sessionId: string) {
    const hosted = PiSessionHostModule.sessions.get(sessionId);
    if (!hosted) return;
    hosted.unsubscribe();
    hosted.session.dispose();
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

export default PiSessionHostModule;
