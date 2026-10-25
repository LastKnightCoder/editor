/**
 * PiSessionHost 核心（装配逻辑，无 Electron 依赖，可单测）：
 * v2 设置 → coding-agent ModelRuntime（provider 注册 + keyless 占位）→ createAgentSession 装配。
 * 产品形态：零文件系统资源发现（context files/skills/提示模板/主题渐进启用）、
 * systemPrompt 由宿主覆盖、会话存储按调用方传入（持久 sessionDir / 测试 inMemory）。
 * 模块壳（IPC/会话表/设置订阅）在 pi-session-host.ts。
 */
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { recordSyncIo } from "./perf-record";
import { fauxProvider } from "@earendil-works/pi-ai";
import type { Provider } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentSession,
  ExtensionAPI,
  InlineExtension,
  ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { buildPiProvider } from "./pi-ai-runtime-core";
import type { PiTranscriptEntry, PiTranscriptMessage } from "./pi-session-transcript";
import {
  DISPLAY_ENTRY_TYPE,
  closeDanglingToolCalls,
  messageVersionsOf,
  type DesktopDisplayData,
} from "./pi-session-files";
import type { LLMProviderSetting } from "@/types/pi-llm";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PiThinkingLevel } from "@/types/pi-llm";

/**
 * pi 只认 Program Files 与 Windows PATH 上的 bash；非标准安装位置需 settings shellPath 兜底（D-060 后产品首启检测写入，此处为探测默认值）。
 * 探测失败不设 shellPath 时 pi 走自己的 PATH 搜索——它不排除 System32\bash.exe（WSL 入口），
 * 中文 Windows 上必命中 WSL 并因「无已安装分发版」全部失败，故这里必须穷尽到 git.exe 反推。
 * 探测结果打印到主进程日志，便于联调定位落到哪一级。
 */
const logShellProbe = (stage: string, value: string | undefined) => {
  console.log(`[PiSessionHost] shell 探测 ${stage}: ${value ?? "未命中"}`);
};

/** WSL 提供的 bash 入口（无发行版必失败，且路径语义与文件工具断裂），一律排除 */
const isWslBash = (bashPath: string): boolean => {
  const lower = bashPath.toLowerCase();
  return (
    lower.includes("\\system32\\") ||
    lower.includes("\\syswow64\\") ||
    lower.includes("\\windowsapps\\")
  );
};

/**
 * 只保留宿主桥接 / 宿主注册的工具（allowed），去掉 pi 自带的 read/edit/write/bash 等：
 * 浏览器伴读这类入口的上下文来自不可信网页，不给读写本机文件与执行命令的能力。
 */
export function restrictToHostTools(
  session: Pick<AgentSession, "getActiveToolNames" | "setActiveToolsByName">,
  allowed: Set<string>
): void {
  const current = session.getActiveToolNames();
  const next = current.filter(name => allowed.has(name));
  if (next.length !== current.length) session.setActiveToolsByName(next);
}

/**
 * 收敛会话的活跃工具集（下一轮生效）：只增删桥接工具，pi 自己的内置活跃默认
 * （read/edit/write + bash 或 powershell 兜底；grep/find/ls 等默认不活跃）原样保留。
 * pi 的工具注册表装配后不可追加定义，所以桥接工具按全集注册、用启用名单取子集；
 * 集合没变就不动——工具定义渲染在请求最前，无谓的变更会整条作废提示缓存。
 */
export function applyActiveTools(
  session: Pick<AgentSession, "getActiveToolNames" | "setActiveToolsByName">,
  bridgedToolNames: Set<string>,
  activeToolNames: string[]
): void {
  const enabled = new Set(activeToolNames);
  const current = session.getActiveToolNames();
  const next = current
    .filter(name => !bridgedToolNames.has(name))
    .concat([...bridgedToolNames].filter(name => enabled.has(name)));
  if (next.length === current.length && next.every((name, index) => name === current[index]))
    return;
  session.setActiveToolsByName(next);
}

/**
 * 读取会话文件里当前叶子路径上的消息（M4：打开对话用）。
 * 只解析不落笔：SessionManager.open 在没有 append 之前不会写文件。
 * 用 getBranch 而不是 buildContextEntries——后者是给模型用的、会把压缩掉的历史省略，
 * 而界面要展示完整对话。
 */
export function loadSessionTranscript(
  sessionFile: string,
  sessionDir?: string,
  cwd?: string
): PiTranscriptEntry[] {
  return transcriptOf(SessionManager.open(sessionFile, sessionDir, cwd));
}

