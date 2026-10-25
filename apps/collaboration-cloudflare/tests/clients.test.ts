import { prepareContentContract } from "../../../packages/db-schema/content-contracts";
import { createSharedDocument } from "@tau/collaboration/src/testing/legacy-document";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  readSharedContent as readLegacyContent,
  readNodeDocument,
  createNodeDocument,
  NodeTree,
  getBody,
  type DeviceIdentity,
} from "@tau/collaboration";
import { CollaborationClient } from "../../desktop/src-electron/main/modules/collaboration/client";
import type { CollaborationLocalStore } from "../../desktop/src-electron/main/modules/collaboration/local-store";

const harness = vi.hoisted(() => ({
  url: "",
  key: "",
  mobile: null as DeviceIdentity | null,
  cache: new Map<string, { metadata: any; state: string; updates: string[]; revision: string }>(),
}));
const productionRehearsal = process.env.COLLAB_TEST_ENV === "production-rehearsal";

function required<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

vi.mock("@tau/collaboration", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/collaboration")>()),
  get DEFAULT_COLLABORATION_URL() {
    return harness.url;
  },
}));
vi.mock("../../mobile/src/services/tauri", () => ({
  collabListBindings: async () => [],
  collabReadCache: async (id: string) => harness.cache.get(id) ?? null,
  collabWriteCache: async (
    payload: { documentId: string; metadata: unknown; state: string },
    snapshot: boolean
  ) => {
    const previous = harness.cache.get(payload.documentId);
    const revision = String(Number(previous?.revision ?? 0) + 1);
    harness.cache.set(payload.documentId, {
      metadata: payload.metadata,
      state: snapshot ? payload.state : (previous?.state ?? ""),
      updates: snapshot
        ? []
        : [...(previous?.updates ?? []), ...(payload.state ? [payload.state] : [])],
      revision,
    });
    return revision;
  },
  collabNodeViews: async () => ({}),
  collabListCache: async () => [...harness.cache.values()].map(value => value.metadata),
  readSettingJson: async () => JSON.stringify({ collaboration: { nickname: "移动端原型" } }),
}));
// 仅替代本机 Tauri IPC；REST 路径、协作编排、Y.Doc 和 WebSocket 均运行生产实现。
const prototypeInvoke = async (
  command: string,
  input: { payload: { serverUrl: string; path: string; method: string; body: unknown } }
) => {
  expect(input.payload.serverUrl).toBe(harness.url);
  if (command === "collab_get_identity") return harness.mobile;
  if (command !== "collab_request") throw new Error("未支持的测试 IPC：" + command);
  const identity = required(harness.mobile, "移动端测试身份未初始化");
  const response = await fetch(harness.url + input.payload.path, {
    method: input.payload.method,
    headers: {
      authorization: "Bearer " + identity.id + ":" + identity.secret,
      "content-type": "application/json",
      "x-tau-document-version": "2",
    },
    body: input.payload.body == null ? undefined : JSON.stringify(input.payload.body),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message);
  return body;
};

let worker: Miniflare | undefined;
let directory: string;
let mobile: (typeof import("../../mobile/src/features/collaboration/core/manager"))["collaborationManager"];
let desktop: CollaborationClient;
const cleanups: (() => void)[] = [];
class BrowserWebSocket extends WebSocket {
  constructor(url: string, protocols?: string | string[]) {
    super(url, protocols);
    this.on("error", () => {
      // 浏览器通过事件报告连接错误，不像 Node EventEmitter 那样抛出未监听异常。
    });
  }
}
const until = async (
  check: () => boolean | Promise<boolean>,
  message: string,
  timeout = 20_000
) => {
  await vi.waitFor(async () => expect(await check(), message).toBe(true), {
    timeout,
    interval: 30,
  });
};
const request = async (path: string, method = "GET", body?: unknown, admin = false) => {
  const response = await fetch(harness.url + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(admin ? { [productionRehearsal ? "x-admin-key" : "x-prototype-key"]: harness.key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
};
const register = async (nickname: string): Promise<DeviceIdentity> => {
  const result = await request("/v1/devices", "POST", { nickname }, true);
  expect(result.response.status).toBe(200);
  return result.body;
};
async function start(port = 0) {
  worker = new Miniflare(
    convertV4MiniflareOptions({
      name: "tau-collab-prototype",
      modules: true,
      scriptPath: resolve("dist/index.js"),
      compatibilityDate: "2026-10-18",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { COLLAB: { className: "PrototypeCollaboration", useSQLite: true } },
      resourcePersistencePath: directory,
      bindings: { PROTOTYPE_KEY: harness.key, BUILD_REV: "local-validation" },
      host: "127.0.0.1",
      port,
    })
  );
  const url = await worker.ready;
  harness.url = url.origin;
}

beforeAll(async () => {
  vi.stubGlobal("WebSocket", BrowserWebSocket);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      __TAURI_INTERNALS__: { invoke: prototypeInvoke },
    })
  );
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  directory = mkdtempSync(join(tmpdir(), "tau-cloudflare-prototype-"));
  harness.key = "local-test-" + crypto.randomUUID();
  if (process.env.COLLAB_PROTOTYPE_URL) {
    const url = new URL(process.env.COLLAB_PROTOTYPE_URL);
    const prefix = productionRehearsal ? "tau-collaboration." : "tau-collab-prototype.";
    if (!url.hostname.startsWith(prefix) || !url.hostname.endsWith(".workers.dev"))
      throw new Error("远端验证仅允许独立原型 workers.dev 域名");
    harness.url = url.origin;
    const varsPath = productionRehearsal
      ? resolve(homedir(), ".local/share/tau/collaboration-cloudflare/production.env")
      : resolve(".dev.vars");
    const keyPattern = productionRehearsal ? /^ADMIN_KEY=(.+)$/m : /^PROTOTYPE_KEY=(.+)$/m;
    harness.key = required(
      readFileSync(varsPath, "utf8").match(keyPattern)?.[1],
      "缺少本机原型验证凭据"
    ).trim();
    if (productionRehearsal) {
      const health = await request("/health/ready");
      if (!String(health.body.instance).startsWith("rehearsal-"))
        throw new Error("正式客户端回归只允许独立迁移演练实例");
    }
  } else await start();
  const values = new Map<string, unknown>();
  desktop = new CollaborationClient({
    get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
    set: (key: string, value: unknown) => values.set(key, value),
    delete: (key: string) => values.delete(key),
  } as unknown as CollaborationLocalStore);
  desktop.saveIdentity(harness.url, await register("桌面端原型"));
  harness.mobile = await register("移动端原型");
  mobile = (await import("../../mobile/src/features/collaboration/core/manager"))
    .collaborationManager;
});

afterAll(async () => {
  mobile?.stop();
  for (const cleanup of cleanups.reverse()) cleanup();
  await worker?.dispose();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
afterEach(() => {
  mobile?.stop();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

const documentIdentities = new Map<
  string,
  { protocolVersion: number; baselineId: string; epoch: number }
>();
const readSharedContent = (doc: Y.Doc) =>
  doc.getMap("meta").get("version") === 2 ? readNodeDocument(doc) : readLegacyContent(doc);
async function closeDocument(id: string) {
  const protocol = await desktop.request<{ revision: string }>(
    harness.url,
    `/v1/documents/${id}/protocol`
  );
  await desktop.request(harness.url, `/v1/documents/${id}/close`, "POST", {
    expectedRevision: protocol.revision,
  });
}
const seed = (title: string, text = "协作正文") =>
  createSharedDocument({
    title,
    content: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
    bannerBg: "",
    bannerPosition: "center",
  });
async function publish(title: string, text?: string, structured = false) {
  const created = await desktop.request<{ id: string }>(harness.url, "/v1/documents", "POST", {
    idempotencyKey: crypto.randomUUID(),
  });
  const paragraph = structured
    ? await prepareContentContract("tau.paragraph", {
        type: "paragraph",
        dataVersion: 1,
        kind: "block",
      })
    : null;
  const baselineId = crypto.randomUUID();
  const doc = paragraph
    ? await createNodeDocument(
        { documentId: created.id, baselineId, epoch: 0 },
        {
          title,
          content: [
            {
              type: "paragraph",
              tauContract: paragraph.id,
              children: [{ text: text ?? "协作正文" }],
            },
          ],
          bannerBg: "",
          bannerPosition: "center",
        },
        { [paragraph.id]: paragraph.contract }
      )
    : seed(title, text);
  if (paragraph) documentIdentities.set(created.id, { protocolVersion: 2, baselineId, epoch: 0 });
  await desktop.request(harness.url, "/v1/documents/" + created.id + "/publish", "POST", {
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
  });
  doc.destroy();
  return created.id;
}
function connect(id: string) {
  const doc = new Y.Doc();
  const transport = new HocuspocusProviderWebsocket({
    url: harness.url.replace(/^http/, "ws") + "/ws",
    WebSocketPolyfill: BrowserWebSocket,
    initialDelay: 100,
    minDelay: 100,
    maxDelay: 1000,
  });
  const provider = new HocuspocusProvider({
    name: id,
    document: doc,
    websocketProvider: transport,
    token: async () =>
      (
        await desktop.request<{ ticket: string }>(harness.url, "/v1/tickets", "POST", {
          documentId: id,
          ...documentIdentities.get(id),
        })
      ).ticket,
  });
  provider.attach();
  cleanups.push(() => {
    provider.destroy();
    transport.destroy();
    doc.destroy();
  });
  return { doc, provider, transport };
}
function appendBody(doc: Y.Doc, text: string) {
  if (doc.getMap("meta").get("version") === 2) {
    const tree = new NodeTree(doc);
    try {
      const id = String(tree.read()[0].collabId);
      tree.insertText(id, tree.content(id).length, text, "test-input");
    } finally {
      tree.dispose();
    }
    return;
  }
  const paragraph = getBody(doc)
    .toDelta()
    .find(item => item.insert instanceof Y.XmlText)?.insert;
  if (!(paragraph instanceof Y.XmlText)) throw new Error("测试文档缺少正文段落");
  paragraph.insert(paragraph.length, text);
}

describe("Cloudflare 原型与现有两端客户端", () => {
  it("注册需要凭据，审批加入后双向同步，离线改动合并，服务重启后恢复", async () => {
    console.info("验证阶段：注册保护与发布");
    if (!productionRehearsal)
      expect((await request("/v1/devices", "POST", { nickname: "未授权" })).response.status).toBe(
        403
      );
    const id = await publish("双端协作", undefined, true);
    const initial = await desktop.request<{ state: string }>(
      harness.url,
      "/v1/documents/" + id + "/state",
      "GET",
      undefined,
      2
    );
    const initialDoc = new Y.Doc();
    Y.applyUpdate(initialDoc, Buffer.from(initial.state, "base64"));
    expect(readSharedContent(initialDoc).title).toBe("双端协作");
    initialDoc.destroy();
    console.info("验证阶段：双端加入与同步");
    const owner = connect(id);
    await until(() => owner.provider.synced, "桌面端应完成初始同步");
    await mobile.start({ nickname: "移动端原型" });
    const invitation = await desktop.request<{ code: string }>(
      harness.url,
      "/v1/documents/" + id + "/invitation",
      "POST"
    );
    const pending = await mobile.joinByCode(invitation.code);
    expect(pending.status).toBe("pending");
    const identity = required(harness.mobile, "移动端测试身份未初始化");
    const forbidden = await fetch(harness.url + "/v1/documents/" + id + "/state", {
      headers: { authorization: "Bearer " + identity.id + ":" + identity.secret },
    });
    expect(forbidden.status).toBe(403);
    if (pending.status !== "pending") throw new Error("未创建申请");
    await desktop.request(harness.url, "/v1/join-requests/" + pending.id + "/decision", "POST", {
      approve: true,
    });
    await mobile.openDocument(id);
    const guest = required(mobile.session(id), "移动端未建立协作会话");
    cleanups.push(() => guest.doc.destroy());
    await until(() => !!guest.provider?.synced, "移动端应完成初始同步");
    appendBody(owner.doc, "｜桌面输入");
    await until(
      () => JSON.stringify(readSharedContent(guest.doc).content).includes("桌面输入"),
      "移动端应收到桌面正文"
    );
    appendBody(guest.doc, "｜手机输入");
    await until(
      () => JSON.stringify(readSharedContent(owner.doc).content).includes("手机输入"),
      "桌面端应收到手机正文"
    );
    await until(
      () => !guest.provider?.hasUnsyncedChanges && !owner.provider.hasUnsyncedChanges,
      "编辑应确认已保存"
    );

    required(guest.provider, "移动端未建立协作连接").configuration.websocketProvider.disconnect();
    await until(() => guest.info.connection === "offline", "移动端应进入离线状态");
    appendBody(guest.doc, "｜手机离线");
    appendBody(owner.doc, "｜桌面在线");
    window.dispatchEvent(new Event("online"));
    await until(() => {
      const text = JSON.stringify(readSharedContent(owner.doc).content);
      return (
        text.includes("手机离线") &&
        text.includes("桌面在线") &&
        !!guest.provider?.synced &&
        !guest.provider?.hasUnsyncedChanges
      );
    }, "移动端恢复网络后应自动合并离线和在线改动");
    expect(readSharedContent(guest.doc)).toEqual(readSharedContent(owner.doc));
    console.info("验证阶段：桌面端离线恢复");

    owner.transport.disconnect();
    await until(() => !owner.provider.synced, "桌面端应进入离线状态");
    appendBody(owner.doc, "｜桌面离线");
    appendBody(guest.doc, "｜手机在线");
    await owner.transport.connect();
    await until(
      () =>
        JSON.stringify(readSharedContent(guest.doc).content).includes("桌面离线") &&
        !owner.provider.hasUnsyncedChanges,
      "桌面端恢复连接后应合并离线改动"
    );
    await until(() => !guest.provider?.hasUnsyncedChanges, "手机改动应已保存");
    const expected = readSharedContent(owner.doc);
    const oldPort = Number(new URL(harness.url).port);
    console.info("验证阶段：重启 workerd 并读取持久化数据");
    if (worker) {
      await worker.dispose();
      worker = undefined;
      await start(oldPort);
    } else if (productionRehearsal) {
      expect(
        (await request("/_admin/maintenance", "POST", { enabled: true }, true)).response.status
      ).toBe(200);
      expect(
        (await request("/_admin/maintenance", "POST", { enabled: false }, true)).response.status
      ).toBe(200);
    } else
      expect((await request("/__prototype/restart", "POST", undefined, true)).response.status).toBe(
        200
      );
    await until(async () => {
      const snapshot = await desktop.request<{ state: string }>(
        harness.url,
        "/v1/documents/" + id + "/state",
        "GET",
        undefined,
        2
      );
      const recovered = new Y.Doc();
      try {
        Y.applyUpdate(recovered, Buffer.from(snapshot.state, "base64"));
        return JSON.stringify(readSharedContent(recovered)) === JSON.stringify(expected);
      } finally {
        recovered.destroy();
      }
    }, "服务重启后应从持久化数据恢复正文");
    await until(
      () => owner.provider.synced && !!guest.provider?.synced,
      "两端应在服务恢复后自动重连"
    );
    appendBody(guest.doc, "｜重启后继续编辑");
    await until(
      () => JSON.stringify(readSharedContent(owner.doc).content).includes("重启后继续编辑"),
      "恢复后应能继续协作"
    );
    await closeDocument(id);
    await until(() => !mobile.session(id), "结束共享事件应送达移动端");
  });

  it("超过 2MB 的文档快照分块持久化并能完整读取", async () => {
    const text = "x".repeat(3 * 1024 * 1024);
    const id = await publish("大文档", text);
    const snapshot = await desktop.request<{ state: string }>(
      harness.url,
      "/v1/documents/" + id + "/state",
      "GET",
      undefined,
      2
    );
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(snapshot.state, "base64"));
      expect(readSharedContent(doc).content[0].children?.[0]?.text).toBe(text);
    } finally {
      doc.destroy();
    }
    await closeDocument(id);
  });

  it.runIf(!!process.env.COLLAB_PROTOTYPE_REDEPLOY)(
    "真实 Worker 版本切换后保留身份、权限与协作文档",
    async () => {
      if (!process.env.COLLAB_PROTOTYPE_URL) throw new Error("重新部署验证只允许独立远端原型");
      const id = await publish("重新部署持久化");
      const owner = connect(id);
      await until(() => owner.provider.synced, "部署前应完成同步");
      appendBody(owner.doc, "｜部署前已确认的编辑");
      await until(() => !owner.provider.hasUnsyncedChanges, "部署前应确认写入已落盘");
      const expected = readSharedContent(owner.doc);
      owner.transport.disconnect();
      await until(() => !owner.provider.synced, "发布切换前应释放旧连接");
      const revision = "validation-" + Date.now();
      await promisify(execFile)("pnpm", ["run", "deploy:prototype"], {
        env: { ...process.env, COLLAB_PROTOTYPE_BUILD_REV: revision },
        timeout: 90_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      await until(
        async () => (await request("/health/ready")).body.build === revision,
        "新 Worker 版本应生效",
        90_000
      );
      const snapshot = await desktop.request<{ state: string }>(
        harness.url,
        "/v1/documents/" + id + "/state",
        "GET",
        undefined,
        2
      );
      const recovered = new Y.Doc();
      try {
        Y.applyUpdate(recovered, Buffer.from(snapshot.state, "base64"));
        expect(readSharedContent(recovered)).toEqual(expected);
      } finally {
        recovered.destroy();
      }
      const fresh = connect(id);
      await until(() => fresh.provider.synced, "新连接应从持久化文档恢复");
      expect(readSharedContent(fresh.doc)).toEqual(expected);
      await closeDocument(id);
    },
    180_000
  );
});
