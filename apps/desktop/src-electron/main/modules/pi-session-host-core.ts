/**
 * PiSessionHost 核心（装配逻辑，无 Electron 依赖，可单测）：
 * v2 设置 → coding-agent ModelRuntime（provider 注册 + keyless 占位）→ createAgentSession 装配。
 * 产品形态：零文件系统资源发现（context files/skills/提示模板/主题渐进启用）、
 * systemPrompt 由宿主覆盖、会话存储按调用方传入（持久 sessionDir / 测试 inMemory）。
 * 模块壳（IPC/会话表/设置订阅）在 pi-session-host.ts。
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fauxProvider } from "@earendil-works/pi-ai";
import type { Provider } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession, ResourceLoader } from "@earendil-works/pi-coding-agent";
import { buildPiProvider } from "./pi-ai-runtime-core";
import type { LLMProviderSetting } from "@/types/pi-llm";

/**
 * pi 只认 Program Files 与 Windows PATH 上的 bash；非标准安装位置需 settings shellPath 兜底（D-060 后产品首启检测写入，此处为探测默认值）。
 * 探测失败不设 shellPath 时 pi 走自己的 PATH 搜索——它不排除 System32\bash.exe（WSL 入口），
 * 中文 Windows 上必命中 WSL 并因「无已安装分发版」全部失败，故这里必须穷尽到 git.exe 反推。
 */
export function detectBashShellPath(): string | undefined {
  if (process.env.PI_SMOKE_SHELL && existsSync(process.env.PI_SMOKE_SHELL))
    return process.env.PI_SMOKE_SHELL;
  for (const hive of ["HKLM\\SOFTWARE\\GitForWindows", "HKCU\\SOFTWARE\\GitForWindows"]) {
    const reg = spawnSync("reg", ["query", hive, "/v", "InstallPath"], { encoding: "utf8" });
    if (reg.status !== 0 || !reg.stdout) continue;
    const match = reg.stdout.match(/InstallPath\s+REG_SZ\s+(\S+)/);
    if (match && existsSync(join(match[1], "bin", "bash.exe")))
      return join(match[1], "bin", "bash.exe");
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) return found;
  // git.exe 在 PATH 的概率远高于 bash.exe（System32\bash.exe 是 WSL 入口不可用）：由 git 安装位置反推 Git Bash
  const where = spawnSync("where", ["git"], { encoding: "utf8" });
  if (where.status === 0 && where.stdout) {
    const gitPath = where.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(
        line =>
          line.toLowerCase().endsWith("\\cmd\\git.exe") ||
          line.toLowerCase().endsWith("\\bin\\git.exe")
      );
    if (gitPath) {
      const gitDir = dirname(gitPath);
      const root = gitDir.toLowerCase().endsWith("\\cmd") ? dirname(gitDir) : gitDir;
      for (const bash of [join(root, "bin", "bash.exe"), join(root, "usr\\bin\\bash.exe")]) {
        if (existsSync(bash)) return bash;
      }
    }
  }
  // PATH 上的 bash.exe 也可用，但必须排除 WSL 入口（System32/SysWOW64），避免落回 pi 的不排除搜索
  const whereBash = spawnSync("where", ["bash"], { encoding: "utf8" });
  if (whereBash.status === 0 && whereBash.stdout) {
    const bashPath = whereBash.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(
        line =>
          line.toLowerCase().endsWith("\\bash.exe") &&
          !line.toLowerCase().includes("\\system32\\") &&
          !line.toLowerCase().includes("\\syswow64\\")
      );
    if (bashPath && existsSync(bashPath)) return bashPath;
  }
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
    runtime.registerNativeProvider(buildPiProvider(setting));
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
}

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
    ...(options.extensionFactories ? { extensionFactories: options.extensionFactories } : {}),
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
  resourceLoader?: ResourceLoader;
  systemPrompt?: string;
  shellPath?: string;
}

export async function assembleHostSession(
  options: AssembleHostSessionOptions
): Promise<AgentSession> {
  const model = options.modelRuntime.getModel(
    options.modelRef.providerId,
    options.modelRef.modelId
  );
  if (!model) {
    throw new Error(`模型未注册：${options.modelRef.providerId}/${options.modelRef.modelId}`);
  }
  const resourceLoader =
    options.resourceLoader ??
    (await createHostResourceLoader({
      cwd: options.cwd,
      agentDir: options.agentDir,
      systemPrompt: options.systemPrompt,
    }));
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir: options.agentDir,
    modelRuntime: options.modelRuntime,
    model,
    sessionManager: options.sessionDir
      ? SessionManager.create(options.cwd, options.sessionDir)
      : SessionManager.inMemory(options.cwd),
    resourceLoader,
    // 无 Git Bash 时不能留默认 bash 工具——pi 的 PATH 搜索会命中 System32\bash.exe（WSL 入口，
    // 路径语义与文件工具断裂且无发行版时全失败），改为 powershell（Windows 原生路径语义一致）。
    // WSL 作为带路径翻译层的手动选项在工具管理（M3）提供。
    settingsManager: SettingsManager.inMemory(
      options.shellPath
        ? { shellPath: options.shellPath }
        : { defaultTools: ["read", "powershell", "edit", "write"] }
    ),
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
