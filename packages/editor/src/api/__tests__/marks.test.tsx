import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor, Transforms, type Descendant, type Text } from "slate";
import { ReactEditor, type RenderLeafProps } from "slate-react";
import { createEditorKit } from "../../kit/EditorKit";
import { defineExtension } from "../extension";
import type { MarkRenderProps, MarkSpec } from "../marks";
import LeafRenderer from "../../components/LeafRenderer";
import { textFormattingExtension } from "@tau/editor-text-formatting";
import { paragraph } from "../../extensions";
import { standardExtensions } from "../../../../../editor-extensions/standard";
import { createCommandDispatcher } from "../command";
import { registerHotKey } from "../../utils/hotkey";
import { EditorThemeOverride } from "../../theme/context";

const leaf = (fields: Record<string, unknown> = {}): Text => ({
  type: "formatted",
  text: "正文",
  ...fields,
});
const marker = (id: string, keys: string[], render: MarkSpec["render"]): MarkSpec => ({
  id,
  keys,
  render,
});
const wrap =
  (name: string) =>
  ({ children }: MarkRenderProps) => <span data-mark={name}>{children}</span>;
const extension = (id: string, marks: MarkSpec[]) => defineExtension({ id, marks });
const attributes: RenderLeafProps["attributes"] = { "data-slate-leaf": true };

describe("标记装配与所有权", () => {
  it.each(["type", "text", "children", ""])("拒绝保留或空字段 %s", key => {
    expect(() =>
      createEditorKit({ extensions: [extension("a", [marker("a", [key], wrap("a"))])] })
    ).toThrow(/标记字段/);
  });

  it("重复 key 或 id 即使开启元素 override 也报错", () => {
    const first = extension("first", [marker("first", ["bold"], wrap("a"))]);
    for (const second of [
      marker("second", ["bold"], wrap("b")),
      marker("first", ["italic"], wrap("b")),
    ]) {
      expect(() =>
        createEditorKit({ extensions: [first, extension("second", [second])], override: true })
      ).toThrow(/标记/);
    }
  });

  it("标记顺序沿用扩展及声明顺序，服务派生不重建装配", () => {
    const kit = createEditorKit({
      extensions: [
        extension("a", [marker("a1", ["a"], wrap("a")), marker("a2", ["b"], wrap("b"))]),
        extension("b", [marker("b", ["c"], wrap("c"))]),
      ],
    });
    expect(kit.assembly.marks.map(entry => entry.spec.id)).toEqual(["a1", "a2", "b"]);
    expect(kit.extend({ services: [] }).assembly).toBe(kit.assembly);
  });

  it("元素覆盖不得暗中移除混合扩展的标记，按扩展 id 替换则明确生效", () => {
    const kit = createEditorKit({
      extensions: [
        defineExtension({
          id: "mixed",
          marks: [marker("mixed.mark", ["custom"], wrap("custom"))],
          elements: [{ type: "mixed-node", kind: "block", render: () => null }],
        }),
      ],
    });
    expect(() =>
      kit.extend({
        override: true,
        extensions: [
          defineExtension({
            id: "replacement",
            elements: [{ type: "mixed-node", kind: "block", render: () => null }],
          }),
        ],
      })
    ).toThrow(/标记贡献/);
    const replaced = kit.extend({ override: true, extensions: [defineExtension({ id: "mixed" })] });
    expect(replaced.assembly.marks).toHaveLength(0);
    expect(kit.assembly.marks).toHaveLength(1);
  });

  it("裸段落不再暗带格式，默认产品 Kit 保留格式能力", () => {
    const bare = createEditorKit();
    expect(bare.assembly.marks).toHaveLength(0);
    expect(bare.assembly.commands.get("tau.mark.bold")).toBeUndefined();
    expect(paragraph.toolbar).toBeUndefined();
    expect(paragraph.plugins).toBeUndefined();
    const product = createEditorKit({ extensions: standardExtensions });
    expect(product.assembly.commands.get("tau.mark.bold")?.owner).toBe(textFormattingExtension.id);
    expect(product.assembly.hoveringBarElements.map(item => item.id)).toContain("color");
  });
});

