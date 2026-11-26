import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import type { EditorTextField } from "@tau/editor/text-field-contract";
import Board from "../../Board";
import type { WhiteboardDocumentBinding } from "../../document";
import { BoardContext } from "../../context";
import { FieldText } from "../FieldText";

it("字段写入失败后换语保留原始草稿和修订，不重绑、不重复报错或写入", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const board = new Board(
    [],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );
  const dispose = vi.fn(),
    preserveDraft = vi.fn();
  const subscribe = vi.fn(() => () => undefined);
  const editBatch = vi.fn(() => {
    throw new Error("bridge-failure");
  });
  const field: EditorTextField = {
    getSnapshot: () => ({ value: "原始标题", revision: "revision-1" }),
    subscribe,
    editBatch,
    edit: () => undefined,
    replace: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    preserveDraft,
    dispose,
  };
  const textField = vi.fn(() => field);
  board.document = { textField } as unknown as WhiteboardDocumentBinding;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <BoardContext value={board}>
            <FieldText elementId="element" field="title" defaultValue="原始标题" contentEditable />
          </BoardContext>
        </I18nRuntimeProvider>
      )
    );
    const input = host.querySelector("input");
    if (!input) throw new Error("协作字段未挂载");
    await act(async () => {
      input.focus();
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setValue) throw new Error("原生字段setter缺失");
      setValue.call(input, "用户草稿");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.setSelectionRange(1, 3);
    const alert = host.querySelector('[role="alert"]');
    if (!alert) throw new Error("字段失败未显示");
    const original = alert.textContent;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => source.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(input.value).toBe("用户草稿");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
      expect(input.readOnly).toBe(true);
      expect(textField).toHaveBeenCalledExactlyOnceWith("element", "title");
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(editBatch).toHaveBeenCalledTimes(1);
      expect(preserveDraft).toHaveBeenCalledExactlyOnceWith({
        value: "用户草稿",
        revision: "revision-1",
      });
      expect(dispose).not.toHaveBeenCalled();
      expect(host.querySelector('[role="alert"]')).toBe(alert);
    }
    expect(alert.textContent).not.toBe(original);
    expect(alert.textContent).toContain("bridge-failure");
    await act(async () => root.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    board.destroy();
    host.remove();
    runtime.dispose();
  }
});
