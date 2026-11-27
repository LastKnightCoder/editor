// @vitest-environment jsdom
import { seedGeometryHistory } from "../../../../e2e/whiteboard-frame/prototype/seedGeometryHistory";
import { act, Activity } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTcpServer, createConnection, type Socket } from "node:net";
import { Transform } from "node:stream";
import { transferableAbortController } from "node:util";
import { webcrypto } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import Whiteboard from "@tau/whiteboard";
import {
  createFrameExtension,
  createInteractionExtension,
  createMindExtension,
} from "@tau/whiteboard/extensions";
import { mindIndex } from "../../../../shared/whiteboard-mindmap";
import {
  createWhiteboardBinding,
  prepareBuiltinWhiteboardTypes,
} from "@tau/whiteboard/collaboration";
import { WhiteboardModel, createWhiteboardDocument, type WhiteboardPeer } from "@tau/collaboration";
import {
  WhiteboardDocumentClient,
  type WhiteboardDocumentBackend,
  type PendingWhiteboardUpdate,
} from "../client";
import type { WhiteboardDocumentEvent } from "@/types/whiteboard-document";
import { createServer } from "../../../../../collaboration-server/src/server";
import { CollaborationClient } from "../../../../src-electron/main/modules/collaboration/client";
import { CollaborationLocalStore } from "../../../../src-electron/main/modules/collaboration/local-store";
import { ContentIdentityTable } from "../../../../src-electron/main/modules/tables/content-identity";
import { WhiteboardDocumentRepository } from "../../../../src-electron/main/modules/whiteboard-documents/repository";
import { WhiteboardDocumentSessions } from "../../../../src-electron/main/modules/whiteboard-documents/sessions";
import {
  WhiteboardJournal,
  stateHash,
} from "../../../../src-electron/main/modules/whiteboard-documents/journal";
import { whiteboardAgentTools } from "../agent-tools";
import { ToolRegistry } from "@/tools/toolRegistry";
import { WhiteboardRealtime } from "../../../../src-electron/main/modules/whiteboard-documents/realtime";
import {
  prepareCandidate,
  applyCandidate,
} from "../../../../e2e/whiteboard-frame/prototype/transaction";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const waitFor = async (check: () => void, timeout = 4000) => {
  await act(async () => {
    await vi.waitFor(check, { timeout, interval: 25 });
  });
};

/** 仅容量模式经过限时回环中继，两端真实 TCP/WS 仍自行处理断开与重连。 */
async function delayedPort(port: number, oneWayMs: number) {
  const sockets = new Set<Socket>();
  const delay = () =>
    new Transform({
      transform(chunk, _encoding, done) {
        setTimeout(() => done(null, chunk), oneWayMs);
      },
    });
  const proxy = createTcpServer(down => {
    const up = createConnection(port, "127.0.0.1");
    for (const socket of [up, down]) {
      sockets.add(socket);
      socket.on("error", () => socket.destroy());
      socket.on("close", () => {
        sockets.delete(socket);
        up.destroy();
        down.destroy();
      });
    }
    up.pipe(delay()).pipe(down);
    down.pipe(delay()).pipe(up);
  });
  await new Promise<void>((resolve, reject) =>
    proxy.once("error", reject).listen(0, "127.0.0.1", resolve)
  );
  cleanups.push(
    () =>
      new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy();
        proxy.close(() => resolve());
      })
  );
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("中继监听失败");
  return address.port;
}

