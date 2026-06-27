import { describe, expect, it, vi } from "vitest";
import pdfIndexDBManager from "../pdf-index-db";

describe("PdfIndexDBManager", () => {
  it("cleanTables 清理 PDF 索引废弃表", () => {
    const exec = vi.fn();
    const db = { exec };

    (
      pdfIndexDBManager as unknown as {
        cleanTables: (database: { exec: (sql: string) => void }) => void;
      }
    ).cleanTables(db);

    const sql = exec.mock.calls.map((call) => call[0]).join("\n");
    expect(sql).toContain("DROP TABLE IF EXISTS pdf_section_summaries");
    expect(sql).toContain("DROP TABLE IF EXISTS pdf_document_summary");
    expect(sql).toContain("DROP TABLE IF EXISTS pdf_section_fts");
    expect(sql).toContain("DROP TABLE IF EXISTS pdf_section_vec");
  });
});
