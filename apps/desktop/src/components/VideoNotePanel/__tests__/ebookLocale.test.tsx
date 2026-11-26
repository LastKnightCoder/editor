import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { Editor as SlateEditor, Transforms } from "slate";
import type { EditorExtension } from "@tau/editor";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { EpubExportPayload, PdfExportPayload, PdfExportResult } from "@/types";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { ebookTranslator } from "../i18n-ebook";
import VideoNoteEpubExportModal from "../VideoNoteEpubExportModal";

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  epub: vi.fn(),
  pdf: vi.fn(),
  selectFile: vi.fn(),
  readBinaryFile: vi.fn(),
  showInFolder: vi.fn(),
  initialized: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/services/piLLM", () => ({ piStreamText: mocks.stream }));
vi.mock("@/commands", () => ({
  selectFile: mocks.selectFile,
  readBinaryFile: mocks.readBinaryFile,
  showInFolder: mocks.showInFolder,
  exportEpubWithDialog: mocks.epub,
  exportPdfWithDialog: mocks.pdf,
}));
// A minimal host composition keeps the real editor, local document and serializers.
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  let kit: ReturnType<typeof createEditorKit> | undefined;
  return {
    createDesktopKit: (extensions: EditorExtension[] = []) =>
      (kit ??= createEditorKit({ extensions })),
    getContentKit: () => (kit ??= createEditorKit({})),
  };
});
vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/editor")>();
  return {
    ...actual,
    Editor: (props: ComponentProps<typeof actual.Editor>) => (
      <actual.Editor {...props} onInit={mocks.initialized} />
    ),
  };
});
vi.mock("@tau/ui", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/ui")>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      error: mocks.error,
      warning: mocks.warning,
      success: mocks.success,
      info: mocks.info,
    },
  };
});

let host: HTMLDivElement, root: Root;
let originalLocale: string;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  originalLocale = desktopLocaleSource.getSnapshot();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.showInFolder.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale(originalLocale);
  vi.useRealTimers();
});
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    node => node.textContent?.trim() === text
  );
const click = async (text: string) => {
  const target = button(text);
  if (!target) throw new Error(`按钮未挂载：${text}`);
  await act(async () => target.click());
  await tick();
};
const field = (message: Parameters<typeof ebookTranslator.t>[0]) => {
  const target = document.querySelector<HTMLInputElement>(
    `input[placeholder="${ebookTranslator.t(message)}"]`
  );
  if (!target) throw new Error("元数据输入未挂载");
  return target;
};
const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
const mount = async (onClose: () => void) => {
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={desktopI18n}>
        <DndProvider backend={HTML5Backend}>
          <VideoNoteEpubExportModal
            open
            onClose={onClose}
            videoNoteId={19}
            transcript="用户原始转录"
            videoTitle="用户视频标题"
            provider={{} as LLMProviderSetting}
            model={{} as LLMModelSetting}
            onOpenLLMSettings={vi.fn()}
          />
        </DndProvider>
      </I18nRuntimeProvider>
    )
  );
  await tick();
};

