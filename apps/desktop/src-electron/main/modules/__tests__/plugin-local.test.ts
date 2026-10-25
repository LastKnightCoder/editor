// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginWorkspaceRegistry } from "../../services/plugin-registry";

const mock = vi.hoisted(() => ({
  root: "",
  windows: [] as any[],
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openPath: vi.fn(async () => ""),
  download: vi.fn(),
  validateContent: vi.fn(async () => ({ editor: true, whiteboard: false, metrics: [] })),
}));
vi.mock("../../services/content-execution", () => ({
  contentExecutor: { execute: mock.validateContent },
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => mock.windows },
  app: {
    isPackaged: true,
    getPath: () => path.join(mock.root, "profile"),
    getAppPath: () => path.join(mock.root, "app"),
    getVersion: () => "0.59.0",
  },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mock.handlers.set(name, handler),
  },
  shell: { openPath: mock.openPath },
}));
vi.mock("../../services/plugin-center", () => ({
  API_ORIGIN: "https://plugins-api.taunote.app",
  downloadPluginRelease: mock.download,
  fetchPluginCatalog: vi.fn(),
  fetchPluginRelease: vi.fn(),
}));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => path.join(mock.root, ".editor") },
}));
beforeEach(async () => {
  vi.resetModules();
  mock.root = await mkdtemp(path.join(tmpdir(), "tau-local-module-"));
  mock.windows = [];
  mock.handlers.clear();
  mock.openPath.mockClear();
  mock.validateContent.mockClear();
  const module = await import("../plugin-local");
  await module.default.init();
});

it("正式客户端不提供ZIP安装入口，初次启动没有预装插件", async () => {
  await expect(invoke("plugin-local:stage-zip")).rejects.toThrow("插件中心");
  expect(((await invoke("plugin-local:scan")) as { entries: unknown[] }).entries).toEqual([]);
});

it("正式 IPC 安装跨端内容包，启用重启后从原始格式 3 快照装配；错来源不放行", async () => {
  const id = "test.portable";
  const code = "throw new Error('主进程不得执行定义')";
  const manifest = {
    id,
    name: "跨端正文",
    version: "1.0.0",
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    format: "cjs",
    main: "main.js",
    editor: true,
    targets: {
      desktop: {
        minAppVersion: "0.59.0",
        required: ["editor"],
        optional: [],
        elements: { abc: "edit" },
      },
    },
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
  };
  const zip = new AdmZip();
  zip.addFile(`${id}/manifest.json`, Buffer.from(JSON.stringify(manifest)));
  zip.addFile(`${id}/main.js`, Buffer.from(code));
  const bytes = zip.toBuffer();
  const source = {
    kind: "center",
    releaseId: "portable-release",
    pluginId: id,
    version: "1.0.0",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    manifest,
    apiOrigin: "https://plugins-api.taunote.app",
  };
  mock.download.mockResolvedValue({ bytes, source });
  await invoke("plugin-local:stage-release", "portable-release");
  expect(await invoke("plugin-local:scan")).toMatchObject({
    entries: [{ id, enabled: false, artifact: { manifest: { formatVersion: 3 } } }],
  });
  await invoke("plugin-local:set-enabled", id, true);
  vi.resetModules();
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  expect(await invoke("plugin-local:content-startup")).toMatchObject({
    artifacts: [{ manifest: { id, formatVersion: 3 } }],
  });
  await writeFile(
    path.join(mock.root, ".editor/plugin-updates/sources", `${id}.json`),
    JSON.stringify({ ...source, apiOrigin: "https://other.example" })
  );
  expect(await invoke("plugin-local:scan")).toMatchObject({
    entries: [{ id, error: expect.stringContaining("固定插件中心") }],
  });
  await expect(invoke("plugin-local:set-enabled", id, true)).rejects.toThrow("固定插件中心");
});

