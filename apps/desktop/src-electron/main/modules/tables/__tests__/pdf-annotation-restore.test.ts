import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import PdfTable from "../pdf";

describe("PDF 标注撤销删除保留原 id（KL-036）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  const annotation = (extra: { id?: number } = {}) => ({
    pdfId: 1,
    annotation: { id: "engine-uuid", pageIndex: 0, custom: { text: "原文" } } as never,
    notes: [],
    ...extra,
  });

  it("带回的 id 空着就沿用，被占用时分配新 id", () => {
    const first = PdfTable.addPdfAnnotation(db, annotation());
    PdfTable.removePdfAnnotation(db, first.id);
    expect(PdfTable.addPdfAnnotation(db, annotation({ id: first.id })).id).toBe(first.id);

    const second = PdfTable.addPdfAnnotation(db, annotation({ id: first.id }));
    expect(second.id).not.toBe(first.id);
  });
});
