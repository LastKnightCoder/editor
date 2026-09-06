import { createEditor, Descendant, Editor } from "slate";
import { describe, expect, it } from "vitest";

import { withNormalize } from "../normalize";

describe("tabs normalize plugin", () => {
  it("标签页元数据尚未加载时不应删除节点或抛出异常", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor.children = [
      {
        type: "tabs",
        activeKey: "tab-1",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[];

    expect(() => Editor.normalize(editor, { force: true })).not.toThrow();
    expect(editor.children).toEqual([
      {
        type: "tabs",
        activeKey: "tab-1",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });
});
