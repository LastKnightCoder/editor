// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createNodeDocument } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { CollaborationLocalStore } from "../local-store";
import { ContentLocalState } from "../content-local-state";
import { registerCollaborationIpc } from "../ipc-controller";
import type { CollaborationIpcContext, RuntimeSession } from "../types";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: any[]) => any) => handlers.set(key, handler),
  },
  BrowserWindow: { fromWebContents: (sender: { id: number }) => sender },
  app: {},
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run());
  handlers.clear();
});

it("本机视图经真实 IPC 和协作库保存，重开保留且不产生文档增量", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-node-view-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  let cache = new CollaborationLocalStore(directory),
    state = new ContentLocalState(cache.db);
  cleanup.push(() => cache.db.close());
  const definition = await prepareContentContract("tau.tabs", {
    type: "tabs",
    kind: "block",
    dataVersion: 1,
  });
  const doc = await createNodeDocument(
    { documentId: "room", baselineId: "base", epoch: 1 },
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "tabs", collabId: "tabs", tauContract: definition.id, children: [{ text: "" }] },
      ],
    },
    { [definition.id]: definition.contract }
  );
  const awareness = new Awareness(doc);
  cleanup.push(() => {
    awareness.destroy();
    doc.destroy();
  });
  const session = {
    doc,
    awareness,
    info: {
      id: "room",
      mode: "local",
      source: { databaseName: "library", contentDocumentId: "stable" },
    },
  } as RuntimeSession;
  const context = {
    store: cache,
    contentState: state,
    views: new Map(),
    requireSession: () => session,
    databaseForEvent: () => ({ name: "library" }),
    state: () => ({ nickname: "作者", deviceId: "device" }),
  } as unknown as CollaborationIpcContext;
  registerCollaborationIpc(context);
  const event = { sender: { id: 1 } };
  handlers.get("collaboration:subscribe")!(event, "room", "view");
  const before = Y.encodeStateAsUpdate(doc);
  expect(handlers.has("collaboration:private-node")).toBe(false);
  expect(handlers.has("collaboration:set-tab-active")).toBe(false);
  expect(
    handlers.get("collaboration:node-view")!(event, "view", "tabs", { activeKey: "second" })
  ).toEqual({ activeKey: "second" });
  expect(() =>
    handlers.get("collaboration:node-view")!({ sender: { id: 2 } }, "view", "tabs", {
      activeKey: "other",
    })
  ).toThrow("视图");
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  cache.db.close();
  cache = new CollaborationLocalStore(directory);
  state = new ContentLocalState(cache.db);
  context.store = cache;
  context.contentState = state;
  registerCollaborationIpc(context);
  expect(handlers.get("collaboration:subscribe")!(event, "room", "next").nodeViews).toEqual({
    tabs: { activeKey: "second" },
  });
});

it("共享资源转换绑定视图，公网地址不触发上传，本地资产排队且迟到结果不放行", async () => {
  const session = {
    info: {
      id: "room",
      mode: "shared",
      role: "owner",
      serverUrl: "https://collab.test",
      status: "active",
    },
    provider: { detach: vi.fn() },
  } as unknown as RuntimeSession;
  const view = { documentId: "room", windowId: 1 };
  const shareReference = vi.fn(
    async (_server: string, _document: string, reference: string) => reference
  );
  const hasPending = vi.fn(() => false);
  const enqueue = vi.fn(async () => "tau-collab-asset:member");
  const keepLocalFile = vi.fn(async () => "tau-collab-local:video");
  const flushResources = vi.fn(async () => {});
  const context = {
    store: {},
    views: new Map([["view", view]]),
    requireSession: () => session,
    findSession: () => session,
    assets: { shareReference, hasPending, enqueue, keepLocalFile },
    changed: vi.fn(),
    flushResources,
  } as unknown as CollaborationIpcContext;
  registerCollaborationIpc(context);
  expect(handlers.has("collaboration:upload-resource")).toBe(false);
  const prepare = handlers.get("collaboration:prepare-resource")!;
  const event = { sender: { id: 1 } };
  const remote = "https://images.test/compressed.webp";
  await expect(prepare({ sender: { id: 2 } }, "view", remote)).rejects.toThrow("视图");
  expect(shareReference).not.toHaveBeenCalled();
  await expect(prepare(event, "view", remote)).resolves.toBe(remote);
  expect(flushResources).not.toHaveBeenCalled();
  expect(session.provider!.detach).not.toHaveBeenCalled();

  const local = "~/.editor/resources/compressed.webp";
  shareReference.mockResolvedValueOnce("tau-collab-asset:queued");
  hasPending.mockReturnValueOnce(true);
  await expect(prepare(event, "view", local)).resolves.toBe("tau-collab-asset:queued");
  expect(shareReference).toHaveBeenLastCalledWith("https://collab.test", "room", local, "", true);
  expect(session.provider!.detach).toHaveBeenCalledTimes(1);
  expect(flushResources).toHaveBeenCalledTimes(1);

  session.info.role = "editor";
  await expect(prepare(event, "view", remote)).rejects.toThrow("成员图片");
  const file = { name: "member.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) };
  await expect(
    handlers.get("collaboration:upload-shared-resource")!(event, "view", file)
  ).resolves.toBe("tau-collab-asset:member");
  expect(enqueue).toHaveBeenCalledWith("room", file);
  session.info.role = "owner";
  await expect(
    handlers.get("collaboration:upload-shared-resource")!(event, "view", file)
  ).rejects.toThrow("作者图片");
  const video = { ...file, name: "clip.mp4", mime: "video/mp4" };
  await expect(
    handlers.get("collaboration:upload-shared-resource")!(event, "view", video)
  ).resolves.toBe("tau-collab-local:video");
  expect(keepLocalFile).toHaveBeenCalledWith("room", video);
  expect(enqueue).toHaveBeenCalledTimes(1);

  shareReference.mockImplementationOnce(async () => {
    context.views.delete("view");
    return "tau-collab-asset:late";
  });
  await expect(prepare(event, "view", local)).rejects.toThrow("会话已变化");
  expect(flushResources).toHaveBeenCalledTimes(1);
});

it("粘贴中的本地文件必须属于真实来源正文，不能借图片契约读取私有路径", async () => {
  const image = await prepareContentContract("tau.image", {
    type: "image",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    resources: [{ path: "url", kind: "image" }],
  });
  const shareDocument = vi.fn();
  const session = { info: { id: "target", mode: "shared", serverUrl: "https://test" } };
  const context = {
    store: {},
    views: new Map([["view", { documentId: "target", windowId: 1 }]]),
    requireSession: () => session,
    findSession: () => undefined,
    assets: { shareDocument },
  } as unknown as CollaborationIpcContext;
  registerCollaborationIpc(context);
  await expect(
    handlers.get("collaboration:prepare-fragment")!(
      { sender: { id: 1 } },
      "view",
      "forged-source",
      [
        {
          type: "image",
          collabId: "image",
          tauContract: image.id,
          url: "~/.editor/setting.json",
          children: [{ text: "" }],
        },
      ],
      { [image.id]: image.contract }
    )
  ).rejects.toThrow("原文档");
  expect(shareDocument).not.toHaveBeenCalled();
});
