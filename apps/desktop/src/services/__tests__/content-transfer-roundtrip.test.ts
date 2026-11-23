import Database from "better-sqlite3";
import { Blob as FileBlob, File as NodeFile } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import MAIN_SCHEMA_SQL from "../../../../../packages/db-schema/schema/main.sql?raw";
import { prepareContentContract } from "@tau/db-schema/content-contracts";

const bridge = vi.hoisted(() => {
  const state = {
    databases: new Map<string, import("better-sqlite3").Database>(),
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    active: "source.db",
    directory: "",
    archive: "",
    denyResourceWrite: false,
  };
  window.electron = {
    platform: "darwin",
    invoke: async (channel: string, ...args: unknown[]) => {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const first = args[0] as string;
      if (channel === "module-init:init-module") return { success: true };
      if (channel === "import:copy" && state.denyResourceWrite) throw new Error("模拟资源写入失败");
      if (state.handlers.has(channel))
        return state.handlers.get(channel)!({ sender: bridgeSender }, ...args);
      switch (channel) {
        case "resolve-path":
          return path.resolve(first);
        case "resolve-path-from":
          return path.resolve(first, args[1] as string);
        case "read-binary-file":
          return new Uint8Array(await fs.readFile(first));
        case "write-binary-file":
          if (state.denyResourceWrite) throw new Error("模拟资源写入失败");
          await fs.writeFile(first, args[1] as Uint8Array);
          return;
        case "get-file-basename":
          return path.basename(first, args[1] ? path.extname(first) : undefined);
        case "get-file-extension":
          return path.extname(first);
        case "save-file-with-dialog": {
          const { defaultFileName, data } = args[0] as {
            defaultFileName: string;
            data: string | Uint8Array;
          };
          state.archive = path.join(state.directory, defaultFileName);
          await fs.writeFile(state.archive, data);
          return { canceled: false, filePath: state.archive };
        }
        case "show-in-folder":
          return;
        case "get-sep":
          return path.sep;
        case "get-home-dir":
          return state.directory;
        case "get-app-dir":
          return path.join(state.directory, state.active.replace(/\.db$/, ""));
        case "path-exists":
          return (await import("node:fs")).existsSync(first);
        case "create-dir":
          return fs.mkdir(first, { recursive: true });
        case "generate-cache-key":
          return (await import("node:crypto")).createHash("md5").update(first).digest("hex");
        default:
          break;
      }

      const scope = args.at(-1) as { toolDatabaseName?: string } | undefined;
      const db = state.databases.get(scope?.toolDatabaseName ?? state.active);
      if (!db) throw new Error("测试资料库未连接");
      if (scope?.toolDatabaseName) args.pop();
      const handlers: Record<string, (...args: never[]) => unknown> = {
        ...CardTable.getListenEvents(),
        ...ArticleTable.getListenEvents(),
        ...ContentTable.getListenEvents(),
      };
      const handler = handlers[channel];
      if (!handler) throw new Error(`未桥接的命令：${channel}`);
      const ctx = { broadcastOthers: () => {}, broadcastAll: () => {} };
      return executeDatabaseCommand(db, handler, ...([db, ...args, ctx] as never[]));
    },
    on: () => () => {},
    off: () => {},
    send: () => {},
  } as unknown as ElectronAPI;
  return state;
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (key: string, fn: (...args: unknown[]) => unknown) => bridge.handlers.set(key, fn),
  },
  app: { getPath: () => bridge.directory },
}));
vi.mock("../../../src-electron/main/modules/video-note-index-queue");
vi.mock("../../../src-electron/main/services/content-execution", () => ({
  contentExecutor: {
    execute: async (request: unknown) => {
      await import("@/app/plugins/content-runtime");
      return (
        globalThis as unknown as { tauContentExecute(input: unknown): Promise<unknown> }
      ).tauContentExecute({ hash: "transfer-roundtrip", artifacts: [], request });
    },
  },
}));

import { EventEmitter } from "node:events";
import { registerImportWorkspaces } from "../../../src-electron/main/modules/import-workspace-ipc";
import PathUtil from "../../../src-electron/main/utils/PathUtil";
import "@/commands/contracts/install";
import { createCard } from "@/commands/card";
import { getContentById } from "@/commands/content";
import { executeImport, scanImport } from "@/services/batch-import";
import { rememberDatabaseConnection } from "@/services/command-context";
import { exportContentAsMarkdown } from "@/services/content-transfer";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { useImportHistoryStore } from "@/stores/useImportHistoryStore";

import CardTable from "../../../src-electron/main/modules/tables/card";
import ArticleTable from "../../../src-electron/main/modules/tables/article";
import ContentTable from "../../../src-electron/main/modules/tables/content";
import { executeDatabaseCommand } from "../../../src-electron/main/modules/database-command";
const bridgeSender = new EventEmitter();
const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", children });
const asContent = (nodes: unknown[]) => nodes as Descendant[];
const selectLibrary = (name: string) => {
  bridge.active = name;
  rememberDatabaseConnection({ databaseName: name, connectionId: `roundtrip-${name}` });
  useSettingStore.setState(({ setting }) => ({
    setting: {
      ...setting,
      imageBed: { ...setting.imageBed, active: EImageBed.Local, enableCompression: false },
      database: { ...setting.database, active: name },
    },
  }));
};

