import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { notePreviewText } from "../useNoteList";

describe("笔记预览文本", () => {
  it("按块拼接正文开头，压缩空白并截断", () => {
    const nodes = [
      { type: "paragraph", children: [{ text: "重读≠记住。" }, { text: "  只是熟悉感" }] },
      {
        type: "blockquote",
        children: [{ type: "paragraph", children: [{ text: "快要忘记时再回想" }] }],
      },
    ] as unknown as Descendant[];
    expect(notePreviewText(nodes)).toBe("重读≠记住。 只是熟悉感 快要忘记时再回想");
    expect(notePreviewText(nodes, 5)).toBe("重读≠记住");
  });

  it("空内容返回空串", () => {
    expect(notePreviewText(undefined)).toBe("");
    expect(notePreviewText([{ type: "paragraph", children: [{ text: "" }] }] as never)).toBe("");
  });
});