/** 同上，读已打开的 SessionManager（宿主会话改完树后直接读它，不再开一次文件） */
export function transcriptOf(
  manager: Pick<SessionManager, "getBranch" | "getEntries">
): PiTranscriptEntry[] {
  const branch = manager.getBranch();
  // 会话树（M4-d）：同一位置有多个版本的用户消息带上版本信息，界面据此显示 ‹ i/n ›
  const versions = messageVersionsOf(manager.getEntries());
  // 删除单条消息 = pi 原生 context_edit(target, null)：模型看不到，界面也不该再显示
  const omitted = new Set(
    branch
      .filter(entry => entry.type === "context_edit")
      .filter(entry => (entry as { replacement: unknown }).replacement === null)
      .map(entry => (entry as { targetId: string }).targetId)
  );
  const out: PiTranscriptEntry[] = [];
  // 展示 entry 按模型文本认领用户消息：插话的用户消息与它的展示 entry 之间可能隔着别的 entry，
  // 不能按位置配对；同一文本多次出现时按顺序先到先得
  const pendingUsers: PiTranscriptEntry[] = [];
  for (const entry of branch) {
    if (entry.type === "message") {
      if (omitted.has(entry.id)) continue;
      const version = versions.get(entry.id);
      const item: PiTranscriptEntry = {
        id: entry.id,
        message: (entry as { message: PiTranscriptMessage }).message,
        ...(version ? { versions: version } : {}),
      };
      out.push(item);
      if (item.message.role === "user") pendingUsers.push(item);
      continue;
    }
    if (
      entry.type === "custom" &&
      (entry as { customType?: string }).customType === DISPLAY_ENTRY_TYPE
    ) {
      const data = (entry as { data?: DesktopDisplayData }).data;
      if (!data) continue;
      const index = pendingUsers.findIndex(
        user => userModelTextOf(user.message.content) === data.modelText
      );
      if (index < 0) continue;
      const [user] = pendingUsers.splice(index, 1);
      user.display = {
        content: data.content,
        ...(data.clientId ? { clientId: data.clientId } : {}),
      };
    }
  }
  return out;
}

/**
 * 展示 entry 写入器（M4）：发送/插话前登记桌面展示形态，pi 把对应的用户消息落盘后紧跟着写一条
 * desktop-display entry。按文本认领（插话送达时机由 pi 决定，不能按调用顺序配对）。
 *
 * 时序：pi 的 _handleAgentEvent 先通知监听者、**再**同步 appendMessage，所以监听到 user
 * message_end 时用户消息还没写进去——推迟一个微任务再写，展示 entry 才落在用户消息之后。
 * agent_settled 时还没认领的就是没送达的插话（渲染端会退回待发送、重发时重新登记），直接丢弃。
 */
export function createDisplayEntryWriter(
  session: Pick<AgentSession, "subscribe" | "sessionManager">
) {
  const pending: DesktopDisplayData[] = [];
  const unsubscribe = session.subscribe(event => {
    if (event.type === "agent_settled") {
      pending.length = 0;
      return;
    }
    if (event.type !== "message_end" || event.message.role !== "user") return;
    const text = userModelTextOf((event.message as { content: unknown }).content);
    const index = pending.findIndex(display => display.modelText === text);
    if (index < 0) return;
    const [display] = pending.splice(index, 1);
    queueMicrotask(() => {
      try {
        session.sessionManager.appendCustomEntry(DISPLAY_ENTRY_TYPE, display);
      } catch (error) {
        console.error("[PiSessionHost] 写展示 entry 失败:", error);
      }
    });
  });
  return {
    expect(display: DesktopDisplayData) {
      pending.push(display);
    },
    discard(display: DesktopDisplayData) {
      const index = pending.indexOf(display);
      if (index >= 0) pending.splice(index, 1);
    },
    dispose: unsubscribe,
  };
}

/** 与 pi 出队/展示 entry 认领同一取法：只取 text 块、直接相接 */
export const userModelTextOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? (content as Array<{ type: string; text?: string }>)
          .filter(block => block.type === "text")
          .map(block => block.text ?? "")
          .join("")
      : "";

/** 插话结果：not-streaming 表示这轮已经结束，渲染端据此退回待发送队列 */
export interface SteerOutcome {
  ok: boolean;
  reason?: "not-streaming" | "error";
  error?: string;
}

