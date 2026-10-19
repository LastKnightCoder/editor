import { describe, expect, it, vi } from "vitest";
import { createMarkdownPasteImportPlugin } from "../withMarkdownPasteImport";

const createDataTransfer = (
  payload: Record<string, string>,
  options?: {
    files?: Array<{ type: string }>;
    items?: Array<{ type: string }>;
  }
): DataTransfer => {
  return {
    getData: (type: string) => payload[type] || "",
    files: (options?.files || []) as unknown as FileList,
    items: (options?.items || []) as unknown as DataTransferItemList,
  } as DataTransfer;
};

const createTestEditor = (importFromMarkdown: ReturnType<typeof vi.fn>) => {
  const insertData = vi.fn();
  const insertFragment = vi.fn();

  const plugin = createMarkdownPasteImportPlugin(importFromMarkdown as never);
  const editor = plugin({
    insertData,
    insertFragment,
  } as never);

  return { editor, insertData, insertFragment };
};

describe("withMarkdownPasteImport", () => {
  it("应将 Markdown 文本导入为结构化 fragment", async () => {
    const importFromMarkdown = vi.fn(() => [
      {
        type: "header",
        level: 1,
        children: [{ type: "formatted", text: "标题" }],
      },
    ]);

    const { editor, insertData, insertFragment } = createTestEditor(importFromMarkdown);

    await editor.insertData(
      createDataTransfer({
        "text/plain": "# 标题",
      })
    );

    expect(importFromMarkdown).toHaveBeenCalledWith("# 标题");
    expect(insertFragment).toHaveBeenCalledTimes(1);
    expect(insertData).not.toHaveBeenCalled();
  });

  it("遇到 Slate 内部 fragment 粘贴时应直接回退原始 insertData", async () => {
    const importFromMarkdown = vi.fn();

    const { editor, insertData, insertFragment } = createTestEditor(importFromMarkdown);

    await editor.insertData(
      createDataTransfer({
        "application/x-slate-fragment": "encoded-fragment",
        "text/plain": "# 标题",
      })
    );

    expect(insertData).toHaveBeenCalledTimes(1);
    expect(importFromMarkdown).not.toHaveBeenCalled();
    expect(insertFragment).not.toHaveBeenCalled();
  });

  it("未识别为 Markdown 时应走原始纯文本粘贴", async () => {
    const importFromMarkdown = vi.fn();

    const { editor, insertData, insertFragment } = createTestEditor(importFromMarkdown);

    await editor.insertData(
      createDataTransfer({
        "text/plain": "普通文本",
      })
    );

    expect(insertData).toHaveBeenCalledTimes(1);
    expect(importFromMarkdown).not.toHaveBeenCalled();
    expect(insertFragment).not.toHaveBeenCalled();
  });
});
