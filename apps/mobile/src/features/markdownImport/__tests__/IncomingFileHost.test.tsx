import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IncomingFileHost } from "../IncomingFileHost";
import { mobileLocaleSource, mobileI18n } from "../../../services/i18n";
import { markdownImportMessages } from "../i18n";
import { parseInvokeError, mapErrorToMessage } from "../../../services/errors";
import { takeIncomingFile } from "../../../services/tauri";

const { push, showError } = vi.hoisted(() => ({ push: vi.fn(), showError: vi.fn() }));
vi.mock("../../../router", () => ({ useNavigator: () => ({ push }) }));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({
    presentError: (error: unknown, fallback: string) => {
      const parsed = parseInvokeError(error);
      showError(mapErrorToMessage(parsed.code, parsed.message || fallback));
    },
  }),
}));
vi.mock("../../../services/tauri", () => ({ takeIncomingFile: vi.fn() }));

it("换语与重复接收事件共享同一读取，保持原始标题和正文", async () => {
  const original = mobileLocaleSource.getSnapshot();
  let resolve!: (file: { title: string; markdown: string }) => void;
  vi.mocked(takeIncomingFile).mockReturnValue(new Promise(done => (resolve = done)));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<IncomingFileHost />));
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        mobileLocaleSource.setLocale(locale);
        window.dispatchEvent(new Event("tau:incoming-file"));
      });
      expect(takeIncomingFile).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
    }
    const file = { title: "原始文件标题", markdown: "# 原始正文" };
    await act(async () => resolve(file));
    expect(push).toHaveBeenCalledExactlyOnceWith("markdownImport", file);
    expect(showError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    mobileLocaleSource.setLocale(original);
    vi.clearAllMocks();
  }
});

it("读取失败后可再次接收，失败反馈使用发生时的语言", async () => {
  const original = mobileLocaleSource.getSnapshot();
  let reject!: (error: unknown) => void;
  vi.mocked(takeIncomingFile)
    .mockReturnValueOnce(new Promise((_, fail) => (reject = fail)))
    .mockResolvedValueOnce(null);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<IncomingFileHost />));
    await act(async () => mobileLocaleSource.setLocale("en-US"));
    await act(async () => reject(""));
    expect(showError).toHaveBeenCalledExactlyOnceWith(
      mobileI18n.get(markdownImportMessages).t("openFailed")
    );
    await act(async () => window.dispatchEvent(new Event("tau:incoming-file")));
    expect(takeIncomingFile).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    mobileLocaleSource.setLocale(original);
    vi.clearAllMocks();
  }
});
