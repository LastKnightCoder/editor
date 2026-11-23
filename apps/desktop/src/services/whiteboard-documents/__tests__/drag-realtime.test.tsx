// @vitest-environment jsdom
import { act, Activity } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import * as Y from "yjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTcpServer, createConnection, type Socket } from "node:net";
import { Transform } from "node:stream";
import { transferableAbortController } from "node:util";
import schema from "@tau/db-schema/schema/main.sql?raw";
import Whiteboard from "@tau/whiteboard";
import { createFrameExtension, createInteractionExtension } from "@tau/whiteboard/extensions";
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
import { WhiteboardDocumentSessions } from "../../../../src-electron/main/modules/whiteboard-documents/sessions";
import {
  WhiteboardJournal,
  stateHash,
} from "../../../../src-electron/main/modules/whiteboard-documents/journal";
import { whiteboardAgentTools } from "../agent-tools";
import { ToolRegistry } from "@/tools/toolRegistry";
import { WhiteboardRealtime } from "../../../../src-electron/main/modules/whiteboard-documents/realtime";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const waitFor = async (check: () => void) => {
  await act(async () => {
    await vi.waitFor(check, { timeout: 4000, interval: 25 });
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

async function setup({ roundTripMs = 0, frameCount = 1 } = {}) {
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
  const source = new Y.Doc();
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
  }[] = [];
  for (const name of ["A", "B"]) {
    const db = new Database(":memory:");
    db.exec(schema);
    ContentIdentityTable.establishBaseline(db);
    const journal = new WhiteboardJournal(":memory:");
    const events = new Set<(event: WhiteboardDocumentEvent) => void>();
    const sessions = new WhiteboardDocumentSessions(
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
        extensions={[createFrameExtension(), createInteractionExtension()]}
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
