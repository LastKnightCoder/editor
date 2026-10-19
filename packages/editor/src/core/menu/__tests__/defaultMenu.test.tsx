// P8：内核默认菜单——block 组命令（移动/删除）与 transform 组的类型限定（01 §5.4）。
import { describe, expect, it, vi } from "vitest";
import { createEditor, Node, Transforms, type Editor, type Element, type Path } from "slate";

import { defaultMenuExtension } from "../defaultMenu";
import { resolveBlockMenuItems } from "../resolveMenu";
import { createEditorKit } from "../../kit/EditorKit";
import { createCommandDispatcher } from "../../api/command";
import { standardExtensions } from "../../../presets/standard";
import { ReactEditor } from "slate-react";
import { beginSubmissionScope } from "../../kit/submissionScope";

const kit = createEditorKit({ extensions: standardExtensions });
const dispatcher = createCommandDispatcher(kit.assembly.commands, {
  isDisabled: () => false,
  record: (_owner, _phase, error) => {
    throw error;
  },
});

const text = (value: string) => ({ type: "formatted" as const, text: value });
const paragraph = (value: string) => ({ type: "paragraph" as const, children: [text(value)] });

const withValue = (children: any[], isVoidType?: string): Editor => {
  const editor = createEditor();
  editor.getService = id => kit.registry.get(id);
  editor.tryGetService = id => kit.registry.tryGet(id);
  editor.commands = {
    execute: (id, payload, element, path) =>
      dispatcher.execute(editor, id, { payload, element, path }),
  };
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
  resolveBlockMenuItems(kit.assembly.menuSources, { editor, element, path });

const keysOf = (items: ReturnType<typeof resolveBlockMenuItems>): string[] =>
  items.flatMap(item => [item.key, ...(item.children ? keysOf(item.children) : [])]);

describe("内核默认菜单 · block 组", () => {
  it.each(["tau.block.delete", "tau.block.move-up", "tau.block.move-down"])(
    "%s 拒绝被替代的目标和只读调用",
    id => {
      const editor = withValue([paragraph("前"), paragraph("目标"), paragraph("后")]);
      const target = editor.children[1] as Element;
      Transforms.removeNodes(editor, { at: [1] });
      Transforms.insertNodes(editor, paragraph("替代内容"), { at: [1] });
      const before = JSON.stringify(editor.children);
      runCommand(editor, id, target, undefined, [1]);
      expect(JSON.stringify(editor.children)).toBe(before);
      const readonly = vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
      try {
        runCommand(editor, id, editor.children[1] as Element, undefined, [1]);
        expect(JSON.stringify(editor.children)).toBe(before);
      } finally {
        readonly.mockRestore();
      }
    }
  );

  it.each(["失败", "移动", "删除", "修改", "会话结束"] as const)(
    "剪切等待期间目标%s时只处理已复制的原节点",
    async scenario => {
      let finish!: () => void;
      const write = vi.fn(() =>
        scenario === "失败"
          ? Promise.reject(new Error("剪贴板不可用"))
          : new Promise<void>(resolve => (finish = resolve))
      );
      const writeText = vi.fn(async () => {});
      vi.stubGlobal("navigator", { clipboard: { write, writeText } });
      vi.stubGlobal("ClipboardItem", class {});
      const report = vi.spyOn(console, "error").mockImplementation(() => {});
      const editor = withValue([paragraph("原文"), paragraph("后文")]);
      const stop = beginSubmissionScope(editor);
      editor.tryGetService = () => ({ success: vi.fn(), error: vi.fn() }) as never;
      const original = editor.children[0] as Element;
      const command = commandsOf().find(item => item.id === "tau.block.cut")!;
      try {
        const task = command.run(editor, { element: original, path: [0] });
        if (scenario === "移动") {
          Transforms.insertNodes(editor, paragraph("新增"), { at: [0] });
        } else if (scenario === "删除") {
          Transforms.removeNodes(editor, { at: [0] });
          Transforms.insertNodes(editor, paragraph("替代内容"), { at: [0] });
        } else if (scenario === "修改") {
          Transforms.insertText(editor, "新", { at: { path: [0, 0], offset: 0 } });
        } else if (scenario === "会话结束") {
          stop();
          beginSubmissionScope(editor);
        }
        if (scenario !== "失败") finish();
        await task;
        const expected = {
          失败: "原文后文",
          移动: "新增后文",
          删除: "替代内容后文",
          修改: "新原文后文",
          会话结束: "原文后文",
        }[scenario];
        expect(Node.string(editor)).toBe(expected);
        expect(writeText).not.toHaveBeenCalled();
        expect(editor.pathRefs().size).toBe(0);
      } finally {
        stop();
        vi.unstubAllGlobals();
        report.mockRestore();
      }
    }
  );

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

describe("显式领域扩展 · transform 组", () => {
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

    const imageEditor = withValue([{ type: "image", url: "", children: [text("")] }]);
    expect(keysOf(menuOf(imageEditor, imageEditor.children[0] as Element))).not.toContain(
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
