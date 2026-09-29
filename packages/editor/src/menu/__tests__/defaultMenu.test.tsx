// P8：内核默认菜单——block 组命令（移动/删除）与 transform 组的类型限定（01 §5.4）。
import { describe, expect, it } from "vitest";
import { createEditor, Transforms, type Editor, type Element } from "slate";

import { defaultMenuExtension } from "../defaultMenu";
import { resolveBlockMenuItems } from "../resolveMenu";
import type { EditorMenuContribution } from "../../api/menu";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

const withValue = (children: any[], isVoidType?: string): Editor => {
  const editor = createEditor();
  editor.children = children;
  if (isVoidType) {
    editor.isVoid = element => element.type === isVoidType;
  }
  return editor;
};

const commandsOf = () => defaultMenuExtension.commands!;
const runCommand = (
  editor: Editor,
  id: string,
  element: Element,
  payload?: unknown,
  path?: Path
) => {
  const command = commandsOf().find(item => item.id === id);
  if (!command) throw new Error(`命令 ${id} 不存在`);
  command.run(editor, { payload, element, path });
};

const menuOf = (editor: Editor, element: Element, path: Path = [0]) =>
  resolveBlockMenuItems(
    [{ owner: defaultMenuExtension.id, menu: defaultMenuExtension.menu as EditorMenuContribution }],
    { editor, element, path }
  );

const keysOf = (items: ReturnType<typeof resolveBlockMenuItems>): string[] =>
  items.flatMap(item => [item.key, ...(item.children ? keysOf(item.children) : [])]);

