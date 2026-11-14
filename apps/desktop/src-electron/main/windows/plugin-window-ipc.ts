import { BrowserWindow, ipcMain, webContents, type IpcMainInvokeEvent } from "electron";
import { assertLocalId } from "@tau/plugins/host";
import { getThemeRegistry, resolveThemePreference, themeRuntimeConfig } from "@tau/themes";
import {
  SYSTEM_APPEARANCE,
  windowChannel,
  type MainWindowCalls,
  type PluginWindowCalls,
  type ThemePreference,
} from "../../../shared/plugin-window-protocol";
import type { DesktopPluginPackage } from "../../../shared/plugin-package";
import {
  pluginWindowPackageKey,
  readWindowOptions,
  readWindowParams,
  windowStateName,
} from "../../../shared/plugin-window-values";
import { readWindowFont } from "../../../shared/window-font";
import database from "../modules/database";
import userSetting from "../modules/user-setting";
import { getPluginRegistry } from "../services/plugin-workspaces";
import { isMainWindow } from "./main-window";
import {
  PluginWindowCommunication,
  windowJson,
  type EndpointIdentity,
} from "./plugin-window-communication";
import { PluginWindows } from "./plugin-windows";

let readPackage: ((id: string, packageKey: string) => Promise<DesktopPluginPackage>) | undefined;
let quitting = false;
const generations = new Map<string, number>();
const watched = new Set<number>();
const pluginAppearance = { scope: "app", key: SYSTEM_APPEARANCE } as const;
let theme: ThemePreference = {
  themeId: themeRuntimeConfig().defaultTheme,
  appearance: themeRuntimeConfig().defaultAppearance,
};
let font: ReturnType<typeof readWindowFont> | undefined;
let fontLoading: Promise<void> | undefined;

const communication = new PluginWindowCommunication((caller, event, payload) => {
  const sender = webContents.fromId(caller.webContentsId);
  if (!sender || sender.isDestroyed() || caller.databaseName !== database.getCurrentDatabaseName())
    return false;
  try {
    const frame = sender.mainFrame;
    if (documentId(frame) !== caller.documentId) return false;
    frame.send(windowChannel(event), payload);
    return true;
  } catch {
    return false;
  }
});

const manager = new PluginWindows(communication, async (id, packageKey) => {
  if (!readPackage) throw new Error("插件管理尚未就绪");
  return readPackage(id, packageKey);
});

export function configurePluginWindowPackages(reader: NonNullable<typeof readPackage>) {
  readPackage = reader;
}

export function revokePluginWindows(pluginId: string) {
  generations.set(pluginId, (generations.get(pluginId) ?? 0) + 1);
  manager.revoke(identity => identity.pluginId === pluginId);
  communication.clearPlugin(pluginId);
}

export function disposePluginWindows() {
  quitting = true;
  manager.revoke(() => true);
  communication.dispose();
}

function documentId(frame: Electron.WebFrameMain) {
  return `${frame.processId}:${frame.routingId}`;
}

function frameIdentity(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (quitting || !frame || frame !== event.sender.mainFrame)
    throw new Error("插件窗口请求来源无效");
  return { webContentsId: event.sender.id, documentId: documentId(frame) };
}

function mainWindow(event: IpcMainInvokeEvent) {
  frameIdentity(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !isMainWindow(win)) throw new Error("此调用仅适用于主窗口");
  return win;
}

function ownedEndpoint(event: IpcMainInvokeEvent, token: string) {
  const frame = frameIdentity(event);
  const endpoint = communication.identity(token);
  const { caller } = endpoint;
  if (
    caller.webContentsId !== frame.webContentsId ||
    caller.documentId !== frame.documentId ||
    caller.databaseName !== database.getCurrentDatabaseName()
  )
    throw new Error("窗口通信端点不属于当前文档或工作区");
  if (
    !endpoint.instance &&
    database.windowToDatabase.get(mainWindow(event).id) !== caller.databaseName
  )
    throw new Error("窗口工作区已变化");
  return endpoint;
}

function pluginAddress(endpoint: EndpointIdentity, key: string) {
  return {
    scope: "plugin" as const,
    workspaceId: endpoint.caller.workspaceId,
    pluginId: endpoint.pluginId,
    key: windowStateName(key),
  };
}

function publishAppearance() {
  if (font) communication.publish(pluginAppearance, { ...theme, font });
}

function ensureAppearance() {
  if (font) return Promise.resolve();
  return (fontLoading ??= userSetting
    .getSettingSnapshot()
    .then(settings => {
      font ??= readWindowFont(settings.fontSetting);
      publishAppearance();
    })
    .finally(() => {
      fontLoading = undefined;
    }));
}

type Calls = MainWindowCalls & PluginWindowCalls;
function handle<K extends keyof Calls>(
  method: K,
  run: (event: IpcMainInvokeEvent, input: Calls[K][0]) => Calls[K][1] | Promise<Calls[K][1]>
) {
  ipcMain.handle(windowChannel(method), run);
}

