import { createEditor, Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { focusParagraphAfterDelete } from "../focusParagraphAfterDelete";

describe("focusParagraphAfterDelete", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("应在代码块删除并插入段落后将焦点切回 Slate 段落起始处", () => {
    vi.useFakeTimers();

    const editor = createEditor();
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ] as any;

    const focusSpy = vi
      .spyOn(ReactEditor, "focus")
      .mockImplementation(() => undefined);
    const selectSpy = vi.spyOn(Transforms, "select");

    focusParagraphAfterDelete(editor as any, [0]);

    expect(focusSpy).not.toHaveBeenCalled();
    expect(selectSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(focusSpy).toHaveBeenCalledWith(editor);
    expect(selectSpy).toHaveBeenCalledWith(editor, {
      anchor: Editor.start(editor, [0]),
      focus: Editor.start(editor, [0]),
    });
  });
});
