import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { rememberDatabaseConnection } from "@/services/command-context";
import { encodeContentRef } from "@/utils/plugin-content-ref";
import type { PluginPermissionSnapshot } from "@/types/plugin-permissions";
import type { ContentExecutionRequest } from "../../../../shared/content-execution";
import { executeDatabaseCommand } from "../../../../src-electron/main/modules/database-command";
import CardTable from "../../../../src-electron/main/modules/tables/card";
import { ContentDocumentTable } from "../../../../src-electron/main/modules/tables/content-document";
import PluginDataTable from "../../../../src-electron/main/modules/tables/plugin-data";
import { createDesktopData } from "../data";
import { DesktopPermissionBroker, usePluginPermissionUi } from "../permissions";

const bridge = vi.hoisted(() => {
  const transport = { invoke: vi.fn(), platform: "darwin", on: vi.fn(), off: vi.fn() };
  Object.defineProperty(window, "electron", { configurable: true, value: transport });
  return transport;
});

vi.mock("electron");
vi.mock("../../../../src-electron/main/modules/video-note-index-queue");
vi.mock("../../../../src-electron/main/services/content-execution", () => ({
  contentExecutor: {
    execute: async (request: ContentExecutionRequest) => {
      await import("../content-runtime");
      return (
        globalThis as unknown as { tauContentExecute(input: unknown): Promise<unknown> }
      ).tauContentExecute({ hash: "sqlite-plugin-permissions", artifacts: [], request });
    },
  },
}));

const pluginId = "test.sqlite-write-permissions";
const primaryName = "plugin-primary.db";
const secondaryName = "plugin-secondary.db";

async function seed(db: Database.Database, label: string) {
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const card = CardTable.createCard(db, {
    content: [
      {
        type: "paragraph",
        tauContract: paragraph.id,
        children: [{ type: "formatted", text: label }],
      },
    ] as never,
    contracts: { [paragraph.id]: paragraph.contract },
    tags: [],
    isTop: false,
    count: 0,
  });
  const stored = ContentDocumentTable.read(db, card.contentId)!;
  const { create_time } = db
    .prepare("SELECT create_time FROM contents WHERE id = ?")
    .get(card.contentId) as { create_time: number };
  return {
    contentId: card.contentId,
    ref: encodeContentRef(card.contentId, create_time),
    revision: stored.revision,
  };
}

function sqliteState(db: Database.Database) {
  return ["contents", "content_documents", "cards", "operation"].map(table =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  );
}

