import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import type { EditorTextField } from "@tau/editor/text-field-contract";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { SheetBar } from "../components/SheetBar";

it("页名写入失败后换语只更新错误说明，保留原生草稿、选区和同一字段绑定", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot();
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const dispose = vi.fn(),
    preserveDraft = vi.fn();
  const editBatch = vi.fn(() => {
    throw new Error("原始失败原因");
  });
  const field: EditorTextField = {
    getSnapshot: () => ({ value: "原始页名", revision: "revision-1" }),
    subscribe: () => () => undefined,
    editBatch,
    edit: vi.fn(),
    replace: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    preserveDraft,
    dispose,
  };
  const textBinding = vi.fn(() => field),
    rename = vi.fn();
  const pages = [
    { id: 11, name: "原始页名" },
    { id: 12, name: "另一页" },
  ];
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <SheetBar
            pages={pages}
            activeId={11}
            textBinding={textBinding}
            onSelect={vi.fn()}
            onAdd={vi.fn()}
            onRename={rename}
            onDuplicate={vi.fn()}
            onDelete={vi.fn()}
            onReorder={vi.fn()}
          />
        </DndProvider>
      )
    );
    const tab = host.querySelector('[data-page-id="11"]');
    if (!tab) throw new Error("页签未挂载");
    await act(async () =>
      tab.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }))
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("页名输入未挂载");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setValue) throw new Error("字段缺少原生 setter");
      setValue.call(input, "尚未同步的用户草稿");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.readOnly).toBe(true);
    expect(preserveDraft).toHaveBeenCalledWith({
      value: "尚未同步的用户草稿",
      revision: "revision-1",
    });
    input.setSelectionRange(2, 5);
    const previousError = input.title;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe("尚未同步的用户草稿");
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
      expect(input.readOnly).toBe(true);
      expect(textBinding).toHaveBeenCalledExactlyOnceWith(11);
      expect(editBatch).toHaveBeenCalledTimes(1);
      expect(preserveDraft).toHaveBeenCalledTimes(1);
      expect(dispose).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
    }
    expect(input.title).not.toBe(previousError);
    expect(input.title).toContain("原始失败原因");
    await act(async () => root.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    desktopLocaleSource.setLocale(originalLocale);
  }
});
