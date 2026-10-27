// @vitest-environment jsdom
import Database from "better-sqlite3";
import * as Y from "yjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { WhiteboardModel, type DocumentSyncSession } from "@tau/collaboration";
import { CollaborationAssetService } from "../../collaboration/asset-service";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { ContentIdentityTable } from "../../tables/content-identity";
import { createServer } from "../../../../../../collaboration-server/src/server";

vi.hoisted(() => {
  Object.defineProperty(window, "electron", { configurable: true, value: {} });
});

/** 真实渲染客户端经 IPC 适配连接主进程与本地服务端路由。 */
const state = vi.hoisted(() => ({
  dir: "",
  store: null as CollaborationLocalStore | null,
  assets: null as CollaborationAssetService | null,
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map<number, string>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  sent: [] as { owner: number; channel: string; data: any }[],
  client: null as any,
  listeners: new Map<string, Set<(event: unknown, payload: unknown) => void>>(),
  failOpen: false,
}));
vi.mock("electron", () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) },
  BrowserWindow: {
    getAllWindows: () => state.windows,
    fromId: (id: number) => state.windows.find(w => w.id === id),
    fromWebContents: (sender: unknown) => state.windows.find(w => w.webContents === sender),
  },
}));
vi.mock("../../collaboration", () => ({
  default: {
    documentClient: () => state.client,
    documentStorage: () => ({
      state: new ContentLocalState(state.store!.db),
      store: state.store,
    }),
    documentAssets: () => state.assets,
    refreshShared: async () => {},
  },
}));
vi.mock("../../database", () => ({
  default: {
    databases: state.databases,
    windowToDatabase: state.windowToDatabase,
    getDatabase: (name: string) => state.databases.get(name),
    onDatabaseConnected: vi.fn(),
  },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => state.dir } }));
