import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

// 渲染端命令直连真实主进程正文表：验证写回过得了主进程的身份与契约校验
const bridge = vi.hoisted(() => {
  const state = { db: null as import("better-sqlite3").Database | null };
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    const { default: ContentTable } =
      await import("../../../src-electron/main/modules/tables/content");
    const ctx = { broadcastOthers: () => {}, broadcastAll: () => {} };
    if (channel === "content:get-by-id")
      return ContentTable.getContentById(state.db!, args[0] as number);
    if (channel === "content:create")
      return ContentTable.createContent(state.db!, args[0] as never);
    if (channel === "content:update")
      return ContentTable.writeContent(state.db!, args[0] as number, args[1] as never, ctx);
    throw new Error(`未桥接的命令：${channel}`);
  });
  window.electron = {
    platform: "darwin",
    invoke,
    on: () => () => {},
    off: () => {},
    send: () => {},
  } as unknown as ElectronAPI;
  return state;
});
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../../src-electron/main/modules/video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../packages/db-schema/schema/main.sql?raw";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { createContent, getContentById, replaceContent, updateContent } from "../content";
import { importFromMarkdown } from "@/utils/markdown";

beforeAll(() => useDynamicExtensionsStore.getState().initExtensions(), 30_000);
beforeEach(() => {
  bridge.db = new Database(":memory:");
  bridge.db.exec(MAIN_SCHEMA_SQL);
});
afterEach(() => bridge.db?.close());

const paragraph = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as unknown as Descendant[];

it("裸节点直接 updateContent 会被主进程拒绝（统一入口要解决的问题）", async () => {
  const id = (await createContent(paragraph("原文"), 2))!;
  const current = (await getContentById(id))!;
  await expect(updateContent(id, importFromMarkdown("改写后"), current.revision)).rejects.toThrow(
    "正文节点身份或子树无效"
  );
});

it("Markdown 写回已有正文：绑定契约与身份，保留业务语法，修订号推进", async () => {
  const id = (await createContent(paragraph("原文"), 2))!;
  const before = (await getContentById(id))!;
  const updated = (await replaceContent(id, {
    markdown: "改写后:content-link[卡片]{refId=1 contentId=2 contentType=card}",
  }))!;
  expect(updated.revision).not.toBe(before.revision);
  expect(JSON.stringify(updated.content)).toContain('"type":"content-link"');
  const visit = (nodes: Descendant[]): void =>
    nodes.forEach(node => {
      if (!("children" in node)) return;
      const element = node as unknown as Record<string, unknown>;
      expect(typeof element.collabId).toBe("string");
      expect(updated.contracts?.[element.tauContract as string]?.type).toBe(element.type);
      visit(node.children as Descendant[]);
    });
  visit(updated.content);
});

it("节点写回已有正文同样绑定契约；过期修订号被拒", async () => {
  const id = (await createContent(paragraph("原文"), 2))!;
  const stale = (await getContentById(id))!.revision;
  await replaceContent(id, { nodes: paragraph("第一次") });
  await expect(replaceContent(id, { nodes: paragraph("第二次") }, stale)).rejects.toThrow(
    "修订冲突"
  );
  expect(JSON.stringify((await getContentById(id))!.content)).toContain("第一次");
});

it("AI 改写应用后可写入，检查点恢复保留节点身份", async () => {
  const { persistContentFromMarkdown, persistContentValue } =
    await import("@/services/content-editing/persist");
  const id = (await createContent(paragraph("原文"), 2))!;
  const before = (await getContentById(id))!;
  const applied = await persistContentFromMarkdown({
    contentId: id,
    markdown: "# 标题\n\nAI 改写",
    expectedRevision: before.revision,
  });
  expect(applied.content).toMatchObject([{ type: "header" }, { type: "paragraph" }]);
  const restored = await persistContentValue({
    contentId: id,
    content: before.content,
    expectedRevision: applied.updated.revision,
  });
  expect(restored.updated.content).toEqual(before.content);
});
