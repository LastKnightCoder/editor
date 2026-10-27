import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import * as React from "react";
import * as JSX from "react/jsx-runtime";
import * as Lucide from "lucide-react";
import * as Y from "yjs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import * as Plugins from "../../../packages/plugins/src/index";
import * as SDK from "../../../packages/plugins/src/whiteboard";
import * as UI from "../../../packages/ui/src/index";
import { evaluatePortablePluginPackage } from "../../../packages/plugins/src/rendering";
import { validatePortablePluginManifest } from "../../../packages/plugins/src/portable";
import { ContentPluginRegistry } from "../../../packages/plugins/src/content";
import {
  WhiteboardModel,
  createWhiteboardDocument,
  collectWhiteboardDocumentResources,
} from "../../../packages/collaboration/src/index";
import { createWhiteboardBinding } from "../../../packages/whiteboard/src/collaboration/binding";
import { hostWhiteboardExtensions } from "../../../packages/whiteboard/src/extensions/authorApi";
import { WhiteboardContractCatalog } from "../../../packages/whiteboard/src/collaboration/catalog";
import { createServiceRegistry } from "../../../packages/shared/service-registry";
import { IWhiteboardAuthorPermission } from "../../../packages/whiteboard/src/extensions/authorAccess";
import Board from "../../../packages/whiteboard/src/Board";
import { convertLegacyWhiteboard } from "../../../apps/desktop/src-electron/main/modules/whiteboard-documents/legacy";
import type { StickmanCommands } from "../../../plugins/tau-plugin-stickman/src/commands";

const root = path.resolve(import.meta.dirname, "../../..");
const artifact = process.env.TAU_STICKMAN_ARTIFACT;
if (!artifact) throw new Error("请通过 verify-stickman-collaboration.mjs 构建候选组合");
const manifest = validatePortablePluginManifest(
  JSON.parse(await readFile(path.join(artifact, "manifest.json"), "utf8"))
);
const code = await readFile(path.join(artifact, manifest.main), "utf8");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
for (const [name, digest] of Object.entries(manifest.integrity))
  expect(hash(await readFile(path.join(artifact, name)))).toBe(digest);
const modules = {
  react: React,
  "react/jsx-runtime": JSX,
  "lucide-react": Lucide,
  "@tau/plugins": Plugins,
  "@tau/plugins/whiteboard": SDK,
  "@tau/ui": UI,
};
const host = {
  appVersion: "0.59.5",
  profiles: ["web-v1"],
  environment: { platform: "desktop" as const, input: { coarsePointer: false, finePointer: true } },
};
const definition = evaluatePortablePluginPackage({ manifest, code }, modules, host);
const type = "taunote.stickman.figure";
const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn())
);

async function fixture(state?: Uint8Array, installed = true, readStyle?: () => Promise<any>) {
  const extensions = hostWhiteboardExtensions(
    installed ? definition.whiteboardExtensions! : [],
    definition.id
  );
  const catalog = await WhiteboardContractCatalog.prepare(
    extensions.map(extension => ({
      owner: definition.id,
      elements: extension.elements ?? [],
    }))
  );
  const doc = new Y.Doc({ gc: false });
  if (state) Y.applyUpdate(doc, state);
  const model = new WhiteboardModel(doc);
  const page =
    model.read().pages[0]?.id ??
    model.submit([{ type: "create_page", title: "人物" }], null).createdIds[0];
  let enabled = true;
  const binding = createWhiteboardBinding(model, {
    pageId: page,
    types: {},
    catalog,
    canEditContract: () => enabled,
  });
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  board.attachDocument(binding);
  board.installExtensions(
    extensions,
    undefined,
    createServiceRegistry(register => {
      register(SDK.IPluginStorage, {
        get: readStyle ?? (async () => ({ body: "bean", tint: "color" })),
        set: async () => {},
        delete: async () => {},
      });
      register(IWhiteboardAuthorPermission, {
        assertActive: () => {
          if (!enabled) throw new Error("插件失活");
        },
      });
    })
  );
  cleanup.push(() => {
    board.destroy();
    model.dispose();
    doc.destroy();
  });
  const build = () =>
    board.extensions!.getElementDefinition(type)!.create!.build!({
      api: board.extensions!.api,
      rect: { x: 20, y: 30, width: 132, height: 172 },
      start: { x: 20, y: 30 },
      end: { x: 152, y: 202 },
      click: true,
      shift: false,
      alt: false,
      options: { pose: "stand" },
    });
  const create = async () => {
    const node = await build();
    expect(node).not.toBeNull();
    board.apply({ type: "insert_node", path: [board.children.length], node: node as any });
    return (node as { id: string }).id;
  };
  const commands = () => {
    const component = board.extensions!.inspectors[type] as (
      props: any
    ) => React.ReactElement<{ commands: StickmanCommands }>;
    return component({ element: board.children[0] }).props.commands;
  };
  return {
    doc,
    model,
    board,
    binding,
    catalog,
    page,
    build,
    create,
    commands,
    disable: () => {
      enabled = false;
    },
  };
}
const snapshot = (f: Awaited<ReturnType<typeof fixture>>) => f.model.read().pages[0].children[0];