let directory: string;
let primary: Database.Database;
let secondary: Database.Database;
let host: PluginHost;
let broker: DesktopPermissionBroker;
let context: PluginContext;
let canPrompt: boolean;
let target: Awaited<ReturnType<typeof seed>>;
let editCalls: number;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "tau-plugin-write-permissions-"));
  primary = new Database(join(directory, primaryName));
  secondary = new Database(join(directory, secondaryName));
  primary.exec(schema);
  secondary.exec(schema);
  target = await seed(primary, "原库正文");
  await seed(secondary, "另一库正文");
  const connections = new Map([
    [primaryName, { db: primary, token: "primary-connection" }],
    [secondaryName, { db: secondary, token: "secondary-connection" }],
  ]);
  rememberDatabaseConnection({ databaseName: primaryName, connectionId: "primary-connection" });
  const handlers = PluginDataTable.getListenEvents();
  const notifications = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };
  let grants: PluginPermissionSnapshot = {};
  editCalls = 0;
  bridge.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    if (channel === "module-init:init-module") return { success: true };
    if (channel === "plugin-permissions:snapshot") return structuredClone(grants);
    if (channel === "plugin-permissions:record") return;
    if (channel === "plugin-permissions:set") {
      const [workspace, plugin, permission, value] = args;
      expect([workspace, plugin, permission]).toEqual([primaryName, pluginId, "cards:write"]);
      grants = value === "granted" ? { [pluginId]: { "cards:write": "granted" } } : {};
      return;
    }
    const [request, scope] = args as [
      { databaseName: string },
      { toolDatabaseName: string; toolDatabaseConnection: string },
    ];
    const connection = connections.get(scope.toolDatabaseName);
    if (
      !connection ||
      request.databaseName !== scope.toolDatabaseName ||
      scope.toolDatabaseConnection !== connection.token
    )
      throw new Error("数据库连接已变化");
    const db = connection.db;
    if (channel === "plugin-data:content")
      return executeDatabaseCommand(
        db,
        handlers[channel],
        db,
        request as Parameters<(typeof handlers)[typeof channel]>[1]
      );
    if (channel === "plugin-data:edit-content") {
      editCalls++;
      return executeDatabaseCommand(
        db,
        handlers[channel],
        db,
        request as Parameters<(typeof handlers)[typeof channel]>[1],
        notifications
      );
    }
    throw new Error(`测试遇到未接入的通道 ${channel}`);
  });
  canPrompt = true;
  broker = new DesktopPermissionBroker(primaryName, () => canPrompt);
  host = new PluginHost({
    workspaceId: primaryName,
    storage: createMemoryStorage(),
    permissions: broker,
    data: createDesktopData(primaryName),
  });
  host.registerTrusted({
    ...definePlugin({
      id: pluginId,
      name: "正文写入权限测试",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    }),
    permissions: ["cards:write"],
  });
  await host.enable(pluginId);
});

afterEach(async () => {
  await host?.dispose();
  broker?.dispose();
  primary?.close();
  secondary?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  bridge.invoke.mockReset();
});

const edit = (label: string, revision = target.revision) =>
  context.content.edit(
    target.ref,
    { op: "replaceAll", content: { markdown: label } },
    { expectedRevision: revision }
  );

it("拒绝与撤权阻止 SQLite 写入，授权后的插件编辑提交正文和新修订", async () => {
  const before = sqliteState(primary);
  const denied = expect(edit("被拒绝")).rejects.toMatchObject({
    name: "PluginPermissionError",
    reason: "denied",
  });
  await vi.waitFor(() => expect(usePluginPermissionUi.getState().prompts).toHaveLength(1));
  const [prompt] = usePluginPermissionUi.getState().prompts;
  expect(prompt.permissions).toEqual(["cards:write"]);
  prompt.settle("deny");
  await denied;
  expect(editCalls).toBe(0);
  expect(sqliteState(primary)).toEqual(before);

  await broker.grant(pluginId, "cards:write", "always");
  const { revision } = await edit("授权正文");
  expect(revision).not.toBe(target.revision);
  expect(ContentDocumentTable.read(primary, target.contentId)).toMatchObject({
    content: [{ children: [{ text: "授权正文" }] }],
    revision,
  });
  expect(editCalls).toBe(1);

  await broker.reset(pluginId, "cards:write");
  canPrompt = false;
  const committed = sqliteState(primary);
  await expect(edit("撤权后迟到的修改", revision)).rejects.toMatchObject({
    name: "PluginPermissionError",
    reason: "unavailable",
  });
  expect(editCalls).toBe(1);
  expect(sqliteState(primary)).toEqual(committed);
});

it("切库停用后迟到的授权答复不会写入任一资料库", async () => {
  const before = [sqliteState(primary), sqliteState(secondary)];
  const stopped = expect(edit("迟到的授权修改")).rejects.toThrow();
  await vi.waitFor(() => expect(usePluginPermissionUi.getState().prompts).toHaveLength(1));
  const [prompt] = usePluginPermissionUi.getState().prompts;
  rememberDatabaseConnection({ databaseName: secondaryName, connectionId: "secondary-connection" });
  await host.disable(pluginId);
  expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
  prompt.settle("always");
  await stopped;
  expect(editCalls).toBe(0);
  expect([sqliteState(primary), sqliteState(secondary)]).toEqual(before);
});
