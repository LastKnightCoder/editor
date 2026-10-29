import { createEditor, Editor, Transforms, type Descendant } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it } from "vitest";
import { commitDictation } from "../commitDictation";

const paragraph = (text: string) =>
  ({
    type: "paragraph",
    children: [{ type: "formatted", text }],
  }) as unknown as Descendant;

function makeEditor(children: Descendant[]) {
  const editor = withHistory(createEditor());
  editor.children = JSON.parse(JSON.stringify(children));
  return editor;
}

/** 同一 tick 内 editor.operations 未清空，slate-history 会并入上一撤销步；模拟用户的后续编辑需要跨 tick */
const nextTick = () => new Promise(resolve => setTimeout(resolve));

const texts = (editor: Editor) => editor.children.map((_, index) => Editor.string(editor, [index]));

describe("commitDictation", () => {
  it("空白文本返回 null 且不改文档", () => {
    const editor = makeEditor([paragraph("abc")]);
    const pointRef = Editor.pointRef(editor, { path: [0, 0], offset: 1 });
    expect(commitDictation(editor, { kind: "point", pointRef }, "  \n ")).toBeNull();
    expect(commitDictation(editor, { kind: "end" }, "")).toBeNull();
    expect(texts(editor)).toEqual(["abc"]);
    expect(editor.history.undos).toHaveLength(0);
  });

  it("point 模式在插入点写入，光标移到末尾", () => {
    const editor = makeEditor([paragraph("开头结尾")]);
    const pointRef = Editor.pointRef(editor, { path: [0, 0], offset: 2 });
    const commit = commitDictation(editor, { kind: "point", pointRef }, "中间")!;
    expect(texts(editor)).toEqual(["开头中间结尾"]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 4 },
      focus: { path: [0, 0], offset: 4 },
    });
    expect(Editor.string(editor, commit.rangeRef.current!)).toBe("中间");
  });

  it("多段文本拆成新段落，插在当前块后面", () => {
    const editor = makeEditor([paragraph("前缀后缀"), paragraph("下一块")]);
    const pointRef = Editor.pointRef(editor, { path: [0, 0], offset: 2 });
    const commit = commitDictation(editor, { kind: "point", pointRef }, "一\n二\n三")!;
    expect(texts(editor)).toEqual(["前缀一", "二", "三后缀", "下一块"]);
    expect(editor.selection?.anchor).toEqual({ path: [2, 0], offset: 1 });
    expect(Editor.string(editor, commit.rangeRef.current!)).toBe("一二三");
  });

  it("end 模式在文末追加段落", () => {
    const editor = makeEditor([paragraph("已有")]);
    commitDictation(editor, { kind: "end" }, "新的\n第二段");
    expect(editor.children).toEqual([paragraph("已有"), paragraph("新的"), paragraph("第二段")]);
  });

  it("end 模式遇到只有一个空段落的文档直接填入", () => {
    const editor = makeEditor([paragraph("")]);
    commitDictation(editor, { kind: "end" }, "填进去");
    expect(editor.children).toEqual([paragraph("填进去")]);
  });

  it("replace 替换写入范围，并保持范围跟随新文本", () => {
    const editor = makeEditor([paragraph("AB")]);
    const pointRef = Editor.pointRef(editor, { path: [0, 0], offset: 1 });
    const commit = commitDictation(editor, { kind: "point", pointRef }, "原文")!;
    commit.replace("润色后\n两段");
    expect(texts(editor)).toEqual(["A润色后", "两段B"]);
    commit.replace("原文");
    expect(texts(editor)).toEqual(["A原文B"]);
    expect(Editor.string(editor, commit.rangeRef.current!)).toBe("原文");
  });

  it("写入 + 两次 replace 后 undo 一次，文档等于写入前", async () => {
    for (const target of ["point", "end"] as const) {
      const editor = makeEditor([paragraph("第一段"), paragraph("第二段")]);
      // 先有一次用户编辑，确认写入不并进已有撤销步
      Transforms.insertText(editor, "前", { at: { path: [0, 0], offset: 0 } });
      await nextTick();
      const before = JSON.parse(JSON.stringify(editor.children));
      const undosBefore = editor.history.undos.length;
      const commit = commitDictation(
        editor,
        target === "point"
          ? {
              kind: "point",
              pointRef: Editor.pointRef(editor, { path: [1, 0], offset: 1 }),
            }
          : { kind: "end" },
        "说的话\n换行"
      )!;
      commit.replace("润色\n结果\n三段");
      commit.replace("说的话\n换行");
      expect(editor.history.undos).toHaveLength(undosBefore + 1);
      commit.undo();
      expect(editor.children).toEqual(before);
    }
  });

  it("写入后用户另有编辑，replace 不并入用户的撤销步", async () => {
    const editor = makeEditor([paragraph("")]);
    const commit = commitDictation(editor, { kind: "end" }, "原文")!;
    await nextTick();
    Transforms.insertNodes(editor, paragraph("用户"), { at: [1] });
    await nextTick();
    commit.replace("润色");
    expect(editor.history.undos).toHaveLength(3);
    editor.undo();
    expect(editor.children).toEqual([paragraph("原文"), paragraph("用户")]);
  });
});
