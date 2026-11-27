import { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import SelectFileModal from "../components/SelectFileModal";
import { fileAttachmentTranslator } from "../i18n";

const io = vi.hoisted(() => ({
  selectFile: vi.fn(),
  readBinaryFile: vi.fn(),
  getFileBaseName: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/commands", () => ({
  selectFile: io.selectFile,
  readBinaryFile: io.readBinaryFile,
  getFileBaseName: io.getFileBaseName,
}));
vi.mock("@/hooks/useUploadResource.ts", () => ({ default: () => io.upload }));

it("附件选择和在途上传跨语保留同一文件与开关，只提交原始路径及文件名一次", async () => {
  const locale = desktopLocaleSource.getSnapshot();
  const stored = localStorage.getItem("file-attachment-upload");
  localStorage.removeItem("file-attachment-upload");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let finish: ((url: string) => void) | undefined;
  const pending = new Promise<string>(resolve => {
    finish = resolve;
  });
  io.selectFile.mockResolvedValue(["/original/报告 原文.bin"]);
  io.readBinaryFile.mockResolvedValue(new Uint8Array([1, 9, 17, 255]));
  io.getFileBaseName.mockResolvedValue("报告 原文.bin");
  io.upload.mockReturnValue(pending);
  const confirm = vi.fn(),
    cancel = vi.fn();
  const insert = () =>
    [...document.querySelectorAll("button")].find(
      node => node.textContent?.trim() === fileAttachmentTranslator.t("insert")
    );
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={desktopI18n}>
          <SelectFileModal open onOk={confirm} onCancel={cancel} />
        </I18nRuntimeProvider>
      )
    );
    const choose = document.querySelector("button[data-autofocus]");
    if (!(choose instanceof HTMLButtonElement)) throw new Error("File selector unavailable");
    await act(async () => choose.click());
    const toggle = document.querySelector('[role="switch"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("Upload toggle unavailable");
    await act(async () => toggle.click());
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error("Attachment dialog unavailable");
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(document.querySelector('[role="dialog"]')).toBe(dialog);
      expect(document.querySelector("button[data-autofocus]")).toBe(choose);
      expect(document.querySelector('[role="switch"]')).toBe(toggle);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(io.selectFile).toHaveBeenCalledTimes(1);
      expect(io.readBinaryFile).toHaveBeenCalledExactlyOnceWith("/original/报告 原文.bin");
      expect(io.upload).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    }
    const submit = insert();
    if (!submit) throw new Error("Insert action unavailable");
    await act(async () => submit.click());
    const file = io.upload.mock.calls[0]?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("报告 原文.bin");
    expect(file.size).toBe(4);
    for (const language of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(language));
      expect(document.querySelector('[role="dialog"]')).toBe(dialog);
      expect(io.upload).toHaveBeenCalledTimes(1);
      expect(io.upload.mock.calls[0][0]).toBe(file);
      expect(confirm).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    }
    await act(async () => finish?.("https://example.com/original?name=原文"));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/original?name=原文",
      false,
      "报告 原文.bin"
    );
    expect(io.upload).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    desktopLocaleSource.setLocale(locale);
    if (stored === null) localStorage.removeItem("file-attachment-upload");
    else localStorage.setItem("file-attachment-upload", stored);
  }
});
