import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor, Editor, Node, Transforms, type Descendant } from "slate";
import { HistoryEditor, withHistory } from "slate-history";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";

const cases = ["block", "inline"].flatMap(kind => [0, 1, 2].map(depth => ({ kind, depth })));

describe("void 块的文本路径映射", () => {
  it.each(cases)(
    "$kind、嵌套 $depth 层：光标恢复、位置变更和撤销保持真实叶子",
    async ({ kind, depth }) => {
      const editor = withHistory(withReact(createEditor()));
      editor.isVoid = element => (element as { type: string }).type === "test-void";
      editor.isInline = element => {
        const type: string = element.type;
        return kind === "inline" && (type === "test-void" || type === "void-container");
      };
      const leaf = { type: "formatted" as const, text: "" };
      let children: unknown[] = [leaf];
      for (let level = 0; level < depth; level++) {
        children = [{ type: "void-container", children }];
      }
      const target = { type: "test-void", source: "保留源码", children };
      const paragraph = (text: string) => ({
        type: "paragraph" as const,
        children: [{ type: "formatted" as const, text }],
      });
      const value = [
        paragraph("说明"),
        kind === "block"
          ? target
          : {
              type: "paragraph",
              children: [
                { type: "formatted", text: "前" },
                target,
                { type: "formatted", text: "后" },
              ],
            },
      ] as unknown as Descendant[];
      const originalValue = structuredClone(value);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      const render = (readOnly: boolean) =>
        act(async () => {
          root.render(
            <Slate editor={editor} initialValue={value}>
              <Editable
                readOnly={readOnly}
                renderElement={({ attributes, children, element }) =>
                  editor.isInline(element) ? (
                    <span {...attributes}>{children}</span>
                  ) : (
                    <div {...attributes}>{children}</div>
                  )
                }
              />
            </Slate>
          );
        });
      const assertPath = (blockIndex: number) => {
        const expected = [
          blockIndex,
          ...(kind === "inline" ? [1] : []),
          ...Array(depth + 1).fill(0),
        ];
        const node = Node.get(editor, expected);
        expect(ReactEditor.findPath(editor, node)).toEqual(expected);
        expect(Node.leaf(editor, expected)).toBe(node);
        const spacerText = host.querySelector(
          "[data-slate-spacer] [data-slate-zero-width]"
        )?.firstChild;
        if (!spacerText) throw new Error("void 块缺少光标占位文本");
        const point = ReactEditor.toSlatePoint(editor, [spacerText, 0], {
          exactMatch: false,
          suppressThrow: false,
        });
        expect(point).toEqual({ path: expected, offset: 0 });
        return point;
      };
      try {
        await render(true);
        assertPath(1);
        await render(false);
        await act(async () => {
          Transforms.select(editor, assertPath(1));
          expect(() => Editor.marks(editor)).not.toThrow();
        });
        expect(editor.children).toEqual(originalValue);
        await act(async () => {
          HistoryEditor.withNewBatch(editor, () =>
            Transforms.insertNodes(editor, paragraph("新增"), { at: [0] })
          );
        });
        assertPath(2);
        await act(async () => editor.undo());
        assertPath(1);
        expect(editor.children).toEqual(originalValue);
        await act(async () => editor.redo());
        assertPath(2);
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    }
  );
});