it("主进程恢复内容快照，将定义校验交给内容渲染进程", async () => {
  const id = "test.editor";
  const folder = path.join(mock.root, ".editor/plugins", id);
  await mkdir(folder);
  const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'${id}',name:'编辑器',version:'1.0.0',editorExtensions:[{id:'${id}',apiVersion:1,elements:[{type:'${id}',kind:'block',render:()=>null}]}],editorCodecs:[{type:'${id}',fence:{language:'native-editor'},serializer:{isBlock:true,toMarkdown:e=>'~~~native-editor\\n'+e.content+'\\n~~~'}}]});`;
  await writeFile(path.join(folder, "main.js"), code);
  await writeFile(
    path.join(folder, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      apiVersion: 1,
      id,
      name: "编辑器",
      version: "1.0.0",
      platform: "desktop",
      format: "cjs",
      editor: true,
      main: "main.js",
      integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    })
  );
  await invoke("plugin-local:set-enabled", id, true);
  expect(await invoke("plugin-local:content-startup")).toMatchObject({ artifacts: [] });
  vi.resetModules();
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  expect(await invoke("plugin-local:content-startup")).toMatchObject({
    artifacts: [{ manifest: { id } }],
  });
  expect(mock.validateContent).toHaveBeenCalledWith(
    { operation: "inspect", id },
    undefined,
    expect.arrayContaining([expect.objectContaining({ manifest: expect.objectContaining({ id }) })])
  );
  expect(
    (await import("../../../../shared/content-plugins.ts")).desktopContentPlugins.codecs
  ).toEqual([]);
  await invoke("plugin-local:set-enabled", id, false);
  expect(await invoke("plugin-local:content-startup")).toMatchObject({
    artifacts: [{ manifest: { id } }],
  });
  vi.resetModules();
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  expect(await invoke("plugin-local:content-startup")).toMatchObject({ artifacts: [] });
  expect(
    (await import("../../../../shared/content-plugins.ts")).desktopContentPlugins.codecs
  ).toEqual([]);
});
afterEach(async () => {
  await rm(mock.root, { recursive: true, force: true });
});
function invoke(name: string, ...args: unknown[]) {
  const handler = mock.handlers.get(name);
  if (!handler) throw new Error("缺少处理器");
  return handler({}, ...args);
}
it("扫描与打开始终使用应用约定目录，不接受调用方路径", async () => {
  const foreign = path.join(mock.root, "foreign");
  await mkdir(foreign);
  await expect(invoke("plugin-local:scan", foreign)).rejects.toThrow("迁移");
  const scan = await invoke("plugin-local:scan", {});
  expect(scan).toMatchObject({
    directory: path.join(mock.root, ".editor/plugins"),
    entries: [],
    clientVersion: "0.59.0",
  });
  await invoke("plugin-local:open-directory", foreign);
  expect(mock.openPath).toHaveBeenCalledWith(path.join(mock.root, ".editor/plugins"));
  mock.openPath.mockResolvedValueOnce("打开失败");
  await expect(invoke("plugin-local:open-directory")).rejects.toThrow("打开失败");
});
it("保留原工作区映射的稳定身份，不按扫描创建新身份", async () => {
  const registry = new PluginWorkspaceRegistry(
    path.join(mock.root, "profile/plugin-development/registry.json")
  );
  const existing = await registry.open("A");
  const first = await invoke("plugin-local:workspace", "A.db");
  expect(first).toBe(existing.id);
  expect(await invoke("plugin-local:workspace", "A")).toBe(first);
  expect(await invoke("plugin-local:workspace", "B")).not.toBe(first);
});
it.each([false, true])("中心版本立即安装且停用，更新保留意图，内容快照=%s", async editor => {
  const id = "test.center";
  const download = (version: string) => {
    const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'${id}',name:'中心插件',version:'${version}',${editor ? "editorExtensions:[{id:'test.center',apiVersion:1,elements:[{type:'test.center.node',kind:'block',render:()=>null}]}]," : ""}create:()=>({activate(){}})});`;
    const archive = new AdmZip();
    archive.addFile(
      `${id}/manifest.json`,
      Buffer.from(
        JSON.stringify({
          formatVersion: 1,
          apiVersion: 1,
          id,
          name: "中心插件",
          version,
          platform: "desktop",
          format: "cjs",
          main: "main.js",
          ...(editor ? { editor: true } : {}),
          integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
        })
      )
    );
    archive.addFile(`${id}/main.js`, Buffer.from(code));
    archive.addFile(`${id}/README.md`, Buffer.from("# 中心插件"));
    const source = {
      kind: "center",
      releaseId: `r-${version}`,
      pluginId: id,
      version,
      sha256: "d",
    };
    mock.download.mockResolvedValueOnce({ bytes: archive.toBuffer(), source });
    return source;
  };
  const source = download("1.0.0");
  expect(await invoke("plugin-local:stage-release", "r1")).toEqual({ id, version: "1.0.0" });
  expect(mock.download).toHaveBeenCalledWith("r1", "0.59.0");
  expect(await invoke("plugin-local:scan", {})).toMatchObject({
    entries: [{ id, source, enabled: false }],
    updates: [],
  });
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  const [entry] = ((await invoke("plugin-local:scan")) as { entries: unknown[] }).entries;
  expect(entry).toMatchObject({ id, source, enabled: false });
  expect(await invoke("plugin-local:content-startup")).toMatchObject({ artifacts: [] });
  await invoke("plugin-local:set-enabled", id, true);
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  const updatedSource = download("1.1.0");
  await invoke("plugin-local:stage-release", "r2");
  expect(await invoke("plugin-local:scan", {})).toMatchObject({
    entries: [
      {
        id,
        enabled: true,
        artifact: { manifest: { version: editor ? "1.0.0" : "1.1.0" } },
        source: editor ? source : updatedSource,
      },
    ],
    updates: [editor ? { pending: true, pendingVersion: "1.1.0" } : { previousVersion: "1.0.0" }],
  });
  await invoke("plugin-local:set-enabled", id, false);
  if (editor) {
    await expect(invoke("plugin-local:uninstall", id)).rejects.toThrow("重启");
    mock.handlers.clear();
    await (await import("../plugin-local")).default.init();
    expect(await invoke("plugin-local:content-startup")).toMatchObject({ artifacts: [] });
  }
  await invoke("plugin-local:uninstall", id);
  expect(((await invoke("plugin-local:scan")) as { entries: unknown[] }).entries).toEqual([]);
});