it("换语保留流、真实草稿和元数据；继续导出确认不重复结算", async () => {
  let finish: (result: { ok: boolean; text: string }) => void = () => {
    throw new Error("请求尚未开始");
  };
  let chunk: (value: { text: string }) => void = () => {
    throw new Error("请求尚未开始");
  };
  const cancel = vi.fn();
  mocks.stream.mockImplementation((_options, receive) => {
    chunk = receive;
    return {
      cancel,
      result: new Promise(resolve => {
        finish = resolve;
      }),
    };
  });
  const onClose = vi.fn();
  await act(async () => desktopLocaleSource.setLocale("en-US"));
  await mount(onClose);
  await click(ebookTranslator.t("action.generate"));
  await act(async () => chunk({ text: "# AI 草稿标题\n\nAI 草稿正文" }));
  await tick();
  const source = document.querySelector("[data-slate-editor]");
  const request = JSON.stringify(mocks.stream.mock.calls[0][0].messages);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("[data-slate-editor]")).toBe(source);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.stream.mock.calls[0][0].messages)).toBe(request);
  }
  await act(async () => finish({ ok: true, text: "# AI 草稿标题\n\nAI 草稿正文" }));
  await tick();
  const editor = mocks.initialized.mock.calls.at(-1)?.[0] as SlateEditor | undefined;
  if (!editor) throw new Error("草稿编辑器未挂载");
  await act(async () => {
    Transforms.select(editor, SlateEditor.end(editor, []));
    Transforms.insertText(editor, "手工追加");
  });
  await tick();
  const draft = JSON.stringify(editor.children),
    selection = structuredClone(editor.selection);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(mocks.initialized.mock.calls.at(-1)?.[0]).toBe(editor);
    expect(document.querySelector("[data-slate-editor]")).toBe(source);
    expect(JSON.stringify(editor.children)).toBe(draft);
    expect(editor.selection).toEqual(selection);
  }
  await click(ebookTranslator.t("common.next"));
  await type(field("field.titlePlaceholder"), "保留书名");
  await type(field("field.authorPlaceholder"), "手写作者");
  const language = document.querySelector<HTMLInputElement>('input[placeholder="zh-CN"]');
  if (!language) throw new Error("书籍语言未挂载");
  await type(language, "fr");
  language.setSelectionRange(0, 1);
  const format = [...document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')].find(node =>
    node.textContent?.includes("PDF")
  );
  if (!format) throw new Error("PDF 格式未挂载");
  await act(async () => format.click());
  const coverBytes = new Uint8Array([137, 80, 78, 71]);
  mocks.selectFile.mockResolvedValue(["/covers/retained-cover.png"]);
  mocks.readBinaryFile.mockResolvedValue(coverBytes);
  const chooseCover = document.querySelector<HTMLButtonElement>(
    `[aria-label="${ebookTranslator.t("cover.choose")}"]`
  );
  if (!chooseCover) throw new Error("封面入口未挂载");
  await act(async () => chooseCover.click());
  const cover = () =>
    document.querySelector<HTMLButtonElement>(
      `[role="radio"][title="${ebookTranslator.t("cover.file", { name: "retained-cover.png" })}"]`
    );
  const coverChoice = cover();
  if (!coverChoice) throw new Error("封面候选未挂载");
  await act(async () => language.focus());
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(field("field.titlePlaceholder").value).toBe("保留书名");
    expect(field("field.authorPlaceholder").value).toBe("手写作者");
    expect(document.querySelector('input[placeholder="zh-CN"]')).toBe(language);
    expect(language.value).toBe("fr");
    expect([language.selectionStart, language.selectionEnd]).toEqual([0, 1]);
    expect(format.getAttribute("aria-checked")).toBe("true");
    expect(cover()).toBe(coverChoice);
    expect(coverChoice.getAttribute("aria-checked")).toBe("true");
    expect(mocks.readBinaryFile).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(language);
    expect(mocks.epub).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  }
  mocks.epub.mockResolvedValue({ canceled: true, filePath: null, warnings: [] });
  let finishPdf: (result: PdfExportResult) => void = () => {
    throw new Error("PDF 尚未开始");
  };
  mocks.pdf.mockImplementation(
    () =>
      new Promise<PdfExportResult>(resolve => {
        finishPdf = resolve;
      })
  );
  const exportButton = button(
    ebookTranslator.t("export.action", {
      formats: new Intl.ListFormat(desktopI18n.getSnapshot()).format(["EPUB", "PDF"]),
    })
  );
  if (!exportButton) throw new Error("导出入口未挂载");
  await act(async () => exportButton.click());
  await tick();
  expect(mocks.error.mock.calls).toEqual([]);
  expect(mocks.epub).toHaveBeenCalledTimes(1);
  expect(mocks.pdf).not.toHaveBeenCalled();
  const payload = mocks.epub.mock.calls[0][0] as EpubExportPayload;
  expect(payload.metadata).toMatchObject({ title: "保留书名", author: "手写作者", language: "fr" });
  expect(payload.defaultFileName).toBe("保留书名");
  expect(payload.assets.find(asset => asset.mimeType === "image/png")?.bytes).toEqual(coverBytes);
  expect(payload.chapters.some(chapter => chapter.xhtml.includes("手工追加"))).toBe(true);
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(button(ebookTranslator.t("continue.confirm"))).not.toBeUndefined();
    expect(mocks.epub).toHaveBeenCalledTimes(1);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  }
  await click(ebookTranslator.t("continue.confirm"));
  expect(mocks.pdf).toHaveBeenCalledTimes(1);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(mocks.pdf).toHaveBeenCalledTimes(1);
  const pdf = mocks.pdf.mock.calls[0][0] as PdfExportPayload;
  expect(pdf.metadata.title).toBe("保留书名");
  expect(pdf.defaultFileName).toBe("保留书名");
  await act(async () => finishPdf({ canceled: false, filePath: "/books/book.pdf", warnings: [] }));
  await tick();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
});

it("换语不会重放同一个改写失败通知或再发模型请求", async () => {
  mocks.stream.mockReturnValue({
    cancel: vi.fn(),
    result: Promise.resolve({ ok: false, error: "原始服务诊断" }),
  });
  await mount(vi.fn());
  await click(ebookTranslator.t("action.generate"));
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith("原始服务诊断");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  }
});