async function setup({
  roundTripMs = 0,
  frameCount = 1,
  frameChildren = 0,
  seedBytes = 0,
  mindmap = false,
  SessionClass = WhiteboardDocumentSessions,
} = {}) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const NodeSignal = transferableAbortController().signal.constructor as typeof AbortSignal;
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => NodeSignal.timeout(ms));
  const dir = mkdtempSync(join(tmpdir(), "whiteboard-drag-network-"));
  const server = await createServer({ dataDir: join(dir, "server"), logger: false });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  cleanups.push(async () => {
    await server.app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const address = server.app.server.address();
  if (!address || typeof address === "string") throw new Error("监听失败");
  const port = roundTripMs ? await delayedPort(address.port, roundTripMs / 2) : address.port;
  const url = `http://127.0.0.1:${port}`;
  const device = server.store.register("拖动测试");
  const room = server.store.create(device.id, "whiteboard");
  const builtins = await prepareBuiltinWhiteboardTypes();
  const source = new Y.Doc({ gc: !seedBytes });
  const sourceModel = new WhiteboardModel(source);
  const contract = builtins.prepared.find(item => item.id === builtins.types.frame.contractId)!;
  await sourceModel.installContracts({ [contract.id]: contract.contract });
  const pageId = sourceModel.submit([{ type: "create_page", title: "画布" }], {}).createdIds[0];
  const elementId = sourceModel.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        data: {
          title: "框",
          borderColor: "#999999",
          borderWidth: 1,
          backgroundColor: "transparent",
          borderRadius: 0,
        },
        geometry: { x: 100, y: 100, width: 200, height: 120, rotation: 0 },
        parent: { kind: "page", id: pageId },
      },
    ],
    {}
  ).createdIds[0];
  if (frameChildren) {
    const shape = builtins.prepared.find(row => row.id === builtins.types.geometry.contractId);
    if (!shape) throw new Error("缺少图形契约");
    await sourceModel.installContracts({ [shape.id]: shape.contract });
    const commands = Array.from({ length: frameChildren }, (_, i) => ({
      type: "create" as const,
      id: `shape-${i}`,
      contractId: shape.id,
      parent: { kind: "element" as const, id: elementId },
      geometry: {
        x: 110 + (i % 50),
        y: 110 + Math.floor(i / 50),
        width: 1,
        height: 1,
        rotation: 0,
      },
      data: { geometryType: "rectangle", text: { align: "center" } },
    }));
    for (let i = 0; i < commands.length; i += 100)
      sourceModel.submit(commands.slice(i, i + 100), {});
    const paragraph = await prepareContentContract("frame-bench", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    await sourceModel
      .richText("shape-0")
      .installContracts({ [paragraph.id]: paragraph.contract }, null);
    for (let i = 0; i < frameChildren; i += 64)
      sourceModel.richText(`shape-${i}`).insertNode(
        {
          type: "paragraph",
          collabId: `label-${i}`,
          tauContract: paragraph.id,
          children: [{ text: `标签 ${i}` }],
        },
        null,
        0,
        null,
        true
      );
  }
  if (frameCount > 1)
    sourceModel.submit(
      Array.from({ length: frameCount - 1 }, (_, i) => ({
        type: "create" as const,
        id: "extra-" + i,
        contractId: contract.id,
        data: { title: "额外画框" },
        geometry: { x: 1100 + i * 250, y: 0, width: 200, height: 100, rotation: 0 },
        parent: { kind: "page" as const, id: pageId },
      })),
      {}
    );
  if (seedBytes) seedGeometryHistory(sourceModel, elementId, seedBytes);
  const published = await createWhiteboardDocument(
    { documentId: room.id, epoch: 0, baselineId: "base" },
    Y.encodeStateAsUpdate(source)
  );
  const state = Y.encodeStateAsUpdate(published);
  await server.store.publish(room.id, device.id, state);
  sourceModel.dispose();
  source.destroy();
  published.destroy();
  const errors: unknown[] = [];
  const sides: {
    client: WhiteboardDocumentClient;
    binding: ReturnType<typeof createWhiteboardBinding>;
    host: HTMLDivElement;
    fire(type: string, x: number): Promise<void>;
    hide(): Promise<void>;
    apply: Parameters<typeof whiteboardAgentTools>[5];
    setOnline(online: boolean): void;
    connected(): boolean;
    x(): number;
    durable(): Uint8Array;
  }[] = [];
  for (const name of ["A", "B"]) {
    const dbFile = frameChildren ? join(dir, name + ".sqlite") : ":memory:";
    const db = new Database(dbFile);
    db.exec(schema);
    ContentIdentityTable.establishBaseline(db);
    const journal = new WhiteboardJournal(
      frameChildren ? join(dir, name + "-journal.sqlite") : ":memory:"
    );
    const events = new Set<(event: WhiteboardDocumentEvent) => void>();
    const sessions = new SessionClass(
      journal,
      () => db,
      (_owner, event) => events.forEach(listener => listener(event))
    );
    const created = await sessions.create(name, room.id, state, "board");
    const store = new CollaborationLocalStore(join(dir, name));
    const network = new CollaborationClient(store);
    const identity = name === "A" ? device : server.store.register("协作者");
    if (name !== "A") {
      const invitation = server.store.rotateCode(room.id, device.id);
      const request = server.store.requestJoin(invitation.code, identity.id);
      if (request.status !== "pending") throw new Error("未创建加入申请");
      server.store.decide(request.id, device.id, true);
    }
    network.saveIdentity(url, identity);
    const backend: WhiteboardDocumentBackend = {
      open: (target, viewId) => sessions.open(target.databaseName, target.contentId, 1, viewId),
      append: async (lease, batch, update) => {
        const receipt = await sessions.append(lease, 1, batch, update, "renderer");
        if (!receipt.error) realtime?.publishDocument();
        return receipt;
      },
      snapshot: async lease => sessions.snapshot(lease, 1),
      flush: lease => sessions.flush(lease, 1),
      release: lease => sessions.release(lease, 1),
      events: listener => {
        events.add(listener);
        return () => {
          events.delete(listener);
        };
      },
      drains: () => () => {},
      resumes: () => () => {},
      drained: async () => {},
    };
    const records = new Map<string, PendingWhiteboardUpdate>();
    const client = new WhiteboardDocumentClient(
      { databaseName: name, contentId: created.contentIds[0] },
      backend,
      {
        list: async () => [...records.values()],
        put: async value => {
          records.set(value.batchId, value);
        },
        remove: async id => {
          records.delete(id);
        },
      }
    );
    await client.ready;
    let peers: readonly WhiteboardPeer[] = [];
    let connected = false;
    const listeners = new Set<() => void>();
    const channel = {
      getPeers: () => peers,
      subscribePeers: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      publishPresence: (_id: string, value: Parameters<WhiteboardRealtime["presence"]>[0]) =>
        realtime?.presence(value),
    };
    const connect = () =>
      new WhiteboardRealtime(
        network,
        url,
        server.store.protocols.state(room.id),
        async update => {
          try {
            await sessions.append(client.leaseId!, 1, `push:${stateHash(update)}`, update);
          } catch (error) {
            errors.push(error);
            throw error;
          }
        },
        event => {
          connected = event.connected;
          peers = event.peers;
          listeners.forEach(listener => listener());
        },
        () => sessions.snapshot(client.leaseId!, 1).state
      );
    let realtime: WhiteboardRealtime | undefined = connect();
    const binding = createWhiteboardBinding(client.model, {
      pageId,
      coalesceLocalGesture: frameChildren ? () => true : undefined,
      types: builtins.types,
      preparedContracts: builtins.prepared,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const view = (
      <Whiteboard
        document={binding}
        presence={{ pageId, channel }}
        extensions={[
          createFrameExtension(),
          createInteractionExtension(),
          ...(mindmap ? [createMindExtension()] : []),
        ]}
        initData={[]}
        initViewPort={{ minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
    await act(async () => root.render(<Activity mode="visible">{view}</Activity>));
    cleanups.push(async () => {
      await act(async () => root.unmount());
      await client.flush();
      realtime?.dispose();
      client.dispose();
      sessions.dispose();
      journal.close();
      db.close();
      store.db.close();
      host.remove();
    });
    const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
    const fire = async (type: string, x: number) => {
      await act(async () => {
        canvas.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: 150,
          })
        );
        await new Promise(resolve => setTimeout(resolve, 35));
      });
    };
    const hide = async () => {
      await act(async () => root.render(<Activity mode="hidden">{view}</Activity>));
    };
    sides.push({
      client,
      binding,
      host,
      fire,
      apply: async (lease, req, signal) => {
        const receipt = await sessions.applyAgent(lease, 1, req, signal);
        if (!receipt.error) realtime?.publishDocument();
        return receipt;
      },
      hide,
      setOnline(online) {
        realtime?.dispose();
        connected = false;
        realtime = online ? connect() : undefined;
      },
      connected: () => connected,
      durable: () => {
        if (frameChildren) {
          const disk = new Database(dbFile, { readonly: true });
          try {
            const persisted = new WhiteboardDocumentRepository(disk, name).read(room.id);
            if (!persisted) throw new Error("未从独立数据库连接读回文档");
            return persisted.state;
          } finally {
            disk.close();
          }
        }
        const lease = client.leaseId;
        if (!lease) throw new Error("耐久会话未打开");
        return sessions.snapshot(lease, 1).state;
      },
      x: () =>
        client.model.read().pages[0].children.find(item => item.id === elementId)!.geometry.x,
    });
  }
  await waitFor(() => expect(sides.every(side => side.connected())).toBe(true));
  return { sides, errors, elementId };
}

it.each([false, true])(
  "真实拖动（预先选中=%s）经耐久保存及 WebSocket 到另一画布，松手只撤销一步",
  async selected => {
    const {
      sides: [left, right],
      errors,
    } = await setup();
    if (selected) {
      await left.fire("pointerdown", 150);
      await left.fire("pointerup", 150);
    }
    await left.fire("pointerdown", 150);
    for (const x of [200, 250, 300]) {
      await left.fire("pointermove", x);
      await waitFor(() => expect(right.x()).toBe(x - 50));
      await waitFor(() => {
        const element = right.host.querySelector('[data-layer="main-elements"] rect.cursor-move');
        const selection = right.host.querySelector("[data-whiteboard-presence] rect");
        expect(element?.getAttribute("x")).toBe(String(x - 50));
        expect(selection?.getAttribute("x")).toBe(String(x - 50));
      });
      if (x === 200)
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 600));
        });
    }
    expect(right.binding.history.undoStack).toHaveLength(0);
    await left.fire("pointerup", 300);
    await waitFor(() => expect(right.x()).toBe(250));
    expect(left.binding.history.undoStack).toHaveLength(1);
    await act(async () => left.binding.undo());
    await waitFor(() => expect(right.x()).toBe(100));
    expect(left.binding.history.undoStack).toHaveLength(0);
    await act(async () => left.binding.redo());
    await waitFor(() => expect(right.x()).toBe(250));
    expect(errors).toEqual([]);
  },
  20000
);