it("图片宿主先销毁 WebContents 时广播不中断，仍通知存活窗口并结束在途请求", async () => {
  const { pluginImagesRelay } = await import("../../services/plugin-images");
  let destroyed = false;
  const host = Object.assign(new EventEmitter(), {
    id: 701,
    isDestroyed: () => destroyed,
    send: vi.fn(),
  }) as unknown as WebContents;
  const caller = Object.assign(new EventEmitter(), {
    id: 702,
    isDestroyed: () => false,
    send: vi.fn(),
  }) as unknown as WebContents;
  const racing = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(() => {
        throw new Error("Object has been destroyed");
      }),
    },
  };
  const alive = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  };
  mock.windows = [{ isDestroyed: () => false, webContents: host }, racing, alive];
  pluginImagesRelay.connect(host, "generation");
  const pending = pluginImagesRelay.request(caller, "open", {
    kind: "open",
    session: "pending",
    pluginId: "test.images",
    config: {},
    modelId: "image",
  });
  vi.mocked(host.send).mockClear();
  alive.webContents.send.mockClear();
  destroyed = true;
  expect(() => host.emit("destroyed")).not.toThrow();
  expect(host.send).not.toHaveBeenCalled();
  expect(alive.webContents.send).toHaveBeenCalledWith("plugin-images:changed");
  await expect(pending).resolves.toMatchObject({ errorName: "AbortError" });
});
