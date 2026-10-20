import {
  app,
  BrowserWindow,
  ipcMain,
  utilityProcess,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertLocalId } from "@tau/plugins/package";
import { readLocalPluginState } from "@tau/plugins/local-state";
import {
  assertBackendName,
  backendJson,
  BACKEND_SESSION_INVALID,
} from "@tau/plugins/backend-protocol";
import type { JsonValue } from "@tau/plugins";
import type { PluginBackendSnapshot } from "@/types/plugin-backend";
import PathUtil from "../utils/PathUtil";
import databaseModule from "./database";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { readPluginPackage } from "../services/plugin-package";
import { getPluginPermissionStore } from "./plugin-permissions";
import { PluginBackendManager, type BackendDescriptor } from "../services/plugin-backend/manager";
import { runBackendTool } from "../services/plugin-backend/tools";
import { terminateBackendChild } from "../services/plugin-backend/terminate";
import { discoverPlugins } from "../services/plugin-discovery";
import {
  assertBackendSource,
  BackendReleaseGuard,
  type BackendCenterSource,
} from "../services/plugin-backend/release-guard";
import { fetchPluginRelease, PluginCenterError } from "../services/plugin-center";
import { pluginMcpParameters, type PluginStdioConfig } from "../services/plugin-backend/mcp-tool";
import {
  backgroundPreferencesSnapshot,
  updateBackgroundPreferences,
  setBackgroundActivityProbe,
  loadBackgroundPreferences,
} from "../services/background-preferences";

const root = () => path.join(PathUtil.getAppDir(), "plugins");
const releaseGuard = new BackendReleaseGuard(
  () => path.join(app.getPath("userData"), "plugin-backends", "release-status"),
  fetchPluginRelease,
  error => error instanceof PluginCenterError && [404, 410].includes(error.status)
);
const scopeOf = (descriptor: BackendDescriptor) => descriptor.workspaceId ?? "application";
interface Session {
  owner: WebContents;
  descriptor: BackendDescriptor;
  workspaceName: string;
  requests: Map<string, AbortController>;
  events: Map<string, () => void>;
}
const sessions = new Map<string, Session>();
const watched = new Map<number, WebContents>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
interface ExternalTool {
  descriptor: BackendDescriptor;
  controller: AbortController;
  cleanup?: () => Promise<void>;
  finished: Promise<void>;
}
const externalTools = new Set<ExternalTool>();
const updatingPlugins = new Set<string>();
let activeWorkspace: { name: string; id: string } | null = null;
let paused = process.argv.includes("--tau-disable-plugin-backends");
let workspaceRevision = 0;
let activationPending: Promise<void> | undefined;
let activationRequested = false;

export const arePluginBackendsPaused = () => paused;
export const hasRunningPluginBackends = () =>
  pluginBackends.list().some(item => ["running", "starting"].includes(item.status.state));
export async function setPluginBackendsPaused(value: boolean) {
  paused = value;
  for (const timer of retryTimers.values()) clearTimeout(timer);
  retryTimers.clear();
  if (paused) {
    const tools = [...externalTools];
    tools.forEach(tool => tool.controller.abort());
    await Promise.all(tools.map(tool => tool.finished));
    activationRequested = false;
    await activationPending?.catch(() => undefined);
    await Promise.all(pluginBackends.list().map(item => pluginBackends.stop(item.key)));
  } else await activatePluginBackends();
}