describe("内核默认菜单 · block 组", () => {
  it("delete 对 void 块删除并补空段落（图片/音视频/代码块的删除语义）", () => {
    const editor = withValue(
      [paragraph("前文"), { type: "image", url: "x.png", children: [text("")] }, paragraph("后文")],
      "image"
    );
    const target = editor.children[1] as Element;

    runCommand(editor, "tau.block.delete", target, undefined, [1]);

    expect(editor.children).toHaveLength(3);
    expect((editor.children[1] as any).type).toBe("paragraph");
  });

  it("delete 对可聚焦块直接移除，最后一块清空内容保底", () => {
    const editor = withValue([paragraph("一"), paragraph("二")]);
    runCommand(editor, "tau.block.delete", editor.children[0] as Element, undefined, [0]);
    expect((editor.children[0] as any).children[0].text).toBe("二");

    // 只剩一块时清空而不是删除，文档至少保留一个块
    Transforms.setNodes(editor, { type: "header", level: 1 }, { at: [0] });
    const header = editor.children[0] as Element;
    runCommand(editor, "tau.block.delete", header, undefined, [0]);
    expect(editor.children).toHaveLength(1);
    expect((editor.children[0] as any).type).toBe("header");
    expect((editor.children[0] as any).children[0].text).toBe("");
  });

  it("move-up / move-down 与相邻兄弟交换，边界时目标仍在原位（命令幂等）", () => {
    const editor = withValue([paragraph("一"), paragraph("二"), paragraph("三")]);

    runCommand(editor, "tau.block.move-up", editor.children[1] as Element, undefined, [1]);
    expect((editor.children[0] as any).children[0].text).toBe("二");

    runCommand(editor, "tau.block.move-down", editor.children[0] as Element, undefined, [0]);
    expect((editor.children[0] as any).children[0].text).toBe("一");

    // 首块上移、末块下移：没有可交换的兄弟，命令直接跳过
    const before = JSON.stringify(editor.children);
    runCommand(editor, "tau.block.move-up", editor.children[0] as Element, undefined, [0]);
    runCommand(editor, "tau.block.move-down", editor.children[2] as Element, undefined, [2]);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  it("上移在首块时灰显（disabled 谓词）", () => {
    const editor = withValue([paragraph("一"), paragraph("二")]);
    const items = menuOf(editor, editor.children[0] as Element);
    const moveUp = items.find(item => item.key === "tau.block.move-up");
    const moveDown = items.find(item => item.key === "tau.block.move-down");
    expect(moveUp?.disabled).toBe(true);
    expect(moveDown?.disabled).toBe(false);
  });
});

describe("内核默认菜单 · transform 组", () => {
  it("段落上有标题/列表/高亮/详情/Callout/引用；容器块上有段落且无标题；其他类型整组不出现", () => {
    const paragraphEditor = withValue([paragraph("正文")]);
    const paragraphKeys = keysOf(menuOf(paragraphEditor, paragraphEditor.children[0] as Element));
    expect(paragraphKeys).toContain("tau.transform.header-1");
    expect(paragraphKeys).toContain("tau.transform.callout-info");
    expect(paragraphKeys).not.toContain("tau.transform.paragraph");

    const calloutEditor = withValue([
      { type: "callout", calloutType: "info", title: "信息", children: [paragraph("内容")] },
    ]);
    const calloutKeys = keysOf(menuOf(calloutEditor, calloutEditor.children[0] as Element));
    expect(calloutKeys).toContain("tau.transform.paragraph");
    expect(calloutKeys).not.toContain("tau.transform.header-1");
    expect(calloutKeys).not.toContain("tau.transform.callout-info");

    const chartEditor = withValue([{ type: "chart", data: [], children: [text("")] }]);
    expect(keysOf(menuOf(chartEditor, chartEditor.children[0] as Element))).not.toContain(
      "tau.transform"
    );
  });

  it("段落转标题写入 level；容器转段落解包提升子节点", () => {
    const paragraphEditor = withValue([paragraph("正文")]);
    runCommand(
      paragraphEditor,
      "tau.transform.node",
      paragraphEditor.children[0] as Element,
      { target: "header", options: { level: 2 } },
      [0]
    );
    expect((paragraphEditor.children[0] as any).type).toBe("header");
    expect((paragraphEditor.children[0] as any).level).toBe(2);

    const calloutEditor = withValue([
      { type: "callout", calloutType: "info", title: "信息", children: [paragraph("内容")] },
    ]);
    runCommand(
      calloutEditor,
      "tau.transform.node",
      calloutEditor.children[0] as Element,
      {
        target: "paragraph",
      },
      [0]
    );
    expect((calloutEditor.children[0] as any).type).toBe("paragraph");
    expect((calloutEditor.children[0] as any).children[0].text).toBe("内容");
  });

  it("容器转列表按子节点展开为列表项，叶子转列表包装为列表项", () => {
    const calloutEditor = withValue([
      {
        type: "callout",
        calloutType: "info",
        title: "信息",
        children: [paragraph("甲"), paragraph("乙")],
      },
    ]);
    runCommand(
      calloutEditor,
      "tau.transform.node",
      calloutEditor.children[0] as Element,
      {
        target: "bulleted-list",
      },
      [0]
    );
    expect((calloutEditor.children[0] as any).type).toBe("bulleted-list");
    expect((calloutEditor.children[0] as any).children).toHaveLength(2);
    expect((calloutEditor.children[0] as any).children[0].type).toBe("list-item");

    const paragraphEditor = withValue([paragraph("正文")]);
    runCommand(
      paragraphEditor,
      "tau.transform.node",
      paragraphEditor.children[0] as Element,
      {
        target: "numbered-list",
      },
      [0]
    );
    expect((paragraphEditor.children[0] as any).type).toBe("numbered-list");
    expect((paragraphEditor.children[0] as any).children[0].type).toBe("list-item");
  });

  it("命令经 kit 装配注册（扩展 id 为 owner）", () => {
    // ExtensionAssembly 注册 v2 扩展命令；这里只验证声明完整性
    const ids = commandsOf().map(command => command.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "tau.block.move-up",
        "tau.block.move-down",
        "tau.block.cut",
        "tau.block.copy",
        "tau.block.delete",
        "tau.transform.node",
      ])
    );
  });
});
