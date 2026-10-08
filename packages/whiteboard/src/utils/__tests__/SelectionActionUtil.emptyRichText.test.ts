import { describe, expect, it, vi } from "vitest";
import { deleteEmptyRichText } from "../SelectionActionUtil";
import BoardClass from "../../Board";
import type { Board, BoardElement } from "../../types";

const text = (patch: Partial<BoardElement> & Record<string, unknown> = {}) =>
  ({
    id: "t1",
    type: "richtext",
    x: 0,
    y: 0,
    width: 160,
    height: 40,
    content: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
    ...patch,
  }) as BoardElement;

const makeBoard = (children: BoardElement[]) => {
  const apply = vi.fn();
  const board = {
    boardFlag: BoardClass.boardFlag,
    children,
    apply,
  } as unknown as Board;
  return { board, apply };
};

describe("deleteEmptyRichText", () => {
  it("空白富文本被移除", () => {
    const element = text();
    const { board, apply } = makeBoard([element]);

    expect(deleteEmptyRichText(board, element)).toBe(true);
    expect(apply).toHaveBeenCalledWith({ type: "remove_node", path: [0], node: element });
  });

  it("有内容的不动", () => {
    const element = text({
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "hi" }] }],
    });
    const { board, apply } = makeBoard([element]);

    expect(deleteEmptyRichText(board, element)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("已创建为卡片 / 文章的，以及只读的不动", () => {
    for (const patch of [{ linkedCardId: 3 }, { linkedArticleId: 4 }, { readonly: true }]) {
      const element = text(patch);
      const { board, apply } = makeBoard([element]);
      expect(deleteEmptyRichText(board, element)).toBe(false);
      expect(apply).not.toHaveBeenCalled();
    }
  });

  it("非文本元素不走这条清理", () => {
    const element = text({ type: "document", entityRef: { kind: "card", id: 9 } });
    const { board, apply } = makeBoard([element]);

    expect(deleteEmptyRichText(board, element)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("已不在画布上的元素不动", () => {
    const element = text();
    const { board, apply } = makeBoard([]);

    expect(deleteEmptyRichText(board, element)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
