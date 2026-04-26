import { createEditor } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as focusParagraphAfterDeleteModule from "../focusParagraphAfterDelete";
import { deleteCodeBlock } from "../deleteCodeBlock";

describe("deleteCodeBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应删除代码块并在原位置插入空段落，然后恢复段落焦点", () => {
    const editor = createEditor();
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "前文" }],
      },
      {
        type: "code-block",
        code: "const a = 1;",
        language: "ts",
        uuid: "code-block-1",
        children: [{ type: "formatted", text: "" }],
      },
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "后文" }],
      },
    ] as any;

    const focusSpy = vi
      .spyOn(focusParagraphAfterDeleteModule, "focusParagraphAfterDelete")
      .mockImplementation(() => undefined);

    deleteCodeBlock(editor, [1]);

    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "前文" }],
      },
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "后文" }],
      },
    ]);
    expect(focusSpy).toHaveBeenCalledWith(editor, [1]);
  });
});
