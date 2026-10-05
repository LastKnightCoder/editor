import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ExcerptTable from "../tables/excerpt";
import { buildMaterialResourceMarkdown } from "../vl-material-resource";

describe("Notebook 外部材料资源", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  it("摘录合并为一份：引文 + 想法 + 出处，源端删除的标注出来，不存在的跳过", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:1",
        quote: "土地财政",
        note: "想法",
        anchor: null,
        color: null,
        sourceTime: null,
      },
      {
        externalId: "b1:2",
        quote: "招商引资",
        note: "",
        anchor: null,
        color: null,
        sourceTime: null,
      },
    ]);
    const [a, b] = ExcerptTable.listActive(db);
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:1",
        quote: "土地财政",
        note: "想法",
        anchor: null,
        color: null,
        sourceTime: null,
      },
    ]);
    const markdown = buildMaterialResourceMarkdown(db, {
      title: "为什么 · 摘录",
      refs: [
        { kind: "excerpt", id: a.id },
        { kind: "excerpt", id: b.id },
        { kind: "pdf-annotation", id: 99 },
      ],
    });
    expect(markdown).toBe(
      "# 为什么 · 摘录\n\n> 土地财政\n\n想法\n\n—— 微信读书 · 《置身事内》\n\n---\n\n" +
        "> 招商引资\n\n—— 微信读书 · 《置身事内》（原划线已删除）\n"
    );
  });

  it("材料全部不存在时为空", () => {
    expect(
      buildMaterialResourceMarkdown(db, { title: "x", refs: [{ kind: "web-clip", id: 1 }] })
    ).toBe("");
  });
});