it("真实候选包声明匹配，旧宿主拒绝且静态契约不声明虚假文本或资源", async () => {
  expect(definition.id).toBe("taunote.stickman");
  expect(definition.version).toBe("0.1.11");
  expect(() =>
    evaluatePortablePluginPackage({ manifest, code }, modules, { ...host, appVersion: "0.59.4" })
  ).toThrow("客户端版本低于");
  const registry = new ContentPluginRegistry();
  registry.install([definition]);
  const catalog = await registry.prepareWhiteboardContracts();
  expect(catalog.current(type)?.contract).toMatchObject({
    owner: definition.id,
    type,
    dataVersion: 1,
    textFields: [],
    resources: [],
  });
});

it("实际异步创建使用偏好并只记一次历史，创建撤销和重做保持节点身份", async () => {
  const f = await fixture(),
    id = await f.create();
  expect(snapshot(f)).toMatchObject({
    id,
    type,
    data: { pose: "stand", body: "bean", tint: "color", flip: false },
  });
  expect(f.board.children[0]).not.toHaveProperty("schemaVersion");
  expect(f.binding.history.undoStack).toHaveLength(1);
  f.binding.undo();
  expect(f.model.read().pages[0].children).toHaveLength(0);
  f.binding.redo();
  expect(snapshot(f).id).toBe(id);
  expect(collectWhiteboardDocumentResources(f.doc)).toEqual([]);
});

it("真实属性动作与宿主历史合并，远端未知字段和移动不会被旧属性面板覆盖", async () => {
  const a = await fixture(),
    id = await a.create();
  const actions = a.commands(),
    b = await fixture(Y.encodeStateAsUpdate(a.doc));
  a.binding.history.clear();
  b.model.submit(
    [
      { type: "set_data", id, patch: { unknown: { keep: true } } },
      { type: "set_node", id, patch: { geometry: { ...snapshot(b).geometry, x: 400 } } },
    ],
    {}
  );
  await a.model.receive(Y.encodeStateAsUpdate(b.doc));
  expect(a.binding.history.undoStack).toHaveLength(0);
  actions.pose(id, "sit");
  expect(a.binding.history.undoStack).toHaveLength(1);
  expect(snapshot(a).data).toMatchObject({ pose: "sit", unknown: { keep: true } });
  a.binding.undo();
  expect(snapshot(a).geometry.x).toBe(400);
  expect(snapshot(a).data.pose).toBe("stand");
  expect(snapshot(a).data.unknown).toEqual({ keep: true });
  a.binding.redo();
  expect(snapshot(a).data.pose).toBe("sit");
});

it("三端独立属性与笔触乱序重复接收收敛，删除后撤销保留人物载荷", async () => {
  const a = await fixture(),
    id = await a.create();
  const b = await fixture(Y.encodeStateAsUpdate(a.doc)),
    c = await fixture(Y.encodeStateAsUpdate(a.doc));
  a.commands().data(id, { body: "glyph" });
  b.commands().data(id, { flip: true });
  c.commands().sketch(id, {}, { mode: "sketch", seed: 19 });
  const updates = [a, b, c].map(f => Y.encodeStateAsUpdate(f.doc));
  for (const [index, f] of [a, b, c].entries())
    for (const n of [2 - index, index, 1, 2, 0]) await f.model.receive(updates[n]);
  expect(a.model.read()).toEqual(b.model.read());
  expect(b.model.read()).toEqual(c.model.read());
  expect(snapshot(a)).toMatchObject({
    data: { body: "glyph", flip: true },
    style: { sketchMode: "sketch", sketchSeed: 19 },
  });
  a.binding.history.clear();
  a.board.apply({ type: "remove_node", path: [0], node: a.board.children[0] });
  await b.model.receive(Y.encodeStateAsUpdate(a.doc));
  expect(b.model.read().pages[0].children).toHaveLength(0);
  a.binding.undo();
  await b.model.receive(Y.encodeStateAsUpdate(a.doc));
  expect(snapshot(b)).toEqual(snapshot(a));
});