vi.mock("../../tables/data-table", () => ({
  default: { incrementRefCount: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../tables/white-board-content", () => ({
  default: { incrementRefCount: vi.fn(), deleteWhiteboard: vi.fn() },
}));

type Server = Awaited<ReturnType<typeof createServer>>;
type Device = { id: string; secret: string; nickname: string };
const cleanup: (() => unknown)[] = [];
let server: Server;
let acting: Device;
let offline = false;
let dropNextPublish = false;
let upgrade = false;

/** 与 CollaborationClient 相同的错误形状：status/code 来自服务端，断网是 TypeError。 */
function client(): any {
  return {
    serverTime: () => Date.now(),
    identity: async () => acting,
    async request(_url: string, path: string, method = "GET", body?: unknown, version?: number) {
      if (offline) throw new TypeError("fetch failed");
      if (upgrade && path.endsWith("/state"))
        throw Object.assign(new Error("请使用支持当前文档协议的客户端"), {
          status: 409,
          code: "CLIENT_UPGRADE_REQUIRED",
        });
      const response = await server.app.inject({
        method: method as "GET",
        url: path,
        headers: {
          authorization: `Bearer ${acting.id}:${acting.secret}`,
          ...(version === undefined ? {} : { "x-tau-document-version": String(version) }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        payload: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = response.json();
      if (response.statusCode >= 400)
        throw Object.assign(new Error(result.message ?? "协作请求失败"), {
          status: response.statusCode,
          code: String(result.code ?? "REQUEST_FAILED"),
        });
      if (dropNextPublish && path.endsWith("/publish")) {
        dropNextPublish = false;
        throw new TypeError("fetch failed");
      }
      return result;
    },
  };
}

interface Side {
  module: { remote: Map<string, Promise<DocumentSyncSession>> };
  device: Device;
  window: number;
  database: string;
  handlers: Map<string, (...args: any[]) => any>;
  db: Database.Database;
  store: CollaborationLocalStore;
  dir: string;
}
async function side(nickname: string, window: number, database: string): Promise<Side> {
  vi.resetModules();
  state.dir = mkdtempSync(join(tmpdir(), `whiteboard-flow-${database}-`));
  state.store = new CollaborationLocalStore(join(state.dir, "collaboration"));
  state.assets = new CollaborationAssetService(state.store, state.dir, async () => acting);
  const db = new Database(":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  state.databases.set(database, db);
  state.windowToDatabase.set(window, database);
  state.handlers.clear();
  const module = (await import("../index")).default as any;
  await module.init();
  const store = state.store,
    dir = state.dir;
  cleanup.push(() => {
    module.sessions.dispose();
    module.sessions.journal.close();
    db.close();
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    module,
    device: server.store.register(nickname),
    window,
    database,
    handlers: new Map(state.handlers),
    db,
    store,
    dir,
  };
}
const call = (side: Side, name: string, ...args: unknown[]) => {
  acting = side.device;
  return side.handlers.get(`whiteboard-document:${name}`)!(
    { sender: state.windows.find(w => w.id === side.window).webContents },
    ...args
  );
};
beforeEach(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "whiteboard-flow-server-"));
  server = await createServer({ dataDir, logger: false });
  await server.app.ready();
  cleanup.push(async () => {
    await server.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  offline = false;
  dropNextPublish = false;
  upgrade = false;
  state.client = client();
  state.sent = [];
  state.databases.clear();
  state.windowToDatabase.clear();
  state.windows = [1, 2].map(id => ({
    id,
    isDestroyed: () => false,
    once: vi.fn(),
    webContents: {
      isDestroyed: () => false,
      on: vi.fn(),
      send: (channel: string, data: unknown) => {
        state.sent.push({ owner: id, channel, data });
        queueMicrotask(() => {
          for (const listener of state.listeners.get(channel) ?? []) listener({}, data);
        });
      },
    },
  }));
});
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { queryClient } from "@/queryClient";
import { DocumentBoardCanvas } from "@/features/whiteboards/components/DocumentBoardCanvas";
import { whiteboardDocumentEntry } from "@/services/whiteboard-documents/registry";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";

vi.mock("@/electron", () => ({
  platform: "web",
  isElectron: false,
  send: vi.fn(),
  invoke: async (channel: string, ...args: unknown[]) => {
    if (state.failOpen && channel === "whiteboard-document:open") throw new Error("重开失败");
    const handler = state.handlers.get(channel);
    if (!handler) throw new Error(`未注册命令：${channel}`);
    return handler({ sender: state.windows[0].webContents }, ...args);
  },
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
    if (!state.listeners.has(channel)) state.listeners.set(channel, new Set());
    state.listeners.get(channel)!.add(listener);
  },
  off: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
    state.listeners.get(channel)?.delete(listener);
  },
}));
vi.mock("@/commands/module-init", () => ({
  withModule: (_name: string, run: () => unknown) => run(),
}));
vi.mock("@/services/whiteboard-documents/outbox", () => ({
  IndexedWhiteboardOutbox: class {
    private rows = new Map<string, any>();
    async list() {
      return [...this.rows.values()];
    }
    async put(row: any) {
      this.rows.set(row.batchId, row);
    }
    async remove(id: string) {
      this.rows.delete(id);
    }
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: (selector: (value: unknown) => unknown) =>
    selector({ setting: { database: { active: "A" } } }),
}));
vi.mock("@/stores/useCollaborationStore", () => {
  const value = {
    serverUrl: "https://collab.test",
    whiteboards: [],
    requests: [],
    deviceId: "owner",
  };
  return {
    default: Object.assign((selector: (v: unknown) => unknown) => selector(value), {
      getState: () => value,
    }),
  };
});
vi.mock("@/page/PageProvider", () => ({ usePage: () => ({ registerLeaveGuard: () => () => {} }) }));
vi.mock("@/features/shared/whiteboard/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const kit = createEditorKit();
  return { getWhiteboardBodyKit: () => kit };
});
vi.mock("@/features/shared/whiteboard/DesktopWhiteboard", async () => {
  const { default: Canvas } = await import("@tau/whiteboard");
  const extensions: never[] = [];
  return {
    default: (props: React.ComponentProps<typeof Canvas>) => (
      <Canvas
        {...props}
        extensions={extensions}
        showToolbar={false}
        showSidebar={false}
        showAttributeSetter={false}
      />
    ),
  };
});
let root: Root | undefined;
beforeEach(() => {
  queryClient.clear();
  state.failOpen = false;
  state.listeners.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
// 先卸载渲染端和租约，再由上面的主进程清理关闭临时数据库。
const disposeUI = async () => {
  if (root)
    await act(async () => {
      root!.unmount();
    });
  root = undefined;
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  queryClient.clear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
};
async function mountBoard(resource?: "video" | "missing") {
  const owner = await side("作者", 1, "A");
  acting = owner.device;
  const documentId = randomUUID();
  const source = new Y.Doc();
  const model = new WhiteboardModel(source);
  const [pageId] = model.submit([{ type: "create_page", title: "页" }], null).createdIds;
  if (resource) {
    const reference = await state.assets!.keepLocalFile(documentId, {
      name: "clip.mp4",
      mime: "video/mp4",
      bytes: new Uint8Array([1, 2]),
    });
    if (resource === "missing")
      rmSync(await state.assets!.resolveReference("", documentId, reference));
    const contract = await prepareWhiteboardContract("example", {
      type: "example.video",
      dataVersion: 1,
      resources: [{ path: "src", kind: "video" }],
    });
    model.submit(
      [
        {
          type: "create",
          contractId: contract.id,
          data: { src: reference },
          geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
          parent: { kind: "page", id: pageId },
        },
      ],
      null,
      [contract]
    );
  }
  const created = await call(
    owner,
    "create",
    "A",
    documentId,
    Y.encodeStateAsUpdate(source),
    "board"
  );
  model.dispose();
  source.destroy();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  cleanup.push(disposeUI);
  await act(async () =>
    root!.render(
      <QueryClientProvider client={queryClient}>
        <DndProvider backend={HTML5Backend}>
          <DocumentBoardCanvas
            contentId={created.contentIds[0]}
            documentId={created.documentId}
            pageId={pageId}
            collaboration
          />
        </DndProvider>
      </QueryClientProvider>
    )
  );
  const entry = whiteboardDocumentEntry(
    { databaseName: "A", contentId: created.contentIds[0] },
    created.documentId
  );
  await vi.waitFor(() => expect(entry.getSnapshot().phase).toBe("ready"));
  await vi.waitFor(() => expect(button("共享")).toBeTruthy());
  return { owner, entry, container, created };
}
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(node => node.textContent === label);
async function publishFromUI() {
  await act(async () => button("共享")!.click());
  await act(async () => button("发起共享")!.click());
}
it("完整链路：弹窗发布、真实客户端回复保存屏障、服务端落库、会话交接与继续编辑", async () => {
  const { owner, entry, container } = await mountBoard();
  const previous = entry.getSnapshot().client!;
  await publishFromUI();
  await vi.waitFor(() => expect(entry.getSnapshot().client).not.toBe(previous));
  expect(entry.getSnapshot().phase).toBe("ready");
  expect(state.sent.some(event => event.channel === "whiteboard-document:drain")).toBe(true);
  expect(state.sent.some(event => event.channel === "whiteboard-document:detached")).toBe(true);
  expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
  expect(container.querySelector("svg[data-whiteboard-canvas]")).toBeTruthy();
  const current = entry.getSnapshot().client!;
  await act(async () => {
    current.model.submit(
      [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "共享后继续编辑" } }],
      {}
    );
    await current.flush();
  });
  expect(call(owner, "snapshot", current.leaseId).revision).toBeGreaterThan(0);
});
it("完整链路：发布响应丢失后按原任务继续，不创建第二个房间", async () => {
  const { entry, container } = await mountBoard();
  const previous = entry.getSnapshot().client!;
  dropNextPublish = true;
  await publishFromUI();
  await vi.waitFor(() => expect(button("继续共享")).toBeTruthy());
  expect(previous.getSnapshot().frozen).toBe(true);
  expect(container.querySelector("svg[data-whiteboard-canvas]")).toBeTruthy();
  await vi.waitFor(() =>
    expect(document.querySelector('[role="dialog"][data-state="open"]')?.textContent).toContain(
      "继续共享"
    )
  );
  const dialog = document.querySelector('[role="dialog"][data-state="open"]')!;
  const resume = [...dialog.querySelectorAll("button")].find(
    node => node.textContent === "继续共享"
  );
  expect(resume).toBeTruthy();
  expect(dialog.textContent).not.toContain("发起共享");
  await act(async () => resume!.click());
  await vi.waitFor(() => expect(entry.getSnapshot().client).not.toBe(previous));
  expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
});
it("完整链路：发布已成功但重开失败，保留只读画布并单独重试会话", async () => {
  const { entry, container } = await mountBoard();
  const previous = entry.getSnapshot().client!;
  const canvas = container.querySelector("svg[data-whiteboard-canvas]");
  state.failOpen = true;
  await publishFromUI();
  await vi.waitFor(() => expect(entry.getSnapshot().phase).toBe("error"));
  expect(container.querySelector("svg[data-whiteboard-canvas]")).toBe(canvas);
  expect(container.textContent).toContain("当前画布只读");
  expect(previous.getSnapshot().frozen).toBe(true);
  state.failOpen = false;
  await act(async () => button("重试")!.click());
  await vi.waitFor(() => expect(entry.getSnapshot().phase).toBe("ready"));
  expect(entry.getSnapshot().client).not.toBe(previous);
  expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
});

it.each(["video", "missing"] as const)(
  "完整链路：%s 资源预检失败不冻结白板、不建房，可继续保存",
  async resource => {
    const { entry, container } = await mountBoard(resource);
    const previous = entry.getSnapshot().client!;
    await publishFromUI();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        resource === "video" ? "本机视频尚不支持" : "资源仅在分享者本机可用"
      )
    );
    expect(state.sent.some(event => event.channel === "whiteboard-document:drain")).toBe(false);
    expect(previous.getSnapshot().frozen).toBe(false);
    expect(container.querySelector("svg[data-whiteboard-canvas]")).toBeTruthy();
    expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 0 });
    await act(async () => {
      previous.model.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "仍可编辑" } }],
        {}
      );
      await previous.flush();
    });
    expect(previous.getSnapshot().phase).toBe("saved");
  }
);