/** steerHostSession 需要的会话能力（便于单测用最小替身） */
type SteerableSession = Pick<AgentSession, "isStreaming" | "prompt">;

/**
 * 运行中插话（M3 第 5 项）：交 pi 原生 steer 队列——消息在当前轮的工具调用跑完之后、
 * 下一次请求模型之前送达，与本轮同属一次运行（中间没有 agent_settled）。
 *
 * 两处细节是硬约束：
 * - **必须先判 isStreaming**：pi 的 prompt() 在会话空闲时会开一轮新运行，而且要等整轮跑完才返回
 *   （IPC 会一直挂着），且绕过渲染端的发送编排（会话确保、systemPrompt 刷新、附件转换）。
 *   空闲一律返回 not-streaming，由渲染端按普通消息排队。
 * - **expandPromptTemplates: false**：关掉 pi 的斜杠命令/模板/skill 展开，送达文本与提交文本
 *   逐字一致，渲染端才能按文本认领自己的插话（pi 的队列出队也是按文本匹配的）。
 *
 * prompt() 在排队分支里一排完就调 preflightResult 并返回，但这里仍只等 preflight——
 * 免得将来 pi 调整返回时机把 IPC 一起拖住。
 */
export async function steerHostSession(
  session: SteerableSession,
  text: string,
  images?: unknown[]
): Promise<SteerOutcome> {
  if (!session.isStreaming) return { ok: false, reason: "not-streaming" };
  let settlePreflight: (accepted: boolean) => void = () => undefined;
  const preflight = new Promise<boolean>(resolve => {
    settlePreflight = resolve;
  });
  const failure = session
    .prompt(text, {
      streamingBehavior: "steer",
      expandPromptTemplates: false,
      preflightResult: settlePreflight,
      ...(images && images.length > 0 ? { images: images as never } : {}),
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      settlePreflight(false);
      return error instanceof Error ? error.message : String(error);
    });
  if (await preflight) return { ok: true };
  return { ok: false, reason: "error", error: (await failure) ?? "插话失败" };
}

/**
 * 选定 AI 执行命令用的 shell（M3-g）：用户在设置里填的优先，但路径不存在就忽略——
 * 让 pi 拿着坏路径去起 bash 只会得到一个没头没尾的失败。两者皆空时返回 undefined，
 * 由 pi 走 PowerShell 兜底（见本文件顶部说明）。
 */
export function resolveAgentShellPath(options: {
  configured?: string;
  detected?: string;
  exists?: (path: string) => boolean;
}): { path?: string; ignoredConfigured?: string } {
  const configured = options.configured?.trim();
  const exists = options.exists ?? existsSync;
  if (configured && exists(configured)) return { path: configured };
  return {
    ...(options.detected ? { path: options.detected } : {}),
    ...(configured ? { ignoredConfigured: configured } : {}),
  };
}

export function detectBashShellPath(): string | undefined {
  if (process.env.PI_SMOKE_SHELL && existsSync(process.env.PI_SMOKE_SHELL)) {
    logShellProbe("env", process.env.PI_SMOKE_SHELL);
    return process.env.PI_SMOKE_SHELL;
  }
  if (process.platform !== "win32") return undefined;
  for (const hive of ["HKLM\\SOFTWARE\\GitForWindows", "HKCU\\SOFTWARE\\GitForWindows"]) {
    const reg = spawnSync("reg", ["query", hive, "/v", "InstallPath"], { encoding: "utf8" });
    if (reg.status !== 0 || !reg.stdout) continue;
    const match = reg.stdout.match(/InstallPath\s+REG_SZ\s+(\S+)/);
    if (match && existsSync(join(match[1], "bin", "bash.exe"))) {
      const bash = join(match[1], "bin", "bash.exe");
      logShellProbe("注册表", bash);
      return bash;
    }
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) {
    logShellProbe("固定路径", found);
    return found;
  }
  // git.exe 在 PATH 的概率远高于 bash.exe：由 git.exe 位置向上搜索（最多 3 层）找安装根下的 bash
  const where = spawnSync("where", ["git"], { encoding: "utf8" });
  if (where.status === 0 && where.stdout) {
    for (const raw of where.stdout.split(/\r?\n/)) {
      const gitPath = raw.trim();
      if (!gitPath.toLowerCase().endsWith("\\git.exe") || !existsSync(gitPath)) continue;
      for (let dir = dirname(gitPath), depth = 0; depth < 3; dir = dirname(dir), depth += 1) {
        for (const bash of [join(dir, "bin", "bash.exe"), join(dir, "usr\\bin\\bash.exe")]) {
          if (existsSync(bash)) {
            logShellProbe("git 反推", bash);
            return bash;
          }
        }
      }
    }
  }
  // PATH 上的 bash.exe（排除 WSL 入口），避免落回 pi 的不排除搜索
  const whereBash = spawnSync("where", ["bash"], { encoding: "utf8" });
  if (whereBash.status === 0 && whereBash.stdout) {
    const bashPath = whereBash.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.toLowerCase().endsWith("\\bash.exe") && !isWslBash(line));
    if (bashPath && existsSync(bashPath)) {
      logShellProbe("PATH", bashPath);
      return bashPath;
    }
  }
  logShellProbe("全部落空", undefined);
  return undefined;
}

