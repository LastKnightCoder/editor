import { describe, expect, it } from "vitest";
import { createEditor, Editor, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { createLocalTextFields } from "../localTextFields";
import { setElementVersionResolver } from "../../api/elementVersions";

const definition = {
  type: "code-step",
  kind: "block" as const,
  collaboration: { textFields: ["code"] },
  render: () => null as never,
};
function setup() {
  const editor = withReact(withHistory(createEditor()));
  editor.children = [
    {
      type: "code-block",
      children: [
        { type: "code-step", code: "abc", children: [{ text: "" }] },
        { type: "code-step", code: "other", children: [{ text: "" }] },
      ],
    },
  ] as never;
  editor.isVoid = node => node.type === "code-block";
  const service = createLocalTextFields(editor, [definition]);
  const field = service.open(editor, Node.get(editor, [0, 0]) as never, "code");
  return { editor, service, field };
}

describe("临时编辑器源码字段", () => {
  it("字段跟随步骤移动，增量与撤销使用同一历史", () => {
    const { editor, field } = setup();
    Transforms.moveNodes(editor, { at: [0, 0], to: [0, 1], voids: true });
    const revision = field.getSnapshot().revision;
    field.edit({ offset: 1, remove: 1, text: "中文", revision });
    expect((Node.get(editor, [0, 1]) as any).code).toBe("a中文c");
    expect((Node.get(editor, [0, 0]) as any).code).toBe("other");
    field.undo();
    expect(field.getSnapshot().value).toBe("abc");
    field.redo();
    expect(field.getSnapshot().value).toBe("a中文c");
    field.dispose();
    expect(Editor.pathRefs(editor).size).toBe(0);
  });

  it("过期快照、非法批次和只读祖先不产生部分写入", () => {
    const { editor, field } = setup();
    const revision = field.getSnapshot().revision;
    expect(() =>
      field.editBatch(
        [
          { offset: 0, remove: 0, text: "x" },
          { offset: 99, remove: 0, text: "y" },
        ],
        revision
      )
    ).toThrow();
    expect(field.getSnapshot().value).toBe("abc");
    field.edit({ offset: 3, remove: 0, text: "!", revision });
    expect(() => field.edit({ offset: 0, remove: 0, text: "x", revision })).toThrow();
    setElementVersionResolver(editor, node => ({
      element: definition,
      access: node.type === "code-block" ? "read" : "edit",
    }));
    expect(() =>
      field.edit({ offset: 0, remove: 0, text: "x", revision: field.getSnapshot().revision })
    ).toThrow();
    expect(field.getSnapshot().value).toBe("abc!");
  });

  it("删除与释放后拒绝写入，打开无效字段不泄漏路径", () => {
    const { editor, service, field } = setup();
    const events: unknown[] = [];
    field.subscribe(event => events.push(event));
    Transforms.removeNodes(editor, { at: [0, 0], voids: true });
    expect(() => field.replace("lost", field.getSnapshot().revision)).toThrow();
    const count = events.length;
    Transforms.setNodes(editor, { code: "new" } as never, { at: [0, 0], voids: true });
    expect(events).toHaveLength(count);
    field.dispose();
    Transforms.unsetNodes(editor, "code", { at: [0, 0], voids: true });
    expect(() => service.open(editor, Node.get(editor, [0, 0]) as never, "code")).toThrow();
    expect(Editor.pathRefs(editor).size).toBe(0);
  });
});
