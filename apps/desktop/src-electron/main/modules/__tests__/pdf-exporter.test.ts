import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportPdfWithDialog } from "../pdf-exporter";

const mocks = vi.hoisted(() => {
  return {
    showSaveDialog: vi.fn(),
    writeFile: vi.fn(),
    loadURL: vi.fn(),
    close: vi.fn(),
    executeJavaScript: vi.fn(),
    printToPDF: vi.fn(),
  };
});

vi.mock("electron", () => ({
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: mocks.loadURL,
    close: mocks.close,
    webContents: {
      executeJavaScript: mocks.executeJavaScript,
      printToPDF: mocks.printToPDF,
    },
  })),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mocks.writeFile,
  default: {
    writeFile: mocks.writeFile,
  },
}));

describe("pdf-exporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadURL.mockResolvedValue(undefined);
    mocks.executeJavaScript.mockResolvedValue(undefined);
    mocks.close.mockReturnValue(undefined);
    mocks.printToPDF.mockResolvedValue(Buffer.from("pdf-data"));
    mocks.writeFile.mockResolvedValue(undefined);
  });

  it("用户取消导出时应直接返回 canceled", async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });

    const result = await exportPdfWithDialog({
      html: "<h1>Test</h1>",
      styles: "body { margin: 0; }",
      metadata: {
        title: "Test Document",
      },
      options: {
        pageSize: "A4",
        landscape: false,
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        printBackground: true,
        displayHeaderFooter: false,
        chapterBreak: true,
        codeBlockBreak: { strategy: "adaptive" },
      },
    });

    expect(result.canceled).toBe(true);
    expect(result.filePath).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("成功导出时应按英寸传递边距并写入文件", async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "/tmp/test.pdf",
    });

    const result = await exportPdfWithDialog({
      html: "<h1>Test</h1>",
      styles: "body { margin: 0; }",
      metadata: {
        title: "Test Document",
      },
      options: {
        pageSize: "A4",
        landscape: false,
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        printBackground: true,
        displayHeaderFooter: false,
        chapterBreak: true,
        codeBlockBreak: { strategy: "adaptive" },
      },
    });

    expect(result.canceled).toBe(false);
    expect(result.filePath).toBe("/tmp/test.pdf");
    expect(mocks.printToPDF).toHaveBeenCalledTimes(1);
    const printOptions = mocks.printToPDF.mock.calls[0][0];
    expect(printOptions.margins.top).toBeCloseTo(20 / 25.4, 5);
    expect(printOptions.margins.bottom).toBeCloseTo(20 / 25.4, 5);
    expect(printOptions.margins.left).toBeCloseTo(15 / 25.4, 5);
    expect(printOptions.margins.right).toBeCloseTo(15 / 25.4, 5);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "/tmp/test.pdf",
      Buffer.from("pdf-data"),
    );
  });

  it("printToPDF 失败时应返回 warning", async () => {
    mocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "/tmp/test.pdf",
    });
    mocks.printToPDF.mockRejectedValue(new Error("print failed"));

    const result = await exportPdfWithDialog({
      html: "<h1>Test</h1>",
      styles: "body { margin: 0; }",
      metadata: {
        title: "Test Document",
      },
      options: {
        pageSize: "A4",
        landscape: false,
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        printBackground: true,
        displayHeaderFooter: false,
        chapterBreak: true,
        codeBlockBreak: { strategy: "adaptive" },
      },
    });

    expect(result.canceled).toBe(false);
    expect(result.filePath).toBeNull();
    expect(result.warnings[0]).toContain("print failed");
  });
});