/** keyless 占位：pi 把缺失 key 视为未配置直接拒绝请求，无 key 本地网关（Ollama 等）需占位放行 */
const KEYLESS_PLACEHOLDER = "no-key-required";

export async function createHostModelRuntime(
  authPath: string,
  providers: LLMProviderSetting[]
): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({ authPath, allowModelNetwork: false });
  for (const setting of providers) {
    runtime.registerNativeProvider(await buildPiProvider(setting));
    await runtime.setRuntimeApiKey(setting.id, setting.apiKey || KEYLESS_PLACEHOLDER);
  }
  return runtime;
}

export interface HostResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  systemPrompt?: string;
  /** 内联扩展（M3 的工具审批拦截、UA 注入等经此注入） */
  extensionFactories?: ConstructorParameters<typeof DefaultResourceLoader>[0]["extensionFactories"];
  /** 出站请求 dump 目录（联调取证：每次 provider 请求的 payload 写 JSON，image_url 截断防膨胀） */
  dumpRequestDir?: string;
}

/** 压掉 payload 里的巨型 base64，保留前缀与长度便于诊断 */
const sanitizePayload = (value: unknown): unknown => {
  if (typeof value === "string" && value.length > 400 && value.startsWith("data:")) {
    return `${value.slice(0, 80)}...(len=${value.length})`;
  }
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizePayload(v)]));
  }
  return value;
};

/** 联调取证扩展：把每次出站请求 payload（含消息序列）写到 dumpRequestDir */
export const createRequestDumpExtension = (dumpDir: string): InlineExtension => ({
  name: "request-dump",
  hidden: true,
  factory: (pi: ExtensionAPI) => {
    let counter = 0;
    pi.on("before_provider_request", event => {
      counter += 1;
      try {
        const dumpPath = join(dumpDir, `req-${Date.now()}-${counter}.json`);
        const dump = JSON.stringify(sanitizePayload(event.payload), null, 2);
        const syncIoStart = Date.now();
        writeFileSync(dumpPath, dump);
        recordSyncIo(`write:${dumpPath}`, dump.length, Date.now() - syncIoStart);
      } catch (error) {
        console.error("[PiSessionHost] 请求 dump 写入失败:", error);
      }
    });
  },
});

/** 零文件系统资源发现的 ResourceLoader（skills/context files 等后续按产品决策渐进启用） */
export async function createHostResourceLoader(
  options: HostResourceLoaderOptions
): Promise<ResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    noContextFiles: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    ...{
      extensionFactories: [
        ...(options.dumpRequestDir ? [createRequestDumpExtension(options.dumpRequestDir)] : []),
        ...(options.extensionFactories ?? []),
      ],
    },
  });
  await loader.reload();
  return loader;
}

export interface AssembleHostSessionOptions {
  cwd: string;
  agentDir: string;
  modelRuntime: ModelRuntime;
  modelRef: { providerId: string; modelId: string };
  /** 持久会话目录（~/.editor/sessions/<库名>/）；省略 = inMemory（测试/单轮场景） */
  sessionDir?: string;
  /**
   * 打开已有会话文件（M4 resume）：pi 自己从 JSONL 恢复上下文，
   * 所以走这条路时**不要**再传 initialMessages（历史已经在文件里）。
   */
  sessionFile?: string;
  /** 新建会话时指定 pi 会话 id（M4：与目录表主键一致） */
  sessionId?: string;
  resourceLoader?: ResourceLoader;
  systemPrompt?: string;
  shellPath?: string;
  /** 出站请求 dump 目录（联调取证，见 createRequestDumpExtension） */
  dumpRequestDir?: string;
  /** 渲染端 ToolRegistry 工具桥（customTools） */
  customTools?: ToolDefinition[];
  /** 推理档位（缺省由 pi 按模型能力取默认） */
  thinkingLevel?: PiThinkingLevel;
  /** 历史灌入：已转换好的 pi 消息（桌面 chat-core 历史 → AgentMessage） */
  initialMessages?: import("@earendil-works/pi-ai").Message[];
  /** agent 层自动重试（对齐旧链路 DEFAULT_CHAT_MAX_RETRIES） */
  retry?: { maxRetries: number };
}