it("缺失插件仍能保真接收与跨页移动，重装恢复精确契约", async () => {
  const a = await fixture(),
    id = await a.create();
  a.commands().sketch(id, {}, { mode: "sketch", level: "loose" });
  const b = await fixture(Y.encodeStateAsUpdate(a.doc), false);
  expect(snapshot(b)).toEqual(snapshot(a));
  expect(b.catalog.current(type)).toBeUndefined();
  const page = b.model.submit([{ type: "create_page", title: "第二页" }], {}).createdIds[0];
  b.model.submit([{ type: "move_node", id, parent: { kind: "page", id: page } }], {});
  expect(b.model.read().pages[1].children[0].id).toBe(id);
  await a.model.receive(Y.encodeStateAsUpdate(b.doc));
  expect(a.model.read()).toEqual(b.model.read());
  const reopened = await fixture(Y.encodeStateAsUpdate(b.doc));
  expect(reopened.catalog.get(b.model.read().pages[1].children[0].contractId)?.access).toBe("edit");
});

it("旧 schemaVersion 快照显式转换仍保留原载荷，不因候选插件存在自动冒充新契约", async () => {
  const original = {
    id: "old-figure",
    type,
    schemaVersion: 1,
    x: 1,
    y: 2,
    width: 132,
    height: 172,
    data: { pose: "stand", body: "bean", tint: "mono", flip: true, future: { keep: 1 } },
    sketch: { mode: "sketch", seed: 42 },
  };
  const result = await convertLegacyWhiteboard(
    [{ id: "old-page", title: "旧页", data: { version: 2, children: [original] } }],
    {
      documentId: "old-document",
      title: "旧人物",
      editorContracts: {},
      resolveEntity: () => null,
      mapResource: async reference => reference,
    }
  );
  cleanup.push(() => result.doc.destroy());
  const retained = result.bundle.pages[0].elements[0];
  expect(retained.id).toBe(original.id);
  expect(retained.data.original).toEqual(original);
  expect(result.issues).toEqual([
    { pageId: "old-page", nodeId: original.id, reason: "unknown-legacy-contract" },
  ]);
  const reopened = await fixture(Y.encodeStateAsUpdate(result.doc));
  expect(reopened.catalog.get(retained.contractId)).toBeUndefined();
  expect(snapshot(reopened).data.original).toEqual(original);
});

it("偏好读取迟到且插件已失活时创建返回空，保存失败不生成节点", async () => {
  let resolve!: (value: unknown) => void;
  const f = await fixture(
    undefined,
    true,
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const pending = f.build();
  f.disable();
  resolve({ body: "glyph", tint: "mono" });
  expect(await pending).toBeNull();
  expect(f.model.elements.size).toBe(0);
  const failed = await fixture(undefined, true, async () => {
    throw new Error("偏好读取失败");
  });
  await expect(failed.build()).rejects.toThrow("偏好读取失败");
  expect(failed.model.elements.size).toBe(0);
});

it("真实插件动作在权限失效后拒绝写入，笔触撤销恢复页面继承且不改业务字段", async () => {
  const f = await fixture(),
    id = await f.create(),
    commands = f.commands();
  f.binding.history.clear();
  commands.sketch(id, {}, { mode: "sketch", seed: 23 });
  const data = snapshot(f).data;
  commands.sketch(id, { mode: "sketch", seed: 23 }, { seed: 23 });
  expect(snapshot(f).style).toMatchObject({ sketchMode: null, sketchSeed: 23 });
  f.binding.undo();
  expect(snapshot(f).style).toMatchObject({ sketchMode: "sketch", sketchSeed: 23 });
  expect(snapshot(f).data).toEqual(data);
  const before = Y.encodeStateAsUpdate(f.doc);
  f.disable();
  expect(() => commands.data(id, { body: "glyph" })).toThrow();
  expect(() => commands.pose(id, "sit")).toThrow();
  expect(() => commands.sketch(id, {}, { seed: 24 })).toThrow();
  expect(Y.encodeStateAsUpdate(f.doc)).toEqual(before);
});

let server: ChildProcess, base: string, serverDirectory: string;
beforeAll(async () => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  serverDirectory = await mkdtemp(path.join(tmpdir(), "tau-stickman-server-"));
  server = spawn(process.execPath, [path.join(root, "apps/collaboration-server/dist/index.js")], {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      COLLAB_HOST: "127.0.0.1",
      COLLAB_PORT: String(port),
      COLLAB_PUBLIC_URL: base,
      COLLAB_DATA_DIR: serverDirectory,
      COLLAB_LOGGER: "0",
    },
  });
  for (let n = 0; n < 200; n++) {
    if (server.exitCode !== null) throw new Error(`本地服务退出：${server.exitCode}`);
    try {
      if ((await fetch(`${base}/health/ready`)).ok) return;
    } catch {
      /* 服务启动期间等待下一次就绪检查。 */
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("本地服务启动超时");
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const kill = setTimeout(() => server.kill("SIGKILL"), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(kill);
    }
  }
  if (serverDirectory) await rm(serverDirectory, { recursive: true, force: true });
});