beforeAll(async () => {
  registerImportWorkspaces();
  vi.spyOn(PathUtil, "getHomeDir").mockImplementation(() => bridge.directory);
  vi.spyOn(PathUtil, "getAppDir").mockImplementation(() =>
    join(bridge.directory, bridge.active.replace(/\.db$/, ""))
  );
  await useDynamicExtensionsStore.getState().initExtensions();
}, 30_000);
beforeEach(async () => {
  vi.stubGlobal("Blob", FileBlob);
  vi.stubGlobal("File", NodeFile);
  bridge.directory = await mkdtemp(join(tmpdir(), "tau-transfer-"));
  bridge.archive = "";
  bridge.denyResourceWrite = false;
  for (const name of ["source.db", "destination.db"]) {
    const db = new Database(join(bridge.directory, name));
    bridge.databases.set(name, db);
    db.exec(MAIN_SCHEMA_SQL);
    await mkdir(join(bridge.directory, name.replace(/\.db$/, "")));
  }
  selectLibrary("source.db");
});
afterEach(async () => {
  useImportHistoryStore.setState({ records: [] });
  for (const db of bridge.databases.values()) db.close();
  bridge.databases.clear();
  vi.unstubAllGlobals();
  await rm(bridge.directory, { recursive: true, force: true });
});

it("正式 Markdown 导出和批量导入在独立库保留正文、契约和资源，并降级包外链接", async () => {
  const sourceImage = join(bridge.directory, "source", "示例 图片.png");
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6McUAAAAASUVORK5CYII=",
    "base64"
  );
  await writeFile(sourceImage, image);
  const linked = await createCard({
    content: asContent([paragraph(text("包外卡片"))]),
    tags: [],
    isTop: false,
    count: 0,
  });
  const retired = await prepareContentContract("historical-plugin", {
    type: "historical-code",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
  });
  const card = await createCard({
    content: asContent([
      paragraph(text("随包正文"), {
        type: "content-link",
        contentType: "card",
        refId: linked.id,
        contentId: linked.contentId,
        contentTitle: "包外卡片",
        children: [text("")],
      }),
      { type: "image", url: sourceImage, alt: "资料配图", children: [text("")] },
      {
        type: "historical-code",
        tauContract: retired.id,
        source: "保留自旧版插件的正文",
        children: [text("")],
      },
    ]),
    contracts: { [retired.id]: retired.contract },
    tags: [],
    isTop: false,
    count: 0,
  });
  const original = await getContentById(card.contentId);
  expect(original?.content).toEqual(card.content);
  const sourceDb = bridge.databases.get("source.db")!;
  const sourceDocument = sourceDb
    .prepare("SELECT document_id FROM content_documents WHERE content_id=?")
    .get(card.contentId);

  await exportContentAsMarkdown({ title: "往返", content: [], contentId: card.contentId });
  expect(basename(bridge.archive)).toBe("往返.zip");
  expect(existsSync(bridge.archive)).toBe(true);

  selectLibrary("destination.db");
  const plan = await scanImport(bridge.archive);
  const markdown = await plan.source.readText("往返.md");
  expect(markdown).toContain("随包正文包外卡片");
  expect(markdown).not.toContain("content-link");
  expect(markdown).not.toContain(sourceImage);
  expect(plan.assets.size).toBe(1);
  const [asset] = [...plan.assets.values()];
  expect(asset.location.kind).toBe("source");
  const options = {
    target: "article" as const,
    projectTitle: "",
    selected: new Set(plan.docs.map(doc => doc.key)),
    useSourceTags: true,
    importTables: false,
  };
  const { result } = await executeImport(plan, options);
  expect(result.stopped, result.error).toBeUndefined();
  expect(result).toMatchObject({ docCount: 1, assetCount: 1, warnings: [] });

  const destinationDb = bridge.databases.get("destination.db")!;
  const row = destinationDb
    .prepare("SELECT content_id FROM articles WHERE id=?")
    .get(result.entityIds[0]) as { content_id: number };
  const copied = await getContentById(row.content_id);
  expect(copied).toMatchObject({
    refCount: 1,
    content: [
      { type: "paragraph", children: [{ text: "随包正文包外卡片" }] },
      { type: "image", url: expect.stringContaining("~/destination/resources/") },
      { type: "historical-code", tauContract: retired.id, source: "保留自旧版插件的正文" },
    ],
  });
  const importedImage = copied!.content[1] as { url: string };
  const destinationImage = resolve(bridge.directory, importedImage.url.slice(2));
  const destinationBytes = await readFile(destinationImage);
  expect(destinationBytes).toEqual(image);
  const sourceContractIds = original!.contracts!;
  for (const node of copied!.content as (Descendant & {
    tauContract: string;
    collabId: string;
  })[]) {
    expect(sourceContractIds[node.tauContract]).toEqual(copied!.contracts?.[node.tauContract]);
    expect(copied!.contracts?.[node.tauContract]).toBeDefined();
    expect(JSON.stringify(original!.content)).not.toContain(node.collabId);
  }
  expect(destinationDb.prepare("SELECT document_id FROM content_documents").get()).not.toEqual(
    sourceDocument
  );

  bridge.denyResourceWrite = true;
  const failedAsset = await executeImport(plan, options);
  expect(failedAsset.result).toMatchObject({
    docCount: 1,
    assetCount: 0,
    warnings: [expect.any(String)],
  });
  expect(failedAsset.result.warnings[0]).toContain("模拟资源写入失败");
  const fallback = destinationDb
    .prepare("SELECT content_id FROM articles WHERE id=?")
    .get(failedAsset.result.entityIds[0]) as { content_id: number };
  expect((await getContentById(fallback.content_id))?.content[1]).toMatchObject({
    type: "image",
    url: asset.location.path,
  });
  expect(await readFile(destinationImage)).toEqual(image);
  await plan.source.close();
  selectLibrary("source.db");
  expect(await getContentById(card.contentId)).toEqual(original);
  expect(await readFile(sourceImage)).toEqual(image);
}, 30_000);
