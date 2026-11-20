import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { SharedDocumentInfo, CollaborationState } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import agentSchema from "@tau/db-schema/schema/content-agent.sql?raw";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { IpcMainInvokeEvent } from "electron";
import { createServer } from "../../../../../../collaboration-server/src/server";
import { CollaborationManager } from "../index";
import type { ContentSessionRuntime } from "../../content-runtime";
import { createLocalContentRuntime } from "../../content-runtime/composition";
import { createDesktopContentServices } from "../../content-runtime/desktop-services";
import { CollaborationLocalStore } from "../local-store";
import type { ContentLocalState } from "../content-local-state";
import { CollaborationAssetService } from "../asset-service";
import type { CollaborationClient } from "../client";
import type { RuntimeSession } from "../types";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentIdentityTable } from "../../tables/content-identity";
import { unregisterContentSession } from "../content-sessions";
import type { DocumentDrain, DocumentDrainScope } from "../../durable-document-lifecycle";
import { cleanup, host } from "./manager-node-document.mocks";
import { must } from "../../../test-support";

export type Runtime = {
  content: Pick<
    SharedSessions,
    "sessions" | "views" | "drainDatabase" | "project" | "startAutoFlush"
  > &
    Pick<ContentSessionRuntime, "broadcast" | "freeze" | "install">;
  store: CollaborationLocalStore;
  contentState: ContentLocalState;
  assets: CollaborationAssetService;
  client: CollaborationClient;
  stopped: boolean;
  attach(session: RuntimeSession): void;
  createContent(event: IpcMainInvokeEvent, contentId: number): Promise<{ documentId: string }>;
  prepareLeave(session: RuntimeSession): Promise<void>;
  discardLocal(session: RuntimeSession): Promise<void>;
  finishLeave(session: RuntimeSession): Promise<void>;
  transports: Map<string, HocuspocusProviderWebsocket>;
  shutdown(): void;
  refresh(): Promise<void>;
  openRoom(id: string): Promise<RuntimeSession>;
  state(): CollaborationState;
  connectLocalRuntime(): void;
  syncRemoteDocument(url: string, info: SharedDocumentInfo): Promise<void>;
};
export type SharedSessions = {
  sessions: Map<string, RuntimeSession>;
  views: Map<string, { documentId: string; windowId: number }>;
  freezeWaiters: Map<string, { id: string }>;
  acknowledgeFreeze(viewId: string, requestId?: string): void;
  drainDatabase(scope: DocumentDrainScope): Promise<DocumentDrain>;
  project(session: RuntimeSession): Promise<void>;
  startAutoFlush(): void;
};

