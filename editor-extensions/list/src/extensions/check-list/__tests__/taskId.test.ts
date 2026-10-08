import { describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms } from "slate";
import { needsNewTaskId } from "../taskId";
import { ITaskIdSource } from "../../../../task-ids";

describe("勾选项身份索引", () => {
  it("一次规范化的已有身份只扫描一遍，结构变化后重建索引", () => {
    const editor = createEditor();
    editor.children = [
      {
        type: "check-list",
        children: Array.from({ length: 2000 }, (_, i) => ({
          type: "check-list-item",
          taskId: `t${i}`,
          checked: false,
          children: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
        })),
      },
    ] as never;
    const nodes = vi.spyOn(Editor, "nodes");
    for (let i = 0; i < 2000; i++) expect(needsNewTaskId(editor, `t${i}`, [0, i])).toBe(false);
    expect(nodes).toHaveBeenCalledTimes(1);
    nodes.mockRestore();
    Transforms.moveNodes(editor, { at: [0, 1], to: [0, 0] });
    expect(needsNewTaskId(editor, "t1", [0, 0])).toBe(false);
    expect(needsNewTaskId(editor, "t0", [0, 1])).toBe(false);
  });

  it("正文来源接管身份时，视图不为缺失 ID 生成随机值", () => {
    const editor = createEditor();
    editor.tryGetService = (id =>
      id === ITaskIdSource ? { managed: true } : undefined) as typeof editor.tryGetService;
    expect(needsNewTaskId(editor, undefined, [0])).toBe(false);
  });
});
