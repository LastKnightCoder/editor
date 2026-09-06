import { createEditor, Descendant, Editor } from "slate";
import { describe, expect, it } from "vitest";

import { withNormalize } from "../normalize";

describe("tabs normalize plugin", () => {
  it("占位 children 不应删除节点或抛出异常，也不应被洗成正式结构", () => {
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
    // 空壳形态保守不动（可能是跨版本写入的脏数据），等真实数据源
    const [node] = editor.children as unknown as [{ type: string; children: { type: string }[] }];
    expect(node.type).toBe("tabs");
    expect(node.children[0].type).toBe("formatted");
  });

  it("旧数据（tabsContent 形态）应迁移为 tab-pane 子节点", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor.children = [
      {
        type: "tabs",
        activeKey: "b",
        tabsContent: [
          {
            key: "a",
            title: "A",
            content: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
          },
          { key: "b", title: "B", content: [] },
        ],
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "最新" }] }],
      },
    ] as unknown as Descendant[];

    expect(() => Editor.normalize(editor, { force: true })).not.toThrow();
    const [node] = editor.children as unknown as [
      {
        type: string;
        activeKey: string;
        tabsContent?: unknown;
        children: { type: string; tabKey: string; title: string; children: unknown[] }[];
      },
    ];
    expect(node.type).toBe("tabs");
    expect(node.tabsContent).toBeUndefined();
    expect(node.children).toHaveLength(2);
    expect(node.activeKey).toBe("b");
    expect(node.children[0]).toMatchObject({ type: "tab-pane", tabKey: "a", title: "A" });
    expect(node.children[1]).toMatchObject({ type: "tab-pane", tabKey: "b", title: "B" });
    // 激活 Tab 的实时内容（children）应覆盖空快照
    expect(JSON.stringify(node.children[1].children)).toContain("最新");
  });

  it("空 tabs 节点应退化为空段落", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor.children = [
      {
        type: "tabs",
        activeKey: "a",
        children: [],
      },
    ] as unknown as Descendant[];

    Editor.normalize(editor, { force: true });
    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("失效 activeKey 应修正为第一个 pane", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor.children = [
      {
        type: "tabs",
        activeKey: "gone",
        children: [
          {
            type: "tab-pane",
            tabKey: "a",
            title: "A",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
          },
          {
            type: "tab-pane",
            tabKey: "b",
            title: "B",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }],
          },
        ],
      },
    ] as unknown as Descendant[];

    Editor.normalize(editor, { force: true });
    const [node] = editor.children as unknown as [{ activeKey: string }];
    expect(node.activeKey).toBe("a");
  });
});
