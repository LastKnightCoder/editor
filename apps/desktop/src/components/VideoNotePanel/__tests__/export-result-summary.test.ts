import { describe, expect, it } from "vitest";
import { summarizeExportResults, type ExportFormatResult } from "../export-result-summary";

const buildResult = (partial: Partial<ExportFormatResult>): ExportFormatResult => {
  return {
    format: "PDF",
    success: false,
    ...partial,
  };
};

describe("video note export result summary", () => {
  it("全部成功时返回 all-success", () => {
    const summary = summarizeExportResults([
      buildResult({ format: "PDF", success: true, filePath: "/tmp/a.pdf" }),
      buildResult({ format: "EPUB", success: true, filePath: "/tmp/a.epub" }),
    ]);

    expect(summary.status).toBe("all-success");
    expect(summary.successResults).toHaveLength(2);
    expect(summary.failedResults).toHaveLength(0);
    expect(summary.canceledResults).toHaveLength(0);
  });

  it("成功+失败时返回 partial-success", () => {
    const summary = summarizeExportResults([
      buildResult({ format: "PDF", success: true, filePath: "/tmp/a.pdf" }),
      buildResult({ format: "EPUB", success: false, warnings: ["EPUB 失败"] }),
    ]);

    expect(summary.status).toBe("partial-success");
    expect(summary.successResults.map(item => item.format)).toEqual(["PDF"]);
    expect(summary.failedResults.map(item => item.format)).toEqual(["EPUB"]);
  });

  it("成功+取消时返回 partial-success，避免误判为全部成功", () => {
    const summary = summarizeExportResults([
      buildResult({ format: "PDF", success: true, filePath: "/tmp/a.pdf" }),
      buildResult({ format: "EPUB", success: false, canceled: true }),
    ]);

    expect(summary.status).toBe("partial-success");
    expect(summary.successResults).toHaveLength(1);
    expect(summary.canceledResults).toHaveLength(1);
    expect(summary.failedResults).toHaveLength(0);
  });

  it("全部失败时返回 all-failed", () => {
    const summary = summarizeExportResults([
      buildResult({ format: "PDF", success: false, warnings: ["PDF 失败"] }),
      buildResult({ format: "EPUB", success: false, warnings: ["EPUB 失败"] }),
    ]);

    expect(summary.status).toBe("all-failed");
    expect(summary.failedResults).toHaveLength(2);
  });

  it("全部取消时返回 all-canceled", () => {
    const summary = summarizeExportResults([
      buildResult({ format: "PDF", success: false, canceled: true }),
      buildResult({ format: "EPUB", success: false, canceled: true }),
    ]);

    expect(summary.status).toBe("all-canceled");
    expect(summary.canceledResults).toHaveLength(2);
    expect(summary.successResults).toHaveLength(0);
    expect(summary.failedResults).toHaveLength(0);
  });
});
