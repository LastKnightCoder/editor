import * as transfer from "@/services/content-transfer";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { contentExportTranslator } from "../i18n";
import { PdfExportModal } from "../../PdfExportModal";
import EpubExportModal from "../../EpubExportModal";

const mocks = vi.hoisted(() => ({
  epub: vi.fn(async () => ({ canceled: true, warnings: [] })),
  pdf: vi.fn(async () => ({ canceled: true, warnings: [] })),
  selectFile: vi.fn(),
  readBinaryFile: vi.fn(),
  showInFolder: vi.fn(),
}));
vi.mock("@/commands", () => ({
  exportPdfWithDialog: mocks.pdf,
  selectFile: mocks.selectFile,
  readBinaryFile: mocks.readBinaryFile,
  showInFolder: mocks.showInFolder,
}));
vi.mock("@/utils/epub-export", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils/epub-export")>()),
  exportSlateToEpubWithDialog: mocks.epub,
}));

let root: Root;
let host: HTMLDivElement;
let original: string;
const content: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "原始正文" }] },
];
beforeEach(() => {
  original = desktopLocaleSource.getSnapshot();
  localStorage.clear();
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale(original);
  vi.restoreAllMocks();
});
const type = async (field: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

it("切换语言保留 PDF 页边距草稿及分页选择，不自动导出", async () => {
  const read = vi.spyOn(transfer, "readContentForExport");
  const close = vi.fn();
  await act(async () =>
    root.render(<PdfExportModal visible onClose={close} content={content} title="原始文件名" />)
  );
  const numbers = [...document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')];
  if (!numbers[0]) throw new Error("页边距输入未挂载");
  const field = numbers[0];
  await type(field, "27");
  await act(async () => field.blur());
  const avoid = [...document.querySelectorAll("button")].find(
    button => button.textContent === contentExportTranslator.t("pdf.strategy.avoid.label")
  );
  if (!avoid) throw new Error("分页选项未挂载");
  await act(async () => avoid.click());
  await act(async () => field.focus());
  field.setSelectionRange(1, 2);
  for (const next of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(next));
    expect(document.querySelector('input[inputmode="decimal"]')).toBe(field);
    expect(field.value).toBe("27");
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([1, 2]);
    expect(
      [...document.querySelectorAll("button")].find(
        button => button.textContent === contentExportTranslator.t("pdf.strategy.avoid.label")
      )
    ).toBe(avoid);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  }
});

it("切换语言保留 EPUB 元数据和光标，确认时沿用用户填写的语言与文件名", async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(<EpubExportModal open onClose={close} content={content} title="原始书名" />)
  );
  const fields = [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')];
  const [title, author, language] = fields;
  if (!title || !author || !language) throw new Error("元数据输入未挂载");
  const initialAuthor = author.value,
    initialLanguage = language.value;
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(author.value).toBe(initialAuthor);
  expect(language.value).toBe(initialLanguage);
  await type(title, "用户书名");
  await type(author, "用户作者");
  await type(language, "ja");
  await act(async () => title.focus());
  title.setSelectionRange(1, 3);
  for (const next of ["en-US", "zh-CN"]) {
    await act(async () => desktopLocaleSource.setLocale(next));
    expect(document.querySelector('input[type="text"]')).toBe(title);
    expect([title.value, author.value, language.value]).toEqual(["用户书名", "用户作者", "ja"]);
    expect(document.activeElement).toBe(title);
    expect([title.selectionStart, title.selectionEnd]).toEqual([1, 3]);
    expect(mocks.epub).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  }
  const exportButton = [...document.querySelectorAll("button")].find(
    button => button.textContent === contentExportTranslator.t("common.export")
  );
  if (!exportButton) throw new Error("导出入口未挂载");
  await act(async () => exportButton.click());
  expect(mocks.epub).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      defaultFileName: "用户书名",
      metadata: expect.objectContaining({ title: "用户书名", author: "用户作者", language: "ja" }),
    })
  );
});