export async function assembleHostSession(
  options: AssembleHostSessionOptions
): Promise<AgentSession> {
  const model = options.modelRuntime.getModel(
    options.modelRef.providerId,
    options.modelRef.modelId
  );
  if (!model) {
    throw new Error(
      `模型未注册或容量未配置：${options.modelRef.providerId}/${options.modelRef.modelId}，请检查模型的上下文窗口与最大输出 token 数`
    );
  }
  const resourceLoader =
    options.resourceLoader ??
    (await createHostResourceLoader({
      cwd: options.cwd,
      agentDir: options.agentDir,
      systemPrompt: options.systemPrompt,
      ...(options.dumpRequestDir ? { dumpRequestDir: options.dumpRequestDir } : {}),
    }));
  // resume：打开已有 JSONL（createAgentSession 内部 buildSessionContext 会把历史恢复进 Agent）。
  // 文件不存在（首轮没等到 assistant 消息就失败了，pi 不落盘）就按新会话建，并沿用目录表的 id——
  // SessionManager.open 对不存在的路径会起一个随机 id 的新会话，目录表 id 与会话 id 就对不上了
  const newSessionOptions = options.sessionId ? { id: options.sessionId } : undefined;
  const sessionManager =
    options.sessionFile && existsSync(options.sessionFile)
      ? SessionManager.open(options.sessionFile, options.sessionDir, options.cwd)
      : options.sessionDir
        ? SessionManager.create(options.cwd, options.sessionDir, newSessionOptions)
        : SessionManager.inMemory(options.cwd, newSessionOptions);
  if (options.sessionFile && !existsSync(options.sessionFile)) {
    // 目录已登记的路径必须稳定；只建头部，避免恢复时生成另一个时间戳文件名。
    writeFileSync(options.sessionFile, `${JSON.stringify(sessionManager.getHeader())}\n`, {
      flag: "wx",
    });
    sessionManager.setSessionFile(options.sessionFile);
  }
  // resume 时收尾悬挂的工具调用（M4-e）：新建的宿主会话不可能持有上一次的等待，文件里没结果的调用
  // 只能是上次中断留下的（应用重启、宿主被回收）。必须在 createAgentSession 之前——它按文件恢复上下文
  closeDanglingToolCalls(sessionManager);
  // 历史灌入：sessionManager 落 entry，createAgentSession 内部 buildSessionContext 恢复进 Agent
  for (const message of options.initialMessages ?? []) {
    sessionManager.appendMessage(message);
  }
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: options.agentDir,
    modelRuntime: options.modelRuntime,
    model,
    ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}),
    ...(options.customTools && options.customTools.length > 0
      ? { customTools: options.customTools }
      : {}),
    sessionManager,
    resourceLoader,
    // 无 Git Bash 时不能留默认 bash 工具——pi 的 PATH 搜索会命中 System32\bash.exe（WSL 入口，
    // 路径语义与文件工具断裂且无发行版时全失败），改为 powershell（Windows 原生路径语义一致，
    // pi 实现已自带 [Console]::OutputEncoding=UTF8 输出前缀）。WSL 手动选项在工具管理（M3）提供。
    settingsManager: SettingsManager.inMemory({
      ...(options.shellPath
        ? { shellPath: options.shellPath }
        : process.platform === "win32"
          ? { defaultTools: ["read", "powershell", "edit", "write"] }
          : {}),
      ...(options.retry ? { retry: { enabled: true, maxRetries: options.retry.maxRetries } } : {}),
    }),
  });
  return session;
}

/** 测试辅助：faux provider 包装成可注册进 ModelRuntime 的形状（无需真实网关） */
export async function createFauxModelRuntime(
  authPath: string,
  faux: ReturnType<typeof fauxProvider>
): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({ authPath, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider as Provider);
  await runtime.setRuntimeApiKey(faux.provider.id, "faux-test-key");
  return runtime;
}
