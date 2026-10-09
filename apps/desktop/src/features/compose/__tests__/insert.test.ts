import { describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant } from "slate";

vi.mock("@/editor-extensions/content-link/components/utils", () => ({ wrapContentLink: vi.fn() }));

import { removeEntityLinks } from "../insert";

const link = (refId: number, text: string, contentTitle = "间隔重复") => ({
  type: "content-link",
  contentType: "card",
  contentId: 9,
  refId,
  contentTitle,
  children: [{ type: "formatted", text }],
});

const paragraph = (...children: object[]) => ({ type: "paragraph", children }) as Descendant;

describe("removeEntityLinks", () => {
  it("标题文字的链接整段删掉，包着原话的只解开，别的资料不动", () => {
    const editor = createEditor();
    editor.isInline = element => (element as { type?: string }).type === "content-link";
    editor.children = [
      paragraph(
        { type: "formatted", text: "前文 " },
        link(1, "间隔重复"),
        { type: "formatted", text: " 中间 " },
        link(1, "遗忘曲线说明了"),
        { type: "formatted", text: " " },
        link(2, "别的", "别的")
      ),
    ];

    expect(removeEntityLinks(editor, { kind: "card", id: 1 })).toBe(2);
    const json = JSON.stringify(editor.children);
    expect(json).not.toContain('"refId":1');
    expect(json).toContain("遗忘曲线说明了");
    expect(json).not.toContain('"text":"间隔重复"');
    expect(json).toContain('"refId":2');
    expect(removeEntityLinks(editor, { kind: "card", id: 1 })).toBe(0);
  });
});