describe("叶子组合与异常回退", () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    vi.restoreAllMocks();
  });
  const render = async (node: ReactNode) => {
    if (!root) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    }
    await act(async () => root?.render(node));
    return host;
  };
  const content = <span data-slate-string>正文</span>;

  it("先声明在内，宿主仅包装格式结果，Slate 属性只有核心一份", async () => {
    const kit = createEditorKit({
      extensions: [
        extension("custom", [
          marker("first", ["a"], wrap("first")),
          marker("second", ["b"], wrap("second")),
        ]),
      ],
    });
    const value = leaf({ a: false, b: 0, unknown: "保留" });
    const result = await render(
      <LeafRenderer
        attributes={attributes}
        leaf={value}
        marks={kit.assembly.marks}
        wrapper={wrap("host")}
        onError={vi.fn()}
      >
        {content}
      </LeafRenderer>
    );
    expect(result.querySelectorAll("[data-slate-leaf]")).toHaveLength(1);
    expect(
      result.querySelector(
        '[data-slate-leaf] > [data-mark="host"] > [data-mark="second"] > [data-mark="first"] [data-slate-string]'
      )?.textContent
    ).toBe("正文");
    expect(value).toEqual(leaf({ a: false, b: 0, unknown: "保留" }));
  });

  it("缺失贡献仍显示文本且不改变未知标记", async () => {
    const value = leaf({ custom: { value: "未知" } });
    const before = JSON.stringify(value);
    const result = await render(
      <LeafRenderer attributes={attributes} leaf={value} marks={[]} onError={vi.fn()}>
        {content}
      </LeafRenderer>
    );
    expect(result.textContent).toBe("正文");
    expect(JSON.stringify(value)).toBe(before);
  });

  it("外层失败保留内层，数据未变不重复上报，数据或实现更新可恢复", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = vi.fn();
    const failure = new Error("标记失败");
    const bad = marker("bad", ["b"], () => {
      throw failure;
    });
    const good = marker("good", ["a"], wrap("good"));
    const marks = [
      { owner: "good", spec: good },
      { owner: "bad", spec: bad },
    ];
    const value = leaf({ a: true, b: true });
    const view = (current: Text, currentMarks = marks) => (
      <LeafRenderer attributes={attributes} leaf={current} marks={currentMarks} onError={report}>
        {content}
      </LeafRenderer>
    );
    const result = await render(view(value));
    expect(result.querySelector('[data-mark="good"]')?.textContent).toBe("正文");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("bad", failure);
    await render(view(value));
    expect(report).toHaveBeenCalledTimes(1);
    await render(view(leaf({ a: true, b: true })));
    expect(report).toHaveBeenCalledTimes(2);
    await render(
      view(value, [
        { owner: "good", spec: good },
        { owner: "bad", spec: marker("bad", ["b"], wrap("recovered")) },
      ])
    );
    expect(result.querySelector('[data-mark="recovered"] [data-mark="good"]')?.textContent).toBe(
      "正文"
    );
  });

  it.each(["light", "dark"] as const)("基础格式保留嵌套、组合线条和明暗颜色（%s）", async mode => {
    const marks = createEditorKit({ extensions: [textFormattingExtension] }).assembly.marks;
    const value = leaf({
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      code: true,
      highlight: true,
      color: "rgb(1, 2, 3)",
      darkColor: "rgb(4, 5, 6)",
    });
    const result = await render(
      <EditorThemeOverride mode={mode}>
        <LeafRenderer attributes={attributes} leaf={value} marks={marks} onError={vi.fn()}>
          {content}
        </LeafRenderer>
      </EditorThemeOverride>
    );
    const styled = result.querySelector(".font-bold") as HTMLElement;
    expect(styled.className).toContain("italic");
    expect(styled.style.textDecoration).toContain("underline");
    expect(styled.style.textDecoration).toContain("line-through");
    expect(styled.style.color).toBe(mode === "dark" ? "rgb(4, 5, 6)" : "rgb(1, 2, 3)");
    expect(styled.querySelector("span.border-b-2 > code")?.textContent).toBe("正文");
  });

  it("渐变优先于普通颜色，未知高亮色不画高亮", async () => {
    const marks = createEditorKit({ extensions: [textFormattingExtension] }).assembly.marks;
    const result = await render(
      <LeafRenderer
        attributes={attributes}
        leaf={leaf({
          textGradient: "ocean",
          color: "red",
          darkColor: "blue",
          highlight: "unknown",
        })}
        marks={marks}
        onError={vi.fn()}
      >
        {content}
      </LeafRenderer>
    );
    expect(result.querySelector('[style*="background-image"]')).toBeTruthy();
    expect(result.querySelector(".border-b-2")).toBeNull();
    expect(result.textContent).toBe("正文");
  });
});