it("插件候选产物生成的文档被实际服务构建接纳，回执幂等，旧协议与错误 epoch 被拒", async () => {
  const device = await (
    await fetch(`${base}/v1/devices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "本地组合验收" }),
    })
  ).json();
  const headers = {
    authorization: `Bearer ${device.id}:${device.secret}`,
    "content-type": "application/json",
  };
  const room = await (
    await fetch(`${base}/v1/documents`, {
      method: "POST",
      headers,
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    })
  ).json();
  const local = await fixture();
  const id = await local.create();
  const identity = { documentId: room.id, epoch: 0, baselineId: "stickman-candidate" };
  const shared = await createWhiteboardDocument(identity, Y.encodeStateAsUpdate(local.doc));
  cleanup.push(() => shared.destroy());
  const published = await fetch(`${base}/v1/documents/${room.id}/publish`, {
    method: "POST",
    headers,
    body: JSON.stringify({ state: Buffer.from(Y.encodeStateAsUpdate(shared)).toString("base64") }),
  });
  expect(published.status).toBe(200);
  const a = await fixture(Y.encodeStateAsUpdate(shared)),
    b = await fixture(Y.encodeStateAsUpdate(shared));
  const vector = Y.encodeStateVector(a.doc);
  a.commands().data(id, { tint: "mono" });
  a.commands().sketch(id, {}, { mode: "sketch" });
  const update = Y.encodeStateAsUpdate(a.doc, vector);
  const request = {
    ...identity,
    version: 3,
    operationId: crypto.randomUUID(),
    updateHash: hash(update),
    expiresAt: Date.now() + 60000,
    update: Buffer.from(update).toString("base64"),
  };
  const send = (body = request) =>
    fetch(`${base}/v1/documents/${room.id}/operations/${body.operationId}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const first = await send(),
    receipt = await first.json();
  expect(first.status).toBe(200);
  expect(receipt.operation.state).toBe("COMMITTED");
  expect(await (await send()).json()).toEqual(receipt);
  expect((await fetch(`${base}/v1/documents/${room.id}/state`, { headers })).status).toBe(409);
  const rejected = await send({ ...request, operationId: crypto.randomUUID(), epoch: 1 });
  expect(rejected.status).toBe(200);
  expect(await rejected.json()).toMatchObject({
    operation: { state: "ABORTED", reason: "EPOCH_CONFLICT" },
  });
  const state = await (
    await fetch(`${base}/v1/documents/${room.id}/state`, {
      headers: { ...headers, "x-tau-document-version": "3" },
    })
  ).json();
  expect(state.protocol.sequence).toBe(receipt.operation.receipt.sequence);
  await b.model.receive(Uint8Array.from(Buffer.from(state.state, "base64")));
  expect(snapshot(b)).toEqual(snapshot(a));

  const beforeCreate = Y.encodeStateVector(a.doc);
  const secondId = await a.create();
  const creation = Y.encodeStateAsUpdate(a.doc, beforeCreate);
  const beforeChild = Y.encodeStateVector(a.doc);
  a.commands().data(secondId, { flip: true });
  const child = Y.encodeStateAsUpdate(a.doc, beforeChild);
  const operation = (bytes: Uint8Array) => ({
    ...request,
    operationId: crypto.randomUUID(),
    updateHash: hash(bytes),
    update: Buffer.from(bytes).toString("base64"),
  });
  const childRequest = operation(child);
  const pending = await send(childRequest);
  expect(pending.status).toBe(409);
  expect(await pending.json()).toMatchObject({ code: "MISSING_DEPENDENCIES" });
  const pendingReceipt = await (
    await fetch(`${base}/v1/documents/${room.id}/operations/${childRequest.operationId}`, {
      headers,
    })
  ).json();
  expect(pendingReceipt.operation.state).toBe("PENDING");
  const unchanged = await (
    await fetch(`${base}/v1/documents/${room.id}/state`, {
      headers: { ...headers, "x-tau-document-version": "3" },
    })
  ).json();
  expect(unchanged.state).toBe(state.state);
  expect(unchanged.protocol.sequence).toBe(state.protocol.sequence);
  expect(await (await send(operation(creation))).json()).toMatchObject({
    operation: { state: "COMMITTED" },
  });
  expect(await (await send(childRequest)).json()).toMatchObject({
    operation: { state: "COMMITTED" },
  });
  const complete = await (
    await fetch(`${base}/v1/documents/${room.id}/state`, {
      headers: { ...headers, "x-tau-document-version": "3" },
    })
  ).json();
  await b.model.receive(Uint8Array.from(Buffer.from(complete.state, "base64")));
  expect(b.model.read()).toEqual(a.model.read());
});
