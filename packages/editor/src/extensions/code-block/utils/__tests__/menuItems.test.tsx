import React from "react";
import { createEditor } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as deleteCodeBlockModule from "../deleteCodeBlock";
import { buildCodeBlockMenuItems } from "../menuItems";

vi.mock("../../index", () => ({
  default: class MockCodeBlockExtension {},
  codeBlockMap: new Map(),
  codeBlockActionsMap: new Map(),
}));

describe("buildCodeBlockMenuItems", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("删除菜单应走代码块专用删除逻辑", () => {
    const editor = createEditor();
    const element = {
      type: "code-block" as const,
      code: "const a = 1;",
      language: "ts",
      uuid: "code-block-1",
      children: [{ type: "formatted" as const, text: "" }],
    };
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "前文" }],
      },
      element,
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "后文" }],
      },
    ] as any;
    const path = [1];

    const deleteSpy = vi
      .spyOn(deleteCodeBlockModule, "deleteCodeBlock")
      .mockImplementation(() => undefined);

    const items = buildCodeBlockMenuItems({ editor, element, path });
    const deleteItem = items.find((item) => item.key === "delete");

    deleteItem?.onSelect?.();

    expect(deleteSpy).toHaveBeenCalledWith(editor, path);
  });
});