it("完整链路：保存屏障补入的视频在建房前被拒绝，原会话解冻", async () => {
  const { entry, created } = await mountBoard();
  const previous = entry.getSnapshot().client!;
  const reference = await state.assets!.keepLocalFile(created.documentId, {
    name: "late.mp4",
    mime: "video/mp4",
    bytes: new Uint8Array([1]),
  });
  const contract = await prepareWhiteboardContract("example", {
    type: "example.video",
    dataVersion: 1,
    resources: [{ path: "src", kind: "video" }],
  });
  let added = false;
  const unregister = previous.registerInputFlush(() => {
    if (added || !state.sent.some(event => event.channel === "whiteboard-document:drain")) return;
    added = true;
    previous.model.submit(
      [
        {
          type: "create",
          contractId: contract.id,
          data: { src: reference },
          geometry: { x: 0, y: 0, width: 100, height: 80, rotation: 0 },
          parent: { kind: "page", id: previous.model.read().pages[0].id },
        },
      ],
      null,
      [contract]
    );
  });
  try {
    await publishFromUI();
    await vi.waitFor(() => expect(document.body.textContent).toContain("本机视频尚不支持"));
    expect(state.sent.some(event => event.channel === "whiteboard-document:drain")).toBe(true);
    await vi.waitFor(() => expect(previous.getSnapshot().frozen).toBe(false));
    expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 0 });
  } finally {
    unregister();
  }
});
it("完整链路：协作面板渲染失败不卸载画布，文档仍可保存", async () => {
  const { entry, container } = await mountBoard();
  const client = entry.getSnapshot().client!;
  const canvas = container.querySelector("svg[data-whiteboard-canvas]");
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const summary = vi.spyOn(client, "getSummary").mockImplementation(() => {
    throw new Error("面板渲染失败");
  });
  try {
    await act(async () => {
      client.model.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "仍可保存" } }],
        {}
      );
      await client.flush();
    });
    await vi.waitFor(() => expect(container.textContent).toContain("协作面板暂时不可用"));
    expect(container.querySelector("svg[data-whiteboard-canvas]")).toBe(canvas);
    expect(client.getSnapshot().phase).toBe("saved");
    summary.mockRestore();
    await act(async () => {
      for (const node of [...container.querySelectorAll("button")])
        if (node.textContent === "重试") node.click();
    });
    expect(container.textContent).not.toContain("协作面板暂时不可用");
  } finally {
    summary.mockRestore();
    errors.mockRestore();
  }
});

