/**
 * PiSessionHost 模块（会话 harness 宿主）：
 * 渲染进程的会话生命周期经 IPC 驱动（create/prompt/steer/abort/dispose；steer = 运行中插话，
 * 见 steerHostSession），
 * AgentSessionEvent 经 pi-session-event 通道按 sessionId 路由回创建窗口。
 * 桌面工具经 pi-tool-call 桥回渲染端 ToolRegistry 执行（结果经 pi-session:tool-* 回传）；
 * 历史（桌面 chat-core 消息）在 create 时转换灌入（desktopMessagesToPi）。
 * 模型注册中心与设置订阅复用 pi-ai 模块的同一数据源（v2 llmProviders）。
 */
import { ipcMain } from "electron";
import userSettingModule from "./user-setting";
import PathUtil from "../utils/PathUtil";
import {
  applyActiveTools,
  assembleHostSession,
  createDisplayEntryWriter,
  createHostModelRuntime,
  createHostResourceLoader,
  detectBashShellPath,
  resolveAgentShellPath,
  steerHostSession,
  transcriptOf,
} from "./pi-session-host-core";
import { piEntriesToDesktopMessages } from "./pi-session-transcript";
import { desktopMessagesToPi, PiToolCallBridge } from "./pi-session-bridge";
import {
  applySessionEdit,
  applySessionEditToFile,
  browserSessionFile,
  deleteBrowserSession,
  listBrowserSessions,
  packSessionDir,
  readTranscript,
  renameBrowserSession,
  replaceSessionDir,
  type SessionEdit,
} from "./pi-session-store";
import {
  assertSafeSessionId,
  browserSessionDirOf,
  chatSessionDirOf,
  findSessionFileById,
  resolveSessionFile,
} from "./pi-session-paths";
import type { DesktopDisplayData } from "./pi-session-files";
import type {
  PiHostToolSpec,
  PiPromptDisplay,
  PiSessionLocation,
  PiToolApprovalChoice,
} from "@/types/pi-session";
import { PiSessionInteractions } from "./pi-session-interactions";
import { normalizePermissionMode } from "@/services/tool-permission/mode";
import { resolveV2Providers } from "./pi-ai-runtime-core";
import type { LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { RequestMessage } from "@/types";
import type { AgentSession, ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { basename, join } from "node:path";
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
  /** 桥接工具名全集：切活跃集时据此只动桥接工具，保留 pi 自己的内置默认 */
  bridgedToolNames: Set<string>;
  scope: string;
  modelRef: { providerId: string; modelId: string };
  thinkingLevel?: PiThinkingLevel;
  /** 展示 entry 写入器：prompt/steer 登记，用户消息落盘后紧跟着写 */
  displayWriter: ReturnType<typeof createDisplayEntryWriter>;
}

export interface PiSessionCreateRequest {
  sessionId: string;
  scope: string;
  cwd: string;
  modelRef: { providerId: string; modelId: string };
  systemPrompt?: string;
  /** 持久会话目录相对库名（默认当前活跃库）；传 null 强制 inMemory（测试/单轮） */
  persist?: boolean;
  /**
   * 打开已有会话（M4 resume）：相对当前库会话目录的文件名。
   * pi 从 JSONL 自己恢复上下文，所以这条路不需要 initialMessages。
   */
  sessionFile?: string;
  /**
   * 新建时的 pi 会话 id（= 目录表主键，跨重建稳定）。与 sessionId（本进程内的宿主登记键，
   * 每次重建都换）是两回事：前者标识「这条对话」，后者标识「这一次打开」。
   */
  piSessionId?: string;
  /** 浏览器扩展对话：会话落在 browser-sessions/<页面键>/，按 piSessionId 找文件（与 sessionFile 互斥） */
  browserPageUrl?: string;
  /** 手动指定 bash.exe（pi-dev 面板联调用；产品化的设置项在 M3 工具管理落地） */
  shellPath?: string;
  /** 渲染端 ToolRegistry 工具清单（桥接为 pi customTools），含当前停用项 */
  customTools?: PiHostToolSpec[];
  /** 其中本轮活跃的工具名；缺省全部活跃。pi 注册表装配后不可追加，故全集注册、只切活跃集 */
  activeToolNames?: string[];
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
          display,
        }: {
          sessionId: string;
          text: string;
          images?: Array<{ path?: string; dataUrl?: string }>;
          display?: PiPromptDisplay;
        }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        // 展示 entry 的模型文本取实际送给 pi 的 text（逐字相同，投影才认领得上）
        const displayData = toDisplayData(text, display);
        try {
          // 渲染端只传定位信息（path/dataUrl），主进程读文件转 pi 的 base64 ImageContent
          const piImages = (
            await Promise.all((images ?? []).map(image => readPromptImage(image)))
          ).filter(Boolean);
          if (displayData) hosted.displayWriter.expect(displayData);
          await hosted.session.prompt(text, {
            // 与插话同理：关掉模板/技能展开，落盘的用户消息与送出文本逐字一致，展示 entry 才认领得上
            expandPromptTemplates: false,
            ...(piImages.length > 0 ? { images: piImages as never } : {}),
          });
          return { ok: true };
        } catch (error) {
          if (displayData) hosted.displayWriter.discard(displayData);
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
    );
    ipcMain.handle(
      "pi-session:steer",
      async (
        event,
        {
          sessionId,
          text,
          images,
          display,
        }: {
          sessionId: string;
          text: string;
          images?: Array<{ path?: string; dataUrl?: string }>;
          display?: PiPromptDisplay;
        }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted || hosted.sender !== event.sender) return { ok: false, error: "会话不存在" };
        const piImages = (
          await Promise.all((images ?? []).map(image => readPromptImage(image)))
        ).filter(Boolean);
        const displayData = toDisplayData(text, display);
        if (displayData) hosted.displayWriter.expect(displayData);
        const outcome = await steerHostSession(hosted.session, text, piImages);
        if (!outcome.ok && displayData) hosted.displayWriter.discard(displayData);
        return outcome;
      }
    );
    ipcMain.handle("pi-session:abort", async (event, { sessionId }: { sessionId: string }) => {
      const hosted = PiSessionHostModule.sessions.get(sessionId);
      if (!hosted || hosted.sender !== event.sender) return { ok: false, error: "会话不存在" };
      await hosted.session.abort();
      // 中止不清 pi 的插话队列：没送达的插话会滞留，等下一次 prompt 开跑时被一起吞进去。
      // 停止的语义是「这些都别发了」，所以这里清空，未送达的文本交渲染端退回待发送队列。
      const cleared = hosted.session.clearQueue();
      return { ok: true, stranded: [...cleared.steering, ...cleared.followUp] };
    });
    ipcMain.handle("pi-session:dispose", async (event, { sessionId }: { sessionId: string }) => {
      if (PiSessionHostModule.sessions.get(sessionId)?.sender !== event.sender)
        return { ok: false, error: "会话不存在" };
      PiSessionHostModule.disposeSession(sessionId);
      return { ok: true };
    });
    // 命令执行环境（M3-g）：设置页据此显示自动检测到什么、实际会用哪个，并校验用户填的路径
    ipcMain.handle("pi-session:shell-info", async (_event, payload?: { probe?: string }) => {
      const probe = payload?.probe?.trim();
      const setting = await userSettingModule.getSettingSnapshot();
      const configured = (setting.agentShell?.path as string | undefined)?.trim() || undefined;
      const target = probe ?? configured;
      return {
        ok: true,
        detected: PiSessionHostModule.shellPath,
        configured,
        /** 用户填的路径是否真实存在（空表示没填，不作判断） */
        configuredExists: target ? existsSync(target) : undefined,
        effective: PiSessionHostModule.resolveShellPath(setting),
      };
    });
    // 打开对话（M4）：读会话文件当前叶子路径，投影成桌面展示消息。纯读，不起 pi 会话
    ipcMain.handle("pi-session:transcript", async (_event, location: PiSessionLocation) =>
      PiSessionHostModule.guard(async () => {
        const { file, sessionDir } = await PiSessionHostModule.locate(location);
        return { messages: readTranscript(file, sessionDir) };
      })
    );
    // 改会话树（M4-d）：编辑重发/重新生成 = 回退，从这里建分支 = 分叉，切版本，删除 = 省略。
    // 宿主开着这个文件时直接在它的 SessionManager 上改（两个 SessionManager 同时写一个文件会互相
    // 覆盖），改完 refreshContext——会话不重建，本会话的工具授权不丢；运行中不允许改。
    // 没开着就直接打开文件改
    ipcMain.handle(
      "pi-session:edit",
      async (_event, { location, edit }: { location: PiSessionLocation; edit: SessionEdit }) =>
        PiSessionHostModule.guard(async () => {
          const { file, sessionDir } = await PiSessionHostModule.locate(location);
          if (!file) throw new Error("对话还没有保存下来，暂时不能修改历史");
          const hosted = PiSessionHostModule.findByFile(file);
          if (!hosted) {
            applySessionEditToFile(file, edit);
            return { messages: readTranscript(file, sessionDir) };
          }
          const { session } = hosted;
          if (session.isStreaming || session.isCompacting) {
            throw new Error("回答进行中，请先停止再修改历史");
          }
          applySessionEdit(session.sessionManager, edit);
          session.refreshContext();
          return {
            messages: piEntriesToDesktopMessages(transcriptOf(session.sessionManager)),
          };
        })
    );
    // 浏览器扩展对话（M4.5）：按页面列出/改名/删除，全部取自 pi 会话文件本身
    ipcMain.handle("pi-session:browser-list", async (_event, { pageUrl }: { pageUrl: string }) =>
      PiSessionHostModule.guard(async () => ({ sessions: await listBrowserSessions(pageUrl) }))
    );
    ipcMain.handle(
      "pi-session:browser-rename",
      async (
        _event,
        { pageUrl, sessionId, title }: { pageUrl: string; sessionId: string; title: string }
      ) =>
        PiSessionHostModule.guard(async () => {
          renameBrowserSession(pageUrl, sessionId, title);
          return {};
        })
    );
    ipcMain.handle(
      "pi-session:browser-delete",
      async (_event, { pageUrl, sessionId }: { pageUrl: string; sessionId: string }) =>
        PiSessionHostModule.guard(async () => {
          const file = browserSessionFile(pageUrl, sessionId);
          if (file) PiSessionHostModule.disposeByFile(file);
          deleteBrowserSession(pageUrl, sessionId);
          return {};
        })
    );
    // 同步（M4.4）：当前库的会话目录打包 / 用下载的包替换（先整体备份）
    ipcMain.handle("pi-session:pack", async (_event, { databaseName }: { databaseName: string }) =>
      PiSessionHostModule.guard(async () => ({
        archive: packSessionDir(chatSessionDirOf(databaseName)),
      }))
    );
    ipcMain.handle(
      "pi-session:unpack",
      async (_event, { databaseName, archive }: { databaseName: string; archive: Uint8Array }) =>
        PiSessionHostModule.guard(async () => {
          const sessionDir = chatSessionDirOf(databaseName);
          // 替换期间不能有宿主会话开着这个目录里的文件
          for (const [id, hosted] of [...PiSessionHostModule.sessions.entries()]) {
            if (hosted.session.sessionFile?.startsWith(sessionDir))
              PiSessionHostModule.disposeSession(id);
          }
          return replaceSessionDir(
            sessionDir,
            Buffer.from(archive),
            join(PathUtil.getAppDir(), "backup")
          );
        })
    );
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
      "pi-session:set-active-tools",
      (
        _event,
        { sessionId, activeToolNames }: { sessionId: string; activeToolNames: string[] }
      ) => {
        const hosted = PiSessionHostModule.sessions.get(sessionId);
        if (!hosted) return { ok: false, error: "会话不存在" };
        applyActiveTools(hosted.session, hosted.bridgedToolNames, activeToolNames);
        return { ok: true };
      }
    );
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
      // 会话目录：浏览器扩展对话跟页面走（与库无关），其余跟当前库
      const sessionDir =
        request.persist === false
          ? undefined
          : request.browserPageUrl
            ? browserSessionDirOf(request.browserPageUrl)
            : await PiSessionHostModule.currentSessionDir();
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
      const bridgedToolNames = new Set((request.customTools ?? []).map(tool => tool.name));
      const customTools = [
        ...bridge.toToolDefinitions(request.customTools ?? []),
        ...interactions.hostTools(),
      ];
      const systemPromptRef = { current: request.systemPrompt ?? "" };
      // 文件可能还不存在：pi 等第一条 assistant 消息出现才落盘（首轮预检失败就没有文件），
      // 不存在时 assembleHostSession 按 piSessionId 新建（见其注释）
      if (request.piSessionId) assertSafeSessionId(request.piSessionId);
      const sessionFile = !sessionDir
        ? undefined
        : request.browserPageUrl
          ? request.piSessionId
            ? findSessionFileById(sessionDir, request.piSessionId)
            : undefined
          : request.sessionFile
            ? resolveSessionFile(sessionDir, request.sessionFile)
            : undefined;
      // resume 时历史已在 JSONL 里，灌入会重复
      const initialMessages =
        !sessionFile && request.initialMessages?.length
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
        ...(sessionFile ? { sessionFile } : {}),
        ...(request.piSessionId ? { sessionId: request.piSessionId } : {}),
        systemPrompt: request.systemPrompt,
        shellPath: request.shellPath || PiSessionHostModule.resolveShellPath(setting),
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
      // 全集已注册，收敛到本轮活跃子集（缺省全部活跃，保持旧行为）
      if (request.activeToolNames) {
        applyActiveTools(session, bridgedToolNames, request.activeToolNames);
      }
      if (sender.isDestroyed()) {
        interactions.dispose();
        session.dispose();
        bridge.dispose();
        return { ok: false, error: "会话窗口已关闭" };
      }
      const displayWriter = createDisplayEntryWriter(session);
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
        bridgedToolNames,
        scope: request.scope,
        modelRef: request.modelRef,
        thinkingLevel: request.thinkingLevel,
        displayWriter,
      });
      // 回传会话文件（相对会话目录）与 pi 会话 id：目录表据此登记，下次打开走 resume
      return {
        ok: true,
        piSessionId: session.sessionId,
        ...(session.sessionFile ? { sessionFile: basename(session.sessionFile) } : {}),
      };
    } catch (error) {
      interactions?.dispose();
      bridge?.dispose();
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 实际使用的 shell（M3-g）：用户在设置里填的优先（路径不存在则忽略，避免 pi 拿着坏路径
   * 起不来 bash 又不说明原因），否则用启动时的自动检测；两者皆空由 pi 走 powershell 兜底。
   */
  private static resolveShellPath(setting: { agentShell?: { path?: string } }): string | undefined {
    const { path, ignoredConfigured } = resolveAgentShellPath({
      ...(setting.agentShell?.path ? { configured: setting.agentShell.path } : {}),
      ...(PiSessionHostModule.shellPath ? { detected: PiSessionHostModule.shellPath } : {}),
    });
    if (ignoredConfigured) {
      console.warn(`[PiSessionHost] 设置里的 shell 路径不存在，改用自动检测：${ignoredConfigured}`);
    }
    return path;
  }

  private static disposeSession(sessionId: string) {
    const hosted = PiSessionHostModule.sessions.get(sessionId);
    if (!hosted) return;
    hosted.detachSender();
    void hosted.session.abort();
    hosted.displayWriter.dispose();
    hosted.interactions.dispose();
    hosted.unsubscribe();
    hosted.session.dispose();
    hosted.bridge.dispose();
    PiSessionHostModule.sessions.delete(sessionId);
  }

  /** 当前库的会话目录：与开库迁移同一取法（chatSessionDirOf），两处不一致迁移写出的文件就找不到 */
  private static async currentSessionDir(): Promise<string> {
    try {
      const setting = await userSettingModule.getSettingSnapshot();
      const name = setting?.database?.active;
      return chatSessionDirOf(typeof name === "string" && name ? name : "data");
    } catch {
      return chatSessionDirOf("data");
    }
  }

  /** 会话位置 → 绝对路径（浏览器对话还没落盘时 file 为空） */
  private static async locate(
    location: PiSessionLocation
  ): Promise<{ file: string | undefined; sessionDir: string }> {
    if ("pageUrl" in location) {
      return {
        file: browserSessionFile(location.pageUrl, location.sessionId),
        sessionDir: browserSessionDirOf(location.pageUrl),
      };
    }
    const sessionDir = await PiSessionHostModule.currentSessionDir();
    return { file: resolveSessionFile(sessionDir, location.sessionFile), sessionDir };
  }

  private static findByFile(file: string): HostedSession | undefined {
    for (const hosted of PiSessionHostModule.sessions.values()) {
      if (hosted.session.sessionFile === file) return hosted;
    }
    return undefined;
  }

  private static disposeByFile(file: string): void {
    for (const [id, hosted] of [...PiSessionHostModule.sessions.entries()]) {
      if (hosted.session.sessionFile === file) PiSessionHostModule.disposeSession(id);
    }
  }

  private static async guard<T extends object>(
    run: () => Promise<T>
  ): Promise<({ ok: true } & T) | { ok: false; error: string }> {
    try {
      return { ok: true, ...(await run()) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** 渲染端传来的展示形态 + 实际送给 pi 的文本 → 展示 entry 载荷 */
const toDisplayData = (
  text: string,
  display: PiPromptDisplay | undefined
): DesktopDisplayData | undefined =>
  display && Array.isArray(display.content) && display.content.length > 0
    ? {
        modelText: text,
        content: display.content,
        ...(display.clientId ? { clientId: display.clientId } : {}),
      }
    : undefined;

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