export function registerPluginWindowIpc() {
  userSetting.onSettingChanged(({ newSetting }) => {
    font = readWindowFont(newSetting.fontSetting);
    publishAppearance();
  });
  let lastWorkspace: string | undefined;
  let workspaceGeneration = 0;
  database.onDatabaseChange(() => {
    workspaceGeneration++;
    manager.revoke(() => true);
    if (lastWorkspace) communication.clearWorkspace(lastWorkspace);
    lastWorkspace = undefined;
  });
  handle("publishTheme", (event, preference) => {
    mainWindow(event);
    if (
      !getThemeRegistry().has(preference.themeId) ||
      !["light", "dark", "system"].includes(preference.appearance)
    )
      throw new Error("窗口主题偏好无效");
    const normalized = resolveThemePreference(
      preference.themeId,
      preference.appearance,
      false,
      themeRuntimeConfig()
    );
    theme = { themeId: normalized.theme, appearance: normalized.appearance };
    publishAppearance();
  });
  handle("attachEndpoint", async (event, { pluginId, packageKey, workspaceId }) => {
    assertLocalId(pluginId);
    const win = mainWindow(event);
    const frame = frameIdentity(event);
    const databaseName = database.windowToDatabase.get(win.id);
    if (!databaseName || databaseName !== database.getCurrentDatabaseName())
      throw new Error("当前窗口资料库尚未就绪");
    if (!readPackage) throw new Error("插件管理尚未就绪");
    const generation = generations.get(pluginId);
    const expectedWorkspace = workspaceGeneration;
    const [key, workspace] = await Promise.all([
      readPackage(pluginId, packageKey).then(pluginWindowPackageKey),
      getPluginRegistry().open(databaseName),
      ensureAppearance(),
    ]);
    if (
      workspace.id !== workspaceId ||
      key !== packageKey ||
      documentId(event.sender.mainFrame) !== frame.documentId ||
      database.windowToDatabase.get(win.id) !== databaseName ||
      database.getCurrentDatabaseName() !== databaseName ||
      generations.get(pluginId) !== generation ||
      workspaceGeneration !== expectedWorkspace ||
      quitting
    )
      throw new Error("插件窗口端点对应的版本或工作区已变化");
    lastWorkspace = workspaceId;
    if (!watched.has(event.sender.id)) {
      const sender = event.sender;
      const id = sender.id;
      watched.add(id);
      const release = () => {
        for (const endpoint of communication.tokensFor(id)) manager.detachEndpoint(endpoint);
      };
      sender.on("did-start-navigation", details => {
        if (details.isMainFrame && !details.isSameDocument) release();
      });
      sender.on("render-process-gone", release);
      sender.once("destroyed", () => {
        release();
        watched.delete(id);
      });
    }
    const endpoint = communication.attach({
      caller: { ...frame, databaseName, workspaceId },
      pluginId,
      packageKey,
    });
    return {
      endpoint,
      appearance: communication.read(pluginAppearance) as Awaited<
        MainWindowCalls["attachEndpoint"][1]
      >["appearance"],
    };
  });
  handle("endpointReady", (event, { endpoint }) => {
    mainWindow(event);
    ownedEndpoint(event, endpoint);
    communication.setOnline(endpoint);
  });
  handle("detachEndpoint", (event, { endpoint }) => {
    if (!communication.lookup(endpoint)) return;
    ownedEndpoint(event, endpoint);
    manager.detachEndpoint(endpoint);
  });
  handle("open", (event, input) => {
    mainWindow(event);
    ownedEndpoint(event, input.endpoint);
    assertLocalId(input.windowId);
    if (typeof input.title !== "string" || !input.title.trim()) throw new Error("窗口标题无效");
    return manager.open({
      endpoint: input.endpoint,
      windowId: input.windowId,
      title: input.title,
      options: readWindowOptions(input.options),
      params: readWindowParams(input.params),
    });
  });
  handle("close", (event, { endpoint, instanceId }) => {
    mainWindow(event);
    ownedEndpoint(event, endpoint);
    return manager.close(endpoint, instanceId);
  });
  handle("bootstrap", event => {
    const frame = frameIdentity(event);
    return manager.bootstrap(frame.webContentsId, frame.documentId);
  });
  handle("ready", (event, { revision }) =>
    manager.ready(frameIdentity(event).webContentsId, revision)
  );
  handle("failed", event => manager.fail(frameIdentity(event).webContentsId));
  handle("closeSelf", event => manager.closeSelf(frameIdentity(event).webContentsId));
  handle("getState", (event, { endpoint, key }) =>
    communication.read(pluginAddress(ownedEndpoint(event, endpoint), key))
  );
  handle("setState", (event, { endpoint, key, value }) =>
    communication.publish(pluginAddress(ownedEndpoint(event, endpoint), key), windowJson(value))
  );
  handle("subscribeState", (event, { endpoint, key }) =>
    communication.subscribe(endpoint, pluginAddress(ownedEndpoint(event, endpoint), key))
  );
  handle("unsubscribeState", (event, { endpoint, key }) =>
    communication.unsubscribe(endpoint, pluginAddress(ownedEndpoint(event, endpoint), key))
  );
  handle("sendMessage", (event, { endpoint, target, name, payload }) => {
    ownedEndpoint(event, endpoint);
    if (target !== "main" && target !== "all") {
      if (!target || typeof target !== "object") throw new Error("窗口消息目标无效");
      assertLocalId(target.windowId);
      target = { windowId: target.windowId };
    }
    return communication.send({
      endpoint,
      target,
      name: windowStateName(name),
      payload: windowJson(payload),
    });
  });
}
