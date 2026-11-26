import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "codemirror";
import { expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import type { FileViewHandle } from "../types";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  watch: vi.fn(),
  unwatch: vi.fn(),
  off: vi.fn(),
  changed: undefined as undefined | ((event: unknown, data: { filePath: string }) => Promise<void>),
}));
vi.mock("@/commands/file", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/file")>()),
  readTextFile: io.read,
  writeTextFile: io.write,
  watchTextFile: io.watch,
  unwatchTextFile: io.unwatch,
  onTextFileChanged: (listener: typeof io.changed) => {
    io.changed = listener;
  },
  offTextFileChanged: io.off,
}));
import { CodeFileView } from "../CodeFileView";
import { markdownChromeTranslator } from "../chrome.i18n";

it("代码文件冲突换语保留同一CodeMirror、草稿/CRLF/历史/选区和横幅动作，不重读或重绑会话", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useFakeTimers();
  const rect = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  const originalBounds = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  const path = "/notes/原文件.txt",
    original = "第一行原文\r\n第二行\r\n";
  io.read.mockResolvedValue(original);
  io.write.mockResolvedValue(undefined);
  io.watch.mockResolvedValue(undefined);
  io.unwatch.mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    ref = createRef<FileViewHandle>();
  const status = vi.fn(),
    saveAs = vi.fn();
  try {
    await act(async () =>
      root.render(<CodeFileView path={path} ref={ref} onStatus={status} onSaveAs={saveAs} />)
    );
    const wrapper = host.querySelector(".CodeMirror") as
      | (HTMLElement & { CodeMirror: Editor })
      | null;
    if (!wrapper) throw new Error("CodeMirror did not mount");
    const editor = wrapper.CodeMirror;
    await act(async () => {
      editor.replaceRange("本地修改", { line: 0, ch: 0 }, { line: 0, ch: 5 });
      editor.setSelection({ line: 0, ch: 1 }, { line: 1, ch: 1 });
    });
    const draft = editor.getValue(),
      history = editor.historySize(),
      selection = editor.listSelections();
    expect(draft).toContain("\r\n");
    io.read.mockResolvedValue("外部版本\r\n");
    await act(async () => io.changed?.(undefined, { filePath: path }));
    const banner = host.querySelector('[role="alert"]');
    if (!banner) throw new Error("Missing conflict banner");
    const actions = [...banner.querySelectorAll("button")];
    for (const locale of ["en-US", "zh-TW"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector(".CodeMirror")).toBe(wrapper);
      expect(editor.getValue()).toBe(draft);
      expect(editor.historySize()).toEqual(history);
      expect(editor.listSelections()).toEqual(selection);
      expect(host.querySelector('[role="alert"]')).toBe(banner);
      expect([...banner.querySelectorAll("button")]).toEqual(actions);
      expect(io.read.mock.calls).toEqual([[path], [path]]);
      expect(io.watch).toHaveBeenCalledExactlyOnceWith(path);
      expect(io.off).not.toHaveBeenCalled();
      expect(io.unwatch).not.toHaveBeenCalled();
      expect(io.write).not.toHaveBeenCalled();
      expect(saveAs).not.toHaveBeenCalled();
    }
    const keep = actions.find(
      action => action.textContent === markdownChromeTranslator.t("chrome.keepMine")
    );
    if (!keep) throw new Error("Missing conflict action");
    await act(async () => keep.click());
    expect(io.write).toHaveBeenCalledExactlyOnceWith(path, draft);
    expect(editor.getValue()).toBe(draft);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    desktopLocaleSource.setLocale(originalLocale);
    if (originalBounds)
      Object.defineProperty(Range.prototype, "getBoundingClientRect", originalBounds);
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    if (originalRects) Object.defineProperty(Range.prototype, "getClientRects", originalRects);
    else Reflect.deleteProperty(Range.prototype, "getClientRects");
  }
});