async function packagedSessions() {
  const dir = mkdtempSync(join(tmpdir(), "frame-append-worker-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const { execFileSync } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const sqlite = require.resolve("better-sqlite3");
  // 大检查点按桌面包的相邻路径启动真实工作线程，两份构建都留在临时目录。
  execFileSync(require.resolve("esbuild/bin/esbuild"), [
    `sessions=${join(__dirname, "../../../../src-electron/main/modules/whiteboard-documents/sessions.ts")}`,
    `whiteboard-append-worker=${join(__dirname, "../../../../src-electron/main/workers/whiteboard-append.worker.ts")}`,
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outdir=${dir}`,
    `--alias:better-sqlite3=${sqlite}`,
    `--external:${sqlite}`,
  ]);
  const { WhiteboardDocumentSessions: SessionClass } = require(
    join(dir, "sessions.js")
  ) as typeof import("../../../../src-electron/main/modules/whiteboard-documents/sessions");
  return SessionClass;
}

it.runIf(process.env.TAU_FRAME_DRAG_STRESS === "1")(
  "千元素整框拖动中途和松手后两端可从保存状态重开，单步撤销重做所有坐标",
  async () => {
    const SessionClass = await packagedSessions();
    const {
      sides: [left, right],
      errors,
    } = await setup({ frameChildren: 1000, SessionClass });
    // 在独立正确性压力中稳定进入慢提交分支，不给正式计时增加工作。
    const slowCommit = (tx: Y.Transaction) => {
      if (!left.binding.gestureHistory || tx.origin !== left.binding.gestureHistory) return;
      const until = performance.now() + 16;
      while (performance.now() < until) {
        /* 模拟耗时的同步观察者 */
      }
    };
    left.client.model.doc.on("afterTransaction", slowCommit);
    cleanups.push(() => left.client.model.doc.off("afterTransaction", slowCommit));

    const initial = left.client.model.read();
    expect(initial.pages[0].children[0].children).toHaveLength(1000);
    const compare = async (dx: number) => {
      const expected = initial.pages[0].children[0];
      await waitFor(() => expect(right.x()).toBe(expected.geometry.x + dx), 20000);
      for (const side of [left, right]) {
        await side.client.flush();
        const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
        try {
          await reopened.receive(side.durable());
          const snapshot = reopened.read();
          expect(snapshot).toEqual(side.client.model.read());
          const frame = snapshot.pages[0].children[0];
          expect(frame.children.map(node => [node.id, node.geometry])).toEqual(
            expected.children.map(node => [node.id, { ...node.geometry, x: node.geometry.x + dx }])
          );
          expect(frame.children.map(node => node.body)).toEqual(
            expected.children.map(node => node.body)
          );
          if (dx === 0) expect(snapshot).toEqual(initial);
        } finally {
          reopened.dispose();
          reopened.doc.destroy();
        }
      }
    };
    await left.fire("pointerdown", 150);
    await left.fire("pointermove", 200);
    await compare(50);
    for (const x of [180, 230, 210, 240]) {
      await left.fire("pointermove", x);
      await compare(x - 150);
    }
    await left.fire("pointermove", 250);
    await left.fire("pointerup", 265);
    await compare(115);
    expect(left.binding.history.undoStack).toHaveLength(1);
    expect(right.binding.history.undoStack).toHaveLength(0);
    await act(async () => left.binding.undo());
    await compare(0);
    await act(async () => left.binding.redo());
    await compare(115);
    await left.fire("pointerdown", 275);
    for (const x of [295, 285, 310, 290]) {
      await left.fire("pointermove", x);
      await compare(115 + x - 275);
    }
    await left.fire("pointercancel", 290);
    await left.fire("pointerup", 290);
    await compare(115);
    expect(left.binding.history.undoStack).toHaveLength(1);
    expect(left.host.querySelector("[data-frame-drag]")).toBeNull();

    await left.fire("pointerdown", 275);
    for (const x of [295, 280, 310, 300]) {
      await left.fire("pointermove", x);
      await waitFor(() => expect(right.x()).toBe(215 + x - 275), 20000);
    }
    expect(left.host.querySelector("[data-frame-drag]")).not.toBeNull();
    await act(async () =>
      right.binding.submit([
        { type: "edit_title", edit: { offset: 0, remove: 0, text: "保留对端写入" } },
      ])
    );
    await waitFor(() => {
      expect(left.client.model.read().title).toBe("保留对端写入");
      expect(left.binding.gesture).toBe(false);
    }, 20000);
    await left.fire("pointerup", 300);
    await compare(115);
    expect(left.binding.history.undoStack).toHaveLength(1);
    expect(right.binding.history.undoStack).toHaveLength(1);
    expect(left.host.querySelector("[data-frame-drag]")).toBeNull();
    expect(errors).toEqual([]);
  },
  150000
);

it.runIf(process.env.TAU_FRAME_QUOTA_STRESS === "1")(
  "容量拒绝取消时保留已广播坐标和原手势的撤销项，迟到松手不覆盖已保存数据",
  async () => {
    const SessionClass = await packagedSessions();
    const {
      sides: [left, right],
      errors,
    } = await setup({ frameChildren: 1000, seedBytes: 8180000, SessionClass });
    await act(async () =>
      right.binding.submit([
        { type: "edit_title", edit: { offset: 0, remove: 0, text: "容量压力" } },
      ])
    );
    await waitFor(() => expect(left.client.model.read().title).toBe("容量压力"), 25000);
    await Promise.all([left.client.flush(), right.client.flush()]);
    const rightDepth = right.binding.history.undoStack.length;
    await left.fire("pointerdown", 150);
    for (const x of [165, 180, 195, 210, 225, 240, 255, 270, 285, 300]) {
      await left.fire("pointermove", x);
      await waitFor(() => {
        if (left.binding.gesture) expect(right.x()).toBe(x - 50);
      }, 25000);
      if (!left.binding.gesture) break;
    }
    expect(left.binding.gesture).toBe(false);
    const prefix = left.x();
    expect(prefix).toBeGreaterThan(100);
    await left.fire("pointerup", 320);
    await waitFor(() => expect(right.x()).toBe(prefix), 25000);
    expect(left.binding.history.undoStack).toHaveLength(1);
    expect(right.binding.history.undoStack).toHaveLength(rightDepth);
    const state = Y.encodeStateAsUpdate(left.client.model.doc);
    const item = left.binding.history.undoStack[0];
    expect(() => left.binding.undo()).toThrow(/预算/);
    expect(left.binding.history.undoStack[0]).toBe(item);
    expect(
      Buffer.from(Y.encodeStateAsUpdate(left.client.model.doc)).equals(Buffer.from(state))
    ).toBe(true);
    for (const side of [left, right]) {
      await side.client.flush();
      const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
      try {
        await reopened.receive(side.durable());
        expect(reopened.read()).toEqual(left.client.model.read());
      } finally {
        reopened.dispose();
        reopened.doc.destroy();
      }
    }
    expect(errors).toEqual([]);
  },
  180000
);

it.each(["raw", "handoff", "incremental"])(
  "后台候选经真实保存与推送后，单步撤销重做保留远端内容和新文字初始化（%s）",
  async variant => {
    const handoffEnabled = variant !== "raw",
      incremental = variant === "incremental";
    const {
      sides: [left, right],
      errors,
      elementId,
    } = await setup();
    const model = left.client.model,
      original = model.read(),
      page = original.pages[0],
      frame = page.children[0],
      origin = {};
    // 候选合入须标为本地事务并转交初始化范围，否则保存漏写或重做丢失标题。
    const commands: import("@tau/collaboration").WhiteboardModelCommand[] = [
      {
        type: "create",
        id: "worker-created",
        contractId: frame.contractId,
        parent: { kind: "page", id: page.id },
        geometry: { ...frame.geometry, x: 600 },
        data: { ...frame.data, title: incremental ? "后台标题保留" : "后台标题" },
      },
      { type: "set_node", id: elementId, patch: { geometry: { ...frame.geometry, x: 175 } } },
      {
        type: "edit_text",
        id: "worker-created",
        field: "title",
        edit: { offset: 4, remove: 0, text: "保留" },
      },
    ];
    if (incremental) commands.pop();
    model.prepareLocalTranslations();
    const handoff = handoffEnabled ? model.capturePreparedUpdate(commands) : undefined;
    if (handoffEnabled && !handoff) throw new Error("没有生成交接票据");
    const candidate = await prepareCandidate(model, commands, incremental);
    if (incremental) expect(candidate.proofReused).toBe(true);
    const release = left.binding.history.retainOrigin(origin);
    left.binding.history.stopCapturing();
    await act(async () => {
      left.binding.writing = true;
      try {
        if (handoff)
          expect(handoff(() => applyCandidate(model, candidate, origin), origin)).toEqual({
            isolated: true,
            snapshot: true,
            capacity: true,
          });
        else applyCandidate(model, candidate, origin);
      } finally {
        left.binding.writing = false;
      }
      left.binding.refreshLayout();
    });
    left.binding.history.stopCapturing();
    release();
    await waitFor(() => {
      expect(right.x()).toBe(175);
      expect(right.client.model.text("worker-created", "title").toString()).toBe("后台标题保留");
    });
    expect(left.binding.history.undoStack).toHaveLength(1);
    await act(async () =>
      right.binding.submit([
        { type: "edit_title", edit: { offset: 0, remove: 0, text: "远端内容" } },
      ])
    );
    await waitFor(() => expect(model.read().title).toBe("远端内容"));
    await act(async () => left.binding.undo());
    await waitFor(() => {
      expect(right.x()).toBe(100);
      expect(right.client.model.read().pages[0].children.map(node => node.id)).toEqual([elementId]);
    });
    expect(model.read()).toEqual({ ...original, title: "远端内容" });
    await act(async () => left.binding.redo());
    await waitFor(() => {
      expect(right.x()).toBe(175);
      expect(right.client.model.text("worker-created", "title").toString()).toBe("后台标题保留");
    });
    for (const side of [left, right]) {
      await side.client.flush();
      const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
      try {
        await reopened.receive(side.durable());
        expect(reopened.read()).toEqual(side.client.model.read());
      } finally {
        reopened.doc.destroy();
      }
    }
    expect(errors).toEqual([]);
  },
  20000
);

it.each(["pointercancel", "hidden"])(
  "拖动中 %s 回滚已广播的位置，保留原有重做且不留下延迟写入",
  async mode => {
    const {
      sides: [left, right],
      errors,
    } = await setup();
    await act(async () => {
      left.binding.submit([
        { type: "edit_title", edit: { offset: 0, remove: 0, text: "原有修改" } },
      ]);
    });
    await waitFor(() => expect(right.client.model.read().title).toBe("原有修改"));
    await act(async () => left.binding.undo());
    await waitFor(() => expect(right.client.model.read().title).toBe(""));
    expect(left.binding.history.redoStack).toHaveLength(1);
    await left.fire("pointerdown", 150);
    await left.fire("pointermove", 200);
    await waitFor(() => expect(right.x()).toBe(150));
    await left.fire("pointermove", 250);
    if (mode === "hidden") await left.hide();
    else await left.fire("pointercancel", 250);
    await waitFor(() => expect(right.x()).toBe(100));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });
    expect(right.x()).toBe(100);
    expect(left.binding.history.undoStack).toHaveLength(0);
    expect(left.binding.history.redoStack).toHaveLength(1);
    if (mode !== "hidden") {
      await act(async () => left.binding.redo());
      await waitFor(() => expect(right.client.model.read().title).toBe("原有修改"));
      expect(right.x()).toBe(100);
    }
    expect(errors).toEqual([]);
  },
  20000
);

it("拖动中收到对方同一元素的新位置，取消自身手势不覆盖对方，迟到松手不重放", async () => {
  const {
    sides: [left, right],
    errors,
    elementId,
  } = await setup();
  await left.fire("pointerdown", 150);
  await left.fire("pointermove", 200);
  await waitFor(() => expect(right.x()).toBe(150));
  await act(async () =>
    right.binding.submit([
      {
        type: "set_node",
        id: elementId,
        patch: { geometry: { x: 500, y: 100, width: 200, height: 120, rotation: 0 } },
      },
    ])
  );
  await waitFor(() => expect(left.x()).toBe(500));
  await left.fire("pointerup", 200);
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  expect(left.x()).toBe(500);
  expect(right.x()).toBe(500);
  expect(left.binding.history.undoStack).toHaveLength(0);
  expect(right.binding.history.undoStack).toHaveLength(1);
  expect(errors).toEqual([]);
}, 20000);

it("主对话捕获的工具修改同页画布，经真实推送到第二端，离页后旧执行器失效", async () => {
  const {
    sides: [left, right],
    elementId,
  } = await setup();
  const lifetime = new AbortController(),
    registry = new ToolRegistry(),
    scope = crypto.randomUUID();
  registry.registerScopedTools(
    scope,
    "当前白板",
    whiteboardAgentTools(scope, left.binding, left.client, undefined, lifetime.signal, left.apply)
  );
  const sessionTools = registry.getScopedTools(scope);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await registry.executeToolCall(
      {
        id: crypto.randomUUID(),
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
      { databaseName: "A", conversationKey: "main-chat:test", sessionTools }
    );
    return JSON.parse(result!.content);
  };
  const { target } = await call("get_whiteboard_context", {});
  const {
    elements: [frame],
  } = await call("read_whiteboard_elements", { target, ids: [elementId] });
  const batch = {
    target,
    requestId: "move-1",
    operations: [
      {
        kind: "move",
        id: elementId,
        before: frame.geometry,
        geometry: { ...frame.geometry, x: 256 },
      },
    ],
  };
  let revision = 0;
  await act(async () => {
    revision = (await call("apply_whiteboard_operations", batch)).revision;
  });
  await waitFor(() => {
    for (const side of [left, right]) {
      expect(side.x()).toBe(256);
      expect(
        side.host.querySelector('[data-layer="main-elements"] rect.cursor-move')?.getAttribute("x")
      ).toBe("256");
      expect(side.binding.history.undoStack).toHaveLength(0);
    }
  });
  expect((await call("apply_whiteboard_operations", batch)).revision).toBe(revision);
  lifetime.abort();
  await expect(call("apply_whiteboard_operations", batch)).rejects.toThrow();
});

const delayedNetwork = process.env.TAU_BOARD_AGENT_STRESS === "network";
it.runIf(process.env.TAU_MINDMAP_STRESS === "1")(
  "原生导图工具离线、对端编辑、重复请求与重连合并压力",
  async () => {
    vi.stubGlobal("crypto", webcrypto);
    const full = process.env.TAU_MINDMAP_STRESS_PROFILE !== "smoke";
    const {
      sides: [local, peer],
      errors,
    } = await setup({ mindmap: true, roundTripMs: full ? 100 : 0 });
    const registries = [local, peer].map((side, index) => {
      const registry = new ToolRegistry(),
        scope = crypto.randomUUID(),
        lifetime = new AbortController();
      registry.registerScopedTools(
        scope,
        "当前白板",
        whiteboardAgentTools(
          scope,
          side.binding,
          side.client,
          undefined,
          lifetime.signal,
          side.apply
        )
      );
      const tools = registry.getScopedTools(scope);
      return {
        lifetime,
        call: async (name: string, args: Record<string, unknown>) => {
          const result = await registry.executeToolCall(
            {
              id: crypto.randomUUID(),
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
            {
              databaseName: index ? "B" : "A",
              conversationKey: `mindmap-network-${index}`,
              sessionTools: tools,
            }
          );
          if (!result) throw new Error("缺少压力工具回执");
          const parsed = JSON.parse(result.content);
          if (parsed.ok === false) throw new Error(result.content);
          return parsed;
        },
      };
    });
    const [left, right] = registries;
    const target = (await left.call("get_whiteboard_context", {})).target;
    const otherTarget = (await right.call("get_whiteboard_context", {})).target;
    let seed: { ids: Record<string, string> } | undefined;
    await act(async () => {
      seed = await left.call("apply_whiteboard_mindmap_operations", {
        target,
        requestId: "network-seed",
        operations: [
          { kind: "insert", id: "root", at: { x: 450, y: 300 }, text: "网络压力导图" },
          { kind: "insert", id: "a", parentId: "root", text: "初始甲" },
          { kind: "insert", id: "b", parentId: "root", text: "初始乙" },
          { kind: "insert", id: "c", parentId: "root", text: "初始丙" },
          { kind: "relation", id: "relation", from: "a", to: "b", text: "初始联系" },
        ],
      });
    });
    if (!seed) throw new Error("未创建压力导图");
    const ids = seed.ids;
    const plain = (side: typeof local, id: string) => {
      const node = mindIndex(side.client.model.read().pages[0]).nodes.get(id);
      if (!node || !Array.isArray(node.body)) return "";
      const text = (value: import("@tau/collaboration").ContentNode): string =>
        typeof value.text === "string" ? value.text : (value.children ?? []).map(text).join("");
      return node.body.map(text).join("\n");
    };
    await waitFor(() => expect(plain(peer, ids.a)).toBe("初始甲"));
    const initialIds = new Set(mindIndex(local.client.model.read().pages[0]).nodes.keys());
    const selections = [local, peer].map(side =>
      side.binding.board?.selection.selectedElements.map(node => node.id)
    );
    local.setOnline(false);
    const count = full ? 64 : 4,
      durations: number[] = [];
    let last: Record<string, unknown> | undefined,
      lastRevision = -1,
      peerWrites = 0;
    for (let i = 0; i < count; i++) {
      const read = await left.call("read_whiteboard_mindmap", { target, nodeId: ids.root });
      const args = {
        target,
        requestId: `offline-mind-${i}`,
        preconditions: read.preconditions,
        operations: [
          { kind: "edit_text", id: ids.a, text: `离线甲-${i}` },
          { kind: "edit_text", id: ids.b, text: `离线乙-${i}` },
          { kind: "configure", id: ids.root, themeStyle: i % 2 ? "soft" : "outline" },
          { kind: "fold", id: ids.root, folded: i % 2 === 0 },
          {
            kind: "relation",
            action: "update",
            id: ids.relation,
            text: `联系-${i}`,
            from: ids.a,
            to: ids.b,
            reverse: i % 3 === 0,
          },
        ],
      };
      const began = performance.now();
      await act(async () => {
        const result = await left.call("apply_whiteboard_mindmap_operations", args);
        const replay = await left.call("apply_whiteboard_mindmap_operations", args);
        expect(replay.revision).toBe(result.revision);
        lastRevision = result.revision;
      });
      durations.push(performance.now() - began);
      last = args;
      if (i % 4 === 0) {
        const read = await right.call("read_whiteboard_mindmap", {
          target: otherTarget,
          nodeId: ids.root,
        });
        await act(async () => {
          await right.call("apply_whiteboard_mindmap_operations", {
            target: otherTarget,
            requestId: `peer-mind-${i}`,
            preconditions: read.preconditions,
            operations: [{ kind: "edit_text", id: ids.c, text: `对端丙-${i}` }],
          });
        });
        peerWrites++;
      }
    }
    expect(plain(peer, ids.a)).toBe("初始甲");
    expect(plain(local, ids.c)).toBe("初始丙");
    const reconnect = performance.now();
    local.setOnline(true);
    const lastPeer = Math.floor((count - 1) / 4) * 4;
    await waitFor(() => {
      expect(local.connected()).toBe(true);
      for (const side of [local, peer]) {
        expect(plain(side, ids.a)).toBe(`离线甲-${count - 1}`);
        expect(plain(side, ids.b)).toBe(`离线乙-${count - 1}`);
        expect(plain(side, ids.c)).toBe(`对端丙-${lastPeer}`);
        expect(plain(side, ids.relation)).toBe(`联系-${count - 1}`);
        expect(new Set(mindIndex(side.client.model.read().pages[0]).nodes.keys())).toEqual(
          initialIds
        );
        expect(side.binding.history.undoStack).toHaveLength(0);
      }
    }, 30000);
    const retryArgs = last;
    if (!retryArgs) throw new Error("缺少原始重试请求");
    await act(async () =>
      expect((await left.call("apply_whiteboard_mindmap_operations", retryArgs)).revision).toBe(
        lastRevision
      )
    );
    expect(
      [local, peer].map(side => side.binding.board?.selection.selectedElements.map(node => node.id))
    ).toEqual(selections);
    expect(errors).toEqual([]);
    durations.sort((a, b) => a - b);
    const output = join(
      process.cwd(),
      "../../output/whiteboard-mindmap-stress",
      full ? "full" : "smoke"
    );
    mkdirSync(output, { recursive: true });
    writeFileSync(
      join(output, "network.json"),
      JSON.stringify(
        {
          status: "passed",
          profile: full ? "full" : "smoke",
          scope: "真实双画布、工具注册表、SQLite、WebSocket 与断网重连；无截图或视觉验收",
          batches: count,
          retries: count + 1,
          peerWrites,
          agentOperations: count * 5 + peerWrites,
          simulatedRttMs: full ? 100 : 0,
          reconnectToValidationCompleteMs: performance.now() - reconnect,
          batchAndReplay: {
            p50ms: durations[Math.floor((durations.length - 1) * 0.5)],
            p95ms: durations[Math.floor((durations.length - 1) * 0.95)],
            p99ms: durations[Math.floor((durations.length - 1) * 0.99)],
          },
          errors,
        },
        null,
        2
      )
    );
    registries.forEach(registry => registry.lifetime.abort());
  },
  120000
);

it("导图工具经真实队列和共享推送更新两端原生树，保留用户选区与撤销来源", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const {
    sides: [left, right],
    errors,
  } = await setup({ mindmap: true });
  const lifetime = new AbortController(),
    registry = new ToolRegistry(),
    scope = crypto.randomUUID();
  registry.registerScopedTools(
    scope,
    "当前白板",
    whiteboardAgentTools(scope, left.binding, left.client, undefined, lifetime.signal, left.apply)
  );
  const sessionTools = registry.getScopedTools(scope);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await registry.executeToolCall(
      {
        id: crypto.randomUUID(),
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
      { databaseName: "A", conversationKey: "main-chat:mindmap", sessionTools }
    );
    if (!result) throw new Error("未返回工具回执");
    const value = JSON.parse(result.content);
    if (value.ok === false) throw new Error(result.content);
    return value;
  };
  const { target } = await call("get_whiteboard_context", {});
  const selection = left.binding.board?.selection.selectedElements.map(node => node.id);
  let created: { ids: Record<string, string> } | undefined;
  await act(async () => {
    created = await call("apply_whiteboard_mindmap_operations", {
      target,
      requestId: "create-map",
      operations: [
        { kind: "insert", id: "root", at: { x: 500, y: 400 }, text: "原生中心" },
        { kind: "insert", id: "right", parentId: "root", text: "保留右侧" },
      ],
    });
  });
  if (!created) throw new Error("未创建导图");
  const rootId = created.ids.root;
  await waitFor(() =>
    expect(mindIndex(right.client.model.read().pages[0]).nodes.has(rootId)).toBe(true)
  );
  const read = await call("read_whiteboard_mindmap", { target, nodeId: rootId });
  let added: { ids: Record<string, string> } | undefined;
  await act(async () => {
    added = await call("apply_whiteboard_mindmap_operations", {
      target,
      requestId: "add-left",
      preconditions: read.preconditions,
      operations: [
        { kind: "insert", id: "world", parentId: rootId, side: "left", text: "世界这么大" },
      ],
    });
  });
  if (!added) throw new Error("未返回新增分支");
  const childId = added.ids.world;
  await waitFor(() => {
    for (const side of [left, right]) {
      const index = mindIndex(side.client.model.read().pages[0]);
      expect(index.parents.get(childId)?.id).toBe(rootId);
      expect(index.nodes.get(childId)?.type).toBe("mind-node");
      expect(index.sides.get(childId)).toBe("left");
      expect(side.binding.history.undoStack).toHaveLength(0);
      const root = side.binding.board?.children.find(node => node.id === rootId);
      expect(root?.children?.some(node => node.id === childId)).toBe(true);
    }
  });
  expect(left.binding.board?.selection.selectedElements.map(node => node.id)).toEqual(selection);
  expect(errors).toEqual([]);
  lifetime.abort();
}, 30000);

it("真实推送连接离线时 Agent 批次只在本机生效，重连后同页收齐且不重复", async () => {
  const {
    sides: [local, peer],
  } = await setup(delayedNetwork ? { roundTripMs: 100, frameCount: 10 } : {});
  const initial = local.binding.model.read().pages[0].children[0].geometry;
  const initialNodes = local.binding.model.read().pages[0].children;
  local.setOnline(false);
  const start = performance.now(),
    count = delayedNetwork ? 100 : 32;
  for (let i = 0; i < count; i++) {
    const request = {
      owner: "main-chat:offline",
      pageId: local.binding.pageId,
      requestId: "offline-" + i,
      operations: initialNodes.map(({ id, geometry }) => ({
        kind: "move",
        id,
        before: { ...geometry, x: geometry.x + i },
        geometry: { ...geometry, x: geometry.x + i + 1 },
      })),
    };
    const apply = local.apply!;
    const signal = new AbortController().signal;
    const result = await apply(local.client.leaseId!, request, signal);
    expect((await apply(local.client.leaseId!, request, signal)).operationRevision).toBe(
      result.operationRevision
    );
  }
  await waitFor(() => expect(local.x()).toBe(initial.x + count));
  expect(peer.x()).toBe(initial.x);
  const reconnect = performance.now();
  local.setOnline(true);
  await waitFor(() => {
    expect(local.connected()).toBe(true);
    expect(
      peer.host.querySelector('[data-layer="main-elements"] rect.cursor-move')?.getAttribute("x")
    ).toBe(String(initial.x + count));
  });
  expect(peer.binding.model.read().pages[0].children.map(n => [n.id, n.geometry.x])).toEqual(
    initialNodes.map(n => [n.id, n.geometry.x + count])
  );
  console.info("AGENT_SOCKET_RECOVERY", {
    simulatedRttMs: delayedNetwork ? 100 : 0,
    operations: count * initialNodes.length,
    batches: count,
    retries: count,
    offlineMs: Math.round(reconnect - start),
    reconnectToDomMs: Math.round(performance.now() - reconnect),
  });
}, 30000);