describe("格式命令与后备热键", () => {
  afterEach(() => vi.restoreAllMocks());
  const setup = (extra: ReturnType<typeof defineExtension>[] = []) => {
    const editor = createEditor();
    editor.children = [{ type: "paragraph", children: [leaf()] }] as Descendant[];
    Transforms.select(editor, Editor.range(editor, [0]));
    const kit = createEditorKit({ extensions: [...standardExtensions, ...extra] });
    const record = vi.fn();
    const dispatcher = createCommandDispatcher(kit.assembly.commands, {
      isDisabled: () => false,
      record,
    });
    const keys = kit.assembly.commandHotkeys.map(({ hotkey }) => ({
      kind: "command" as const,
      keys: hotkey.key,
      command: hotkey.command,
    }));
    return { editor, kit, dispatcher, record, keys };
  };
  const event = (key: string, which: number, ctrlKey = false) =>
    ({
      key,
      which,
      ctrlKey,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation: vi.fn(),
    }) as unknown as React.KeyboardEvent<HTMLDivElement>;

  it.each([
    ["mod+b", "b", 66, true],
    ["escape", "Escape", 27, false],
  ] as const)("后注册的领域热键仍先于格式后备（%s）", (key, raw, which, ctrl) => {
    const run = vi.fn((_editor, context) => context.event.preventDefault());
    const { editor, dispatcher, keys } = setup([
      defineExtension({
        id: "host.test",
        commands: [{ id: "host.consume", run }],
        hotkeys: [{ key, command: "host.consume" }],
      }),
    ]);
    registerHotKey(editor, event(raw, which, ctrl), keys, dispatcher);
    expect(run).toHaveBeenCalledOnce();
    expect(JSON.stringify(editor.children)).not.toContain('"bold":true');
  });

  it("领域热键放行后执行格式命令，命令 owner 为格式扩展", () => {
    const { editor, dispatcher, keys, kit } = setup([
      defineExtension({
        id: "host.pass",
        commands: [{ id: "host.pass", run: () => undefined }],
        hotkeys: [{ key: "mod+b", command: "host.pass" }],
      }),
    ]);
    registerHotKey(editor, event("b", 66, true), keys, dispatcher);
    expect(JSON.stringify(editor.children)).toContain('"bold":true');
    expect(kit.assembly.commands.get("tau.mark.bold")?.owner).toBe("tau.text-formatting");
  });

  it("工具条与键盘保持各自的选区结束语义", () => {
    vi.spyOn(ReactEditor, "focus").mockImplementation(() => undefined);
    const toolbar = setup();
    toolbar.dispatcher.execute(toolbar.editor, "tau.mark.bold", { payload: { source: "toolbar" } });
    expect(Editor.marks(toolbar.editor)?.bold).toBe(true);
    const keyboard = setup();
    keyboard.dispatcher.execute(keyboard.editor, "tau.mark.bold");
    expect(Editor.marks(keyboard.editor)?.bold).toBeUndefined();
  });

  it("只读时格式与颜色命令均拒绝写入", () => {
    const { editor, dispatcher } = setup();
    const before = editor.children;
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    for (const id of [
      "tau.mark.bold",
      "tau.edit.clear-marks",
      "tau.mark.set-text-color",
      "tau.mark.set-gradient",
      "tau.mark.set-highlight",
      "tau.mark.clear-colors",
      "tau.mark.apply-colors",
    ]) {
      expect(dispatcher.execute(editor, id, { payload: "red" })).toBe(false);
    }
    expect(editor.children).toBe(before);
  });

  it("颜色命令校验输入，实际写入异常交分发器隔离", () => {
    const { editor, dispatcher, record } = setup();
    const before = editor.children;
    dispatcher.execute(editor, "tau.mark.set-gradient", { payload: "unknown" });
    dispatcher.execute(editor, "tau.mark.set-text-color", { payload: [] });
    dispatcher.execute(editor, "tau.mark.apply-colors", { payload: {} });
    expect(editor.children).toBe(before);
    dispatcher.execute(editor, "tau.mark.set-gradient", { payload: "ocean" });
    expect(Editor.marks(editor)?.textGradient).toBe("ocean");
    vi.spyOn(Editor, "addMark").mockImplementation(() => {
      throw new Error("写入失败");
    });
    expect(dispatcher.execute(editor, "tau.mark.set-highlight", { payload: "yellow" })).toBe(false);
    expect(record).toHaveBeenCalledWith("tau.text-formatting", "command", expect.any(Error));
  });
});