export const pluginBackends = new PluginBackendManager({
  runTool: runBackendTool,
  terminate: terminateBackendChild,
  failed(descriptor) {
    if (paused || descriptor.manifest.backend?.lifetime !== "persistent") return;
    const timer = setTimeout(() => {
      retryTimers.delete(descriptor.key);
      if (paused || (descriptor.workspaceId && descriptor.workspaceId !== activeWorkspace?.id))
        return;
      void descriptorFor(descriptor.manifest.id, descriptor.workspaceId ?? "application")
        .then(current => {
          if (current.digest !== descriptor.digest) return;
          return pluginBackends.start(current);
        })
        .catch(() => undefined);
    }, 5000);
    clearTimeout(retryTimers.get(descriptor.key));
    retryTimers.set(descriptor.key, timer);
  },
  spawn(descriptor) {
    const env: Record<string, string> = {};
    for (const key of [
      "PATH",
      "HOME",
      "USERPROFILE",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "TMPDIR",
      "LANG",
      "LC_ALL",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    return utilityProcess.fork(path.join(__dirname, "plugin-backend-worker.js"), [], {
      cwd: descriptor.cwd,
      env,
      execArgv: [],
      stdio: "ignore",
      serviceName: `Tau Plugin ${descriptor.manifest.id}`,
    });
  },
  authorized: backendAllowed,
});

async function backendAllowed(descriptor: BackendDescriptor): Promise<boolean> {
  if (paused || updatingPlugins.has(descriptor.manifest.id)) return false;
  const state = await readLocalPluginState(root());
  const granted = await getPluginPermissionStore().backendGranted(
    descriptor.manifest.id,
    scopeOf(descriptor),
    descriptor.digest
  );
  const allowed =
    !paused &&
    (!descriptor.workspaceId || descriptor.workspaceId === activeWorkspace?.id) &&
    state.enabled[descriptor.manifest.id] === true &&
    granted;
  if (allowed && descriptor.source && !(await releaseGuard.check(descriptor.source))) {
    await stopPluginBackend(descriptor.manifest.id);
    throw new Error("该中心版本已撤回、下架或审核记录失效，后台已停止");
  }
  if (allowed) await mkdir(descriptor.cwd, { recursive: true, mode: 0o700 });
  return allowed && !paused && !updatingPlugins.has(descriptor.manifest.id);
}

export async function protectPluginBackendChange<T>(
  id: string,
  update: () => Promise<T>,
  interrupt = false
): Promise<T> {
  if (updatingPlugins.has(id)) throw new Error("插件后台正在更新");
  if (
    !interrupt &&
    (pluginBackends.hasWork(id) ||
      [...externalTools].some(tool => tool.descriptor.manifest.id === id))
  )
    throw new Error("插件后台仍有任务或订阅，请完成任务或在插件详情撤销后台授权后更新");
  updatingPlugins.add(id);
  try {
    return await update();
  } finally {
    updatingPlugins.delete(id);
  }
}

export async function authorizePluginMcp(
  event: IpcMainInvokeEvent,
  id: string,
  transport: PluginStdioConfig
) {
  const workspace = await identity(event);
  const descriptor = await descriptorFor(id, workspace.workspaceId);
  const parameters = pluginMcpParameters(descriptor, transport);
  const controller = new AbortController();
  const tool: ExternalTool = { descriptor, controller, finished: Promise.resolve() };
  externalTools.add(tool);
  const dispose = () => {
    externalTools.delete(tool);
    controller.abort();
  };
  controller.signal.addEventListener(
    "abort",
    () => {
      externalTools.delete(tool);
      tool.finished = Promise.resolve().then(() => tool.cleanup?.());
      void tool.finished.catch(() => undefined);
    },
    { once: true }
  );
  const validate = async () => {
    controller.signal.throwIfAborted();
    const currentWorkspace = await identity(event);
    const current = await descriptorFor(id, workspace.workspaceId);
    if (
      currentWorkspace.workspaceId !== workspace.workspaceId ||
      current.digest !== descriptor.digest ||
      !(await backendAllowed(descriptor))
    ) {
      dispose();
      throw new Error("插件 MCP 的版本、工作区或后台授权已经失效");
    }
    controller.signal.throwIfAborted();
  };
  try {
    await validate();
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    parameters,
    validate,
    dispose,
    signal: controller.signal,
    onClose: (cleanup: () => Promise<void>) => {
      controller.signal.throwIfAborted();
      tool.cleanup = cleanup;
    },
  };
}

export function activatePluginBackends(): Promise<void> {
  activationRequested = true;
  return (activationPending ??= (async () => {
    while (activationRequested && !paused) {
      activationRequested = false;
      await activateAutomaticPass();
    }
  })().finally(() => {
    activationPending = undefined;
  }));
}

async function activateAutomaticPass() {
  if (paused) return;
  const revision = workspaceRevision;
  const state = await readLocalPluginState(root());
  const scan = await discoverPlugins(root(), app.getVersion());
  for (const entry of scan.entries) {
    if (paused || revision !== workspaceRevision) return;
    const backend = entry.artifact?.manifest.backend;
    if (!backend || !state.enabled[entry.id] || backend.activation === "on-demand") continue;
    if (backend.scope === "workspace" && !activeWorkspace) continue;
    try {
      const descriptor = await descriptorFor(entry.id, activeWorkspace?.id ?? "application");
      if (paused || revision !== workspaceRevision) return;
      if (
        await getPluginPermissionStore().backendGranted(
          entry.id,
          scopeOf(descriptor),
          descriptor.digest
        )
      )
        await pluginBackends.start(descriptor);
    } catch {
      /* 独立失败状态由管理器保留，不阻断其余后台启动。 */
    }
  }
}

async function changeWorkspace(name: string | null) {
  const revision = ++workspaceRevision;
  const previous = activeWorkspace;
  activeWorkspace = null;
  const tools = [...externalTools];
  tools.forEach(tool => tool.controller.abort());
  await Promise.all(tools.map(tool => tool.finished));
  for (const [token, session] of sessions)
    if (session.descriptor.workspaceId || session.workspaceName !== name) closeSession(token);
  if (previous) {
    for (const item of pluginBackends.list())
      if (item.workspaceId === previous.id) {
        getPluginPermissionStore().clearBackendSession(item.pluginId, previous.id);
        clearTimeout(retryTimers.get(item.key));
        retryTimers.delete(item.key);
        await pluginBackends.stop(item.key);
      }
  }
  if (!name || !databaseModule.getDatabase(name) || revision !== workspaceRevision) return;
  const workspace = await getPluginRegistry().open(name);
  if (revision !== workspaceRevision) return;
  activeWorkspace = { name, id: workspace.id };
  await activatePluginBackends();
}

async function descriptorFor(id: string, workspaceId: string): Promise<BackendDescriptor> {
  assertLocalId(id);
  const directory = await realpath(path.join(root(), id));
  const artifact = await readPluginPackage(directory, app.getVersion());
  const { manifest } = artifact;
  if (manifest.id !== id || !manifest.backend) throw new Error("插件未声明后台");
  const target = await realpath(path.join(directory, manifest.backend.entry));
  const relative = path.relative(directory, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("后台入口越界");
  const bytes = await readFile(target);
  if (
    createHash("sha256").update(bytes).digest("hex") !== manifest.integrity[manifest.backend.entry]
  )
    throw new Error("后台产物已经变化");
  const source = await readFile(
    path.join(path.dirname(root()), "plugin-updates/sources", `${id}.json`),
    "utf8"
  ).catch(error => {
    if (error.code === "ENOENT") return "local";
    throw error;
  });
  const digest = createHash("sha256")
    .update(JSON.stringify({ directory, manifest, source }))
    .digest("hex");
  let centerSource: BackendCenterSource | undefined;
  if (source !== "local") {
    const parsed: unknown = JSON.parse(source);
    assertBackendSource(parsed, id, manifest.version);
    centerSource = parsed;
  }
  const workspace = manifest.backend.scope === "workspace" ? workspaceId : null;
  const scope = workspace ?? "application";
  const cwd = path.join(app.getPath("userData"), "plugin-backends", id, scope);
  return {
    source: centerSource,
    key: `${id}:${scope}`,
    digest,
    manifest,
    workspaceId: workspace,
    code: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    cwd,
  };
}

function ownerWindow(event: IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error("后台调用窗口无效");
  return window;
}
async function identity(event: IpcMainInvokeEvent) {
  const window = ownerWindow(event);
  const name = databaseModule.windowToDatabase.get(window.id);
  if (!name || !databaseModule.getDatabase(name)) throw new Error("工作区尚未就绪");
  const workspaceId = (await getPluginRegistry().open(name)).id;
  if (event.sender.isDestroyed() || databaseModule.windowToDatabase.get(window.id) !== name)
    throw new Error("工作区会话已失效");
  return { name, workspaceId };
}
function closeSession(token: string) {
  const session = sessions.get(token);
  if (!session) return;
  sessions.delete(token);
  if (!session.owner.isDestroyed()) session.owner.send("plugin-backend:invalidated", { token });
  for (const controller of session.requests.values()) controller.abort();
  for (const release of session.events.values()) release();
}
function ownedSession(event: IpcMainInvokeEvent, token: string) {
  const session = sessions.get(token);
  const window = ownerWindow(event);
  if (
    !session ||
    session.owner !== event.sender ||
    databaseModule.windowToDatabase.get(window.id) !== session.workspaceName
  ) {
    if (session?.owner === event.sender) closeSession(token);
    throw new Error(`${BACKEND_SESSION_INVALID}后台连接已失效`);
  }
  return session;
}

export async function stopPluginBackend(id: string) {
  const tools = [...externalTools].filter(tool => tool.descriptor.manifest.id === id);
  tools.forEach(tool => tool.controller.abort());
  await Promise.all(tools.map(tool => tool.finished));
  for (const item of pluginBackends.list())
    if (item.pluginId === id) {
      clearTimeout(retryTimers.get(item.key));
      retryTimers.delete(item.key);
    }
  for (const [token, session] of sessions)
    if (session.descriptor.manifest.id === id) closeSession(token);
  getPluginPermissionStore().clearBackendSession(id);
  await pluginBackends.stopPlugin(id);
}

export default {
  name: "plugin-backend",
  async init() {
    await loadBackgroundPreferences();
    setBackgroundActivityProbe(hasRunningPluginBackends);
    ipcMain.handle("plugin-backend:preferences", () => backgroundPreferencesSnapshot());
    ipcMain.handle("plugin-backend:set-preferences", (event, patch) => {
      if (!ownerWindow(event).isFocused()) throw new Error("请在前台设置页更改后台运行设置");
      return updateBackgroundPreferences(patch);
    });
    databaseModule.onDatabaseConnected(name => {
      void changeWorkspace(name).catch(() => undefined);
    });
    if (databaseModule.getCurrentDatabase())
      await changeWorkspace(databaseModule.getCurrentDatabaseName());
    else void activatePluginBackends().catch(() => undefined);
    const workspaceMonitor = setInterval(() => {
      if (activeWorkspace && !databaseModule.getDatabase(activeWorkspace.name))
        void changeWorkspace(null).catch(() => undefined);
    }, 1000);
    workspaceMonitor.unref();
    let releaseCheckRunning = false;
    const releaseMonitor = setInterval(() => {
      if (releaseCheckRunning || paused) return;
      releaseCheckRunning = true;
      void (async () => {
        for (const tool of externalTools) {
          try {
            if (!(await backendAllowed(tool.descriptor)))
              await stopPluginBackend(tool.descriptor.manifest.id);
          } catch {
            await stopPluginBackend(tool.descriptor.manifest.id);
          }
        }
        for (const item of pluginBackends.list()) {
          if (!["starting", "running"].includes(item.status.state)) continue;
          try {
            const descriptor = await descriptorFor(
              item.pluginId,
              item.workspaceId ?? "application"
            );
            if (descriptor.source && !(await releaseGuard.check(descriptor.source)))
              await stopPluginBackend(item.pluginId);
          } catch {
            await stopPluginBackend(item.pluginId);
          }
        }
      })()
        .catch(() => console.warn("插件后台发布状态巡检失败"))
        .finally(() => {
          releaseCheckRunning = false;
        });
    }, 60000);
    releaseMonitor.unref();
    pluginBackends.subscribe((key, event, value) => {
      for (const [token, session] of sessions)
        if (
          session.descriptor.key === key &&
          session.events.has(event) &&
          !session.owner.isDestroyed()
        )
          session.owner.send("plugin-backend:event", { token, event, value });
    });
    app.once("quit", () => {
      clearInterval(workspaceMonitor);
      clearInterval(releaseMonitor);
      for (const timer of retryTimers.values()) clearTimeout(timer);
      pluginBackends.forceDispose();
    });
    ipcMain.handle(
      "plugin-backend:snapshot",
      async (event, id: string): Promise<PluginBackendSnapshot> => {
        const workspace = await identity(event);
        const descriptor = await descriptorFor(id, workspace.workspaceId);
        const authorized = await getPluginPermissionStore().backendGranted(
          id,
          scopeOf(descriptor),
          descriptor.digest
        );
        const executionAvailable =
          !descriptor.source || (await releaseGuard.check(descriptor.source));
        if (!executionAvailable) await stopPluginBackend(id);
        const status = !executionAvailable
          ? { state: "blocked" as const, error: "该中心版本已撤回、下架或审核记录失效" }
          : authorized
            ? pluginBackends.state(descriptor.key)
            : { state: "blocked" as const };
        const metrics = status.pid
          ? app.getAppMetrics().find(item => item.pid === status.pid)
          : undefined;
        if (metrics)
          status.resources = {
            cpuPercent: metrics.cpu.percentCPUUsage,
            memoryKiB: metrics.memory.workingSetSize,
          };
        return {
          systemReviewed: descriptor.source?.systemReviewed === true,
          executionAvailable,
          pluginId: id,
          version: descriptor.manifest.version,
          digest: descriptor.digest,
          backend: descriptor.manifest.backend!,
          enabled: (await readLocalPluginState(root())).enabled[id] === true,
          authorized,
          status,
        };
      }
    );
    ipcMain.handle(
      "plugin-backend:grant",
      async (event, id: string, expected: string, decision: "once" | "always" | null) => {
        if (!ownerWindow(event).isFocused()) throw new Error("请在前台插件管理页处理后台授权");
        const workspace = await identity(event);
        const descriptor = await descriptorFor(id, workspace.workspaceId);
        if (expected !== descriptor.digest) throw new Error("插件版本已变化，请重新查看后台声明");
        await protectPluginBackendChange(
          id,
          async () => {
            await stopPluginBackend(id);
            await getPluginPermissionStore().setBackend(
              id,
              scopeOf(descriptor),
              descriptor.digest,
              decision
            );
          },
          true
        );
        if (decision) {
          await activatePluginBackends();
          for (const owner of watched.values())
            if (!owner.isDestroyed()) owner.send("plugin-backend:available", { pluginId: id });
        }
      }
    );
    ipcMain.handle(
      "plugin-backend:connect",
      async (event, id: string, expectedWorkspace: string) => {
        if ([...sessions.values()].filter(session => session.owner === event.sender).length >= 64)
          throw new Error("后台连接数量超限");
        const workspace = await identity(event);
        if (workspace.workspaceId !== expectedWorkspace) throw new Error("插件工作区已切换");
        const descriptor = await descriptorFor(id, workspace.workspaceId);
        const token = randomUUID();
        const current = await identity(event);
        if (current.workspaceId !== workspace.workspaceId) throw new Error("工作区会话已失效");
        sessions.set(token, {
          owner: event.sender,
          descriptor,
          workspaceName: workspace.name,
          requests: new Map(),
          events: new Map(),
        });
        if (!watched.has(event.sender.id)) {
          watched.set(event.sender.id, event.sender);
          const close = () => {
            for (const [token, session] of sessions)
              if (session.owner === event.sender) closeSession(token);
          };
          event.sender.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
            if (mainFrame) close();
          });
          event.sender.once("destroyed", () => {
            close();
            watched.delete(event.sender.id);
          });
        }
        return token;
      }
    );
    ipcMain.handle(
      "plugin-backend:call",
      async (event, token: string, requestId: string, method: string, input: JsonValue) => {
        const session = ownedSession(event, token);
        if (
          typeof requestId !== "string" ||
          requestId.length > 128 ||
          session.requests.has(requestId)
        )
          throw new Error("后台请求标识无效");
        const controller = new AbortController();
        if (session.requests.size >= 128) throw new Error("后台请求队列已满");
        session.requests.set(requestId, controller);
        try {
          const current = await descriptorFor(
            session.descriptor.manifest.id,
            session.descriptor.workspaceId ?? "application"
          );
          if (current.digest !== session.descriptor.digest)
            throw new Error("后台版本已切换，请重新加载插件");
          controller.signal.throwIfAborted();
          const result = await pluginBackends.call(
            session.descriptor,
            method,
            backendJson(input),
            controller.signal
          );
          ownedSession(event, token);
          controller.signal.throwIfAborted();
          return result;
        } finally {
          session.requests.delete(requestId);
        }
      }
    );
    ipcMain.handle("plugin-backend:cancel", (event, token: string, requestId: string) => {
      ownedSession(event, token).requests.get(requestId)?.abort();
    });
    ipcMain.handle(
      "plugin-backend:subscribe",
      async (event, token: string, name: string, enabled: boolean) => {
        assertBackendName(name);
        if (typeof enabled !== "boolean") throw new Error("后台订阅状态无效");
        const session = ownedSession(event, token);
        if (!enabled) {
          session.events.get(name)?.();
          session.events.delete(name);
          return;
        }
        if (!session.events.has(name)) {
          if (session.events.size >= 64) throw new Error("后台事件订阅数量超限");
          session.events.set(name, pluginBackends.retain(session.descriptor.key));
        }
        try {
          await pluginBackends.start(session.descriptor);
          ownedSession(event, token);
        } catch (error) {
          session.events.get(name)?.();
          session.events.delete(name);
          throw error;
        }
      }
    );
    ipcMain.handle("plugin-backend:state", (event, token: string) =>
      pluginBackends.state(ownedSession(event, token).descriptor.key)
    );
    ipcMain.handle("plugin-backend:disconnect", (event, token: string) => {
      ownedSession(event, token);
      closeSession(token);
    });
    ipcMain.handle("plugin-backend:restart", async (event, id: string) => {
      const workspace = await identity(event);
      const descriptor = await descriptorFor(id, workspace.workspaceId);
      await pluginBackends.stop(descriptor.key);
      pluginBackends.resetFailure(descriptor.key);
      await pluginBackends.start(descriptor);
    });
  },
};