export async function setup(realtime = false, paragraphs?: readonly string[]) {
  const root = mkdtempSync(join(tmpdir(), "tau-manager-flow-"));
  host.dir = root;
  const db = new Database(join(root, "library.db"));
  db.exec(schema);
  host.databases.set("library", db);
  db.prepare(
    "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES (7,1,1,?,2,1)"
  ).run(
    JSON.stringify([
      { type: "paragraph", svg: "用户业务内容", isFold: true, children: [{ text: "正文" }] },
    ])
  );
  const server = await createServer({ dataDir: join(root, "server"), logger: false });
  await server.app.ready();
  if (realtime) {
    host.serverUrl = await server.app.listen({ host: "127.0.0.1", port: 0 });
  }
  const owner = server.store.register("作者");
  let losePublish = false;
  let loseCommit = false;
  let serverDate: number | undefined;
  const client = {
    identities: new Map([[host.serverUrl, owner]]),
    identity: async () => owner,
    serverTime: () => {
      if (serverDate === undefined) throw new Error("缺少服务端时间");
      return serverDate;
    },
    request: async (
      _url: string,
      path: string,
      method = "GET",
      body?: unknown,
      version?: number
    ) => {
      const response = await server.app.inject({
        method: method as "GET" | "POST",
        url: path,
        headers: {
          authorization: `Bearer ${owner.id}:${owner.secret}`,
          ...(version ? { "x-tau-document-version": String(version) } : {}),
        },
        payload: body as Record<string, unknown>,
      });
      serverDate = Date.parse(String(response.headers.date));
      const value = response.json();
      if (response.statusCode >= 400)
        throw Object.assign(new Error(value.message), {
          code: value.code,
          status: response.statusCode,
        });
      if (path.endsWith("/publish") && losePublish) {
        losePublish = false;
        throw new Error("模拟响应丢失");
      }
      if (path.endsWith("/commit") && loseCommit) {
        loseCommit = false;
        throw new Error("模拟提交响应丢失");
      }
      return value;
    },
  } as unknown as CollaborationClient;
  const directory = join(root, "collaboration");
  const store = new CollaborationLocalStore(directory);
  store.db.exec(agentSchema);
  const localDirectory = join(root, "local-content");
  const localStore = new CollaborationLocalStore(localDirectory, "content.db");
  localStore.db.exec(agentSchema);
  const localAssets = new CollaborationAssetService(localStore, root, async () => {
    throw new Error("本机正文无需远端身份");
  });
  const local = createLocalContentRuntime(localStore, localAssets);
  const localSessions = local["sessions"];
  const localState = must(local["contentState"], "local['contentState']");
  const localRuntime = local as unknown as Pick<
    SharedSessions,
    "project" | "drainDatabase" | "views" | "freezeWaiters" | "acknowledgeFreeze" | "startAutoFlush"
  > &
    Pick<
      ContentSessionRuntime,
      "open" | "removeSession" | "releaseLibrary" | "acceptUpdates" | "agent"
    >;
  const shared = new CollaborationManager(() => local);
  const assets = new CollaborationAssetService(store, root, async () => owner);
  const storage = createDesktopContentServices(store, assets);
  shared["initializeContentRuntime"](storage);
  const state = storage.contentState;
  const runtime = shared as unknown as Runtime;
  Object.assign(runtime, {
    client,
    stopped: true,
  });
  runtime.connectLocalRuntime();
  if (!realtime) vi.spyOn(runtime, "attach").mockImplementation(() => {});
  cleanup.push(async () => {
    runtime.shutdown();
    local.shutdown();
    for (const session of [...runtime.content.sessions.values(), ...localSessions.values()]) {
      session.provider?.destroy();
      unregisterContentSession(session);
      session.awareness.destroy();
      session.doc.destroy();
    }
    for (const transport of runtime.transports.values()) transport.destroy();
    store.db.close();
    localStore.db.close();
    db.close();
    await server.app.close();
    rmSync(root, { recursive: true, force: true });
  });
  const event = { sender: {} } as IpcMainInvokeEvent;
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  ContentIdentityTable.establishBaseline(db);
  ContentDocumentTable.commit(
    db,
    7,
    {
      documentId: "test-content",
      contracts: { [paragraph.id]: paragraph.contract },
      content: paragraphs
        ? paragraphs.map((text, index) => ({
            type: "paragraph",
            collabId: index === 0 ? "paragraph" : `paragraph-${index}`,
            tauContract: paragraph.id,
            children: [{ type: "formatted", text }],
          }))
        : [
            {
              type: "paragraph",
              collabId: "paragraph",
              tauContract: paragraph.id,
              svg: "用户业务内容",
              isFold: true,
              children: [{ text: "正文" }],
            },
          ],
    },
    {
      installDocument: true,
      count: paragraphs?.reduce((total, text) => total + text.length, 0) ?? 2,
    }
  );
  const opened = await local.open(event, { contentId: 7 });
  return {
    runtime,
    sharedDirectory: directory,
    local: localRuntime,
    localSessions,
    localStore,
    localDirectory,
    localState,
    localAssets,
    db,
    state,
    store,
    server,
    owner,
    event,
    localId: opened.documentId,
    loseResponse: () => {
      losePublish = true;
    },
    loseCommit: () => {
      loseCommit = true;
    },
  };
}

export async function restartHandoffRuntime(
  original: Awaited<ReturnType<typeof setup>>,
  beforeSharing?: (local: ContentSessionRuntime) => Promise<void>
) {
  original.runtime.shutdown();
  const dispose = (sessions: Iterable<RuntimeSession>) => {
    for (const session of sessions) {
      unregisterContentSession(session);
      session.provider?.destroy();
      session.awareness.destroy();
      session.doc.destroy();
    }
  };
  dispose(original.runtime.content.sessions.values());
  original.runtime.content.sessions.clear();
  dispose(original.localSessions.values());
  original.localSessions.clear();
  const localLog = new CollaborationLocalStore(original.localDirectory, "content.db");
  const localAssets = new CollaborationAssetService(localLog, host.dir, async () => {
    throw new Error("本机正文无需远端身份");
  });
  const local = createLocalContentRuntime(localLog, localAssets);
  await beforeSharing?.(local);
  const shared = new CollaborationManager(() => local);
  vi.spyOn(shared as unknown as Pick<Runtime, "attach">, "attach").mockImplementation(() => {});
  const { ipcMain } = await import("electron");
  const registrations = vi.mocked(ipcMain.handle).mock.calls;
  const start = registrations.length;
  await shared.init();
  Object.assign(shared, { client: original.runtime.client, stopped: true });
  const sharedLog = shared["store"];
  cleanup.push(() => {
    shared.shutdown();
    local.shutdown();
    dispose(shared["content"].activeSessions());
    dispose(local.activeSessions());
    sharedLog.db.close();
    localLog.db.close();
  });
  const commands = new Map(registrations.slice(start));
  const handler = (channel: string) => {
    const registered = commands.get(channel);
    if (!registered) throw new Error(`未注册测试需要的 IPC：${channel}`);
    return registered;
  };
  return { shared, local, sharedLog, localLog, handler };
}