it("完整链路：发布前网络失败可在原弹窗取消任务，恢复编辑且不重开会话", async () => {
  const { entry } = await mountBoard();
  const previous = entry.getSnapshot().client!;
  const failure = vi
    .spyOn(state.assets!, "flush")
    .mockRejectedValueOnce(new TypeError("fetch failed"));
  try {
    await publishFromUI();
    await vi.waitFor(() => expect(button("继续共享")).toBeTruthy());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"][data-state="open"]')?.textContent).toContain(
        "继续共享"
      )
    );
    const dialog = document.querySelector('[role="dialog"][data-state="open"]')!;
    const cancel = [...dialog.querySelectorAll("button")].find(
      node => node.textContent === "取消共享"
    );
    expect(cancel).toBeTruthy();
    expect(previous.getSnapshot().frozen).toBe(true);
    await act(async () => cancel!.click());
    await vi.waitFor(() => expect(previous.getSnapshot().frozen).toBe(false));
    expect(entry.getSnapshot().client).toBe(previous);
    expect(server.store.db.prepare("SELECT status FROM documents").get()).toEqual({
      status: "closed",
    });
    await act(async () => {
      previous.model.submit(
        [{ type: "edit_title", edit: { offset: 0, remove: 0, text: "取消后继续" } }],
        {}
      );
      await previous.flush();
    });
    expect(previous.getSnapshot().phase).toBe("saved");
  } finally {
    failure.mockRestore();
  }
});
