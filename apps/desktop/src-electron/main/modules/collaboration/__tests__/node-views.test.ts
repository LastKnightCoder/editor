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
