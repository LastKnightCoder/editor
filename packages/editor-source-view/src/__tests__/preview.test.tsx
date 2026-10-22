import React, { act, createRef, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import {
  defineExtension,
  defineElement,
  focusNextBlock,
  focusPreviousBlock,
  type ElementRenderProps,
} from "@tau/editor/api";
import { PreviewWithEditor } from "../index";
import { Code2 } from "lucide-react";
import { previewMenuExtension } from "../../menu";

type Cursor = { line: number; ch: number };
interface FakeEditor {
  getValue(): string;
  setValue(value: string): void;
  getCursor(): Cursor;
  lastLine(): number;
  getLine(line: number): string;
  focus(): void;
  refresh(): void;
  getDoc(): {
    firstLine(): number;
    lastLine(): number;
    getLine(line: number): string;
    setCursor(cursor: Cursor): void;
  };
}
interface CodeProps {
  value: string;
  onChange(editor: FakeEditor, change: unknown, code: string): void;
  onKeyDown?(editor: FakeEditor, event: KeyboardEvent): void;
  onBlur?(editor: FakeEditor, event: FocusEvent): void;
  editorDidMount(editor: FakeEditor): void;
  editorWillUnmount(): void;
}
const observed = vi.hoisted(() => ({
  editors: [] as Array<{ props: CodeProps; editor: FakeEditor }>,
}));

// jsdom 无 CodeMirror 布局，只替换输入器，导航/菜单/Slate 回写使用真实实现。
vi.mock("react-codemirror2", () => ({
  UnControlled: (props: CodeProps) => {
    const value = useRef(props.value);
    const cursor = useRef<Cursor>({ line: 0, ch: 0 });
    const input = useRef<HTMLTextAreaElement>(null);
    const instance = useRef<{ props: CodeProps; editor: FakeEditor } | null>(null);
    if (!instance.current) {
      const lastLine = () => value.current.split("\n").length - 1;
      const getLine = (line: number) => value.current.split("\n")[line] || "";
      instance.current = {
        props,
        editor: {
          getValue: () => value.current,
          setValue: next => {
            value.current = next;
            if (input.current) input.current.value = next;
          },
          getCursor: () => cursor.current,
          lastLine,
          getLine,
          focus: vi.fn(),
          refresh: vi.fn(),
          getDoc: () => ({
            firstLine: () => 0,
            lastLine,
            getLine,
            setCursor: next => {
              cursor.current = next;
            },
          }),
        },
      };
    }
    instance.current.props = props;
    useEffect(() => {
      const current = instance.current!;
      observed.editors.push(current);
      props.editorDidMount(current.editor);
      return () => props.editorWillUnmount();
    }, []);
    return <textarea ref={input} defaultValue={props.value} aria-label="源码" />;
  },
}));

type PreviewElement = { type: "test-preview"; source: string; children: Descendant[] };
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "test-preview": PreviewElement;
  }
}
const PreviewBlock = ({ attributes, element, children }: ElementRenderProps<PreviewElement>) => {
  const editor = useSlateStatic();
  return (
    <div {...attributes}>
      <PreviewWithEditor
        title="源码"
        icon={Code2}
        element={element as never}
        mode="javascript"
        initValue={element.source}
        onChange={source =>
          Transforms.setNodes(editor, { source } as never, {
            at: ReactEditor.findPath(editor, element),
          })
        }
      >
        <output>{element.source}</output>
      </PreviewWithEditor>
      {children}
    </div>
  );
};
const fixture = defineExtension({
  id: "test.preview",
  elements: [
    defineElement<PreviewElement>({
      type: "test-preview",
      kind: "block",
      isVoid: true,
      render: PreviewBlock,
    }),
  ],
});
const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const keyEvent = (key: "ArrowUp" | "ArrowDown" | "Backspace") => {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  const code = { ArrowUp: 38, ArrowDown: 40, Backspace: 8 }[key];
  Object.defineProperties(event, { which: { value: code }, keyCode: { value: code } });
  return event;
};

describe("源码预览迁包后的行为", () => {
  let root: Root;
  let host: HTMLDivElement;
  let editor: SlateEditor;
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    observed.editors.length = 0;
  });
  const mount = async (source: string) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [previewMenuExtension, fixture],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
        },
      ],
    });
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            readonly={false}
            initValue={[
              paragraph("前"),
              { type: "test-preview", source, children: [{ type: "formatted", text: "" }] },
              paragraph("后"),
            ]}
          />
        </DndProvider>
      )
    );
    editor = ref.current!.getEditor();
    return kit;
  };
  const changeSource = async (source: string) => {
    const current = observed.editors.at(-1)!;
    await act(async () => {
      current.editor.setValue(source);
      current.props.onChange(current.editor, {}, source);
      await new Promise(resolve => setTimeout(resolve, 550));
    });
  };
  const edit = async () => {
    await act(async () => {
      editor.commands?.execute("tau.preview.edit", undefined, editor.children[1] as never, [1]);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
  };
  it("编辑回写与外部更新保持同步，服务派生不重装预览菜单", async () => {
    const kit = await mount("初始");
    expect(observed.editors).toHaveLength(0);
    await edit();
    await changeSource("编辑");
    expect(editor.children[1]).toMatchObject({ source: "编辑" });
    await act(async () => Transforms.setNodes(editor, { source: "外部" } as never, { at: [1] }));
    expect(observed.editors[0].editor.getValue()).toBe("外部");
    expect(
      kit.assembly.commandHotkeys.filter(entry => entry.hotkey.command.startsWith("tau.preview."))
    ).toHaveLength(0);
    expect(kit.extend({ services: [] }).assembly).toBe(kit.assembly);
  });
  it("源码起止方向键分别回到前后可编辑块", async () => {
    await mount("x");
    await act(async () => {
      expect(focusNextBlock(editor, [0], { reason: "arrow", direction: "forward" })).toBe(true);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    const current = observed.editors.at(-1)!;
    expect(current.editor.focus).toHaveBeenCalled();
    expect(current.editor.getCursor()).toEqual({ line: 0, ch: 0 });
    await act(async () => current.props.onKeyDown!(current.editor, keyEvent("ArrowUp")));
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    expect(host.querySelector('textarea[aria-label="源码"]')).toBeNull();
    await act(async () => {
      expect(focusPreviousBlock(editor, [2], { reason: "arrow", direction: "backward" })).toBe(
        true
      );
    });
    const last = observed.editors.at(-1)!;
    expect(last.editor.getCursor()).toEqual({ line: 0, ch: 1 });
    await act(async () => last.props.onKeyDown!(last.editor, keyEvent("ArrowDown")));
    expect(editor.selection?.anchor.path).toEqual([2, 0]);
  });
  it("不再提供全屏，空源码退格补回可编辑段落", async () => {
    await mount("内容");
    await act(async () => {
      expect(
        editor.commands?.execute(
          "tau.preview.fullscreen",
          undefined,
          editor.children[1] as never,
          [1]
        )
      ).toBe(false);
    });
    expect(document.querySelector("div.fixed.inset-0")).toBeNull();
    await edit();
    const current = observed.editors[0];
    current.editor.setValue("");
    await act(async () => current.props.onKeyDown!(current.editor, keyEvent("Backspace")));
    expect(editor.children[1]).toMatchObject({ type: "paragraph" });
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });
  it("输入后立即完成会提交草稿并释放编辑器，重新打开不丢字", async () => {
    await mount("初始");
    await edit();
    const current = observed.editors.at(-1)!;
    await act(async () => {
      current.editor.setValue("未等防抖的内容");
      current.props.onChange(current.editor, {}, "未等防抖的内容");
      Array.from(host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("完成"))!
        .click();
    });
    expect(editor.children[1]).toMatchObject({ source: "未等防抖的内容" });
    expect(host.querySelector('textarea[aria-label="源码"]')).toBeNull();
    await edit();
    expect(observed.editors.at(-1)!.editor.getValue()).toBe("未等防抖的内容");
  });
  it("源码编辑器失焦立即提交草稿，不等防抖", async () => {
    await mount("初始");
    await edit();
    const current = observed.editors.at(-1)!;
    await act(async () => {
      current.editor.setValue("失焦前的输入");
      current.props.onChange(current.editor, {}, "失焦前的输入");
      current.props.onBlur?.(current.editor, new FocusEvent("blur"));
    });
    expect(editor.children[1]).toMatchObject({ source: "失焦前的输入" });
  });
  it("外部更新取消尚未提交的本地草稿，避免迟到回写覆盖", async () => {
    await mount("初始");
    await edit();
    const current = observed.editors.at(-1)!;
    await act(async () => {
      current.editor.setValue("本地草稿");
      current.props.onChange(current.editor, {}, "本地草稿");
      Transforms.setNodes(editor, { source: "外部版本" } as never, { at: [1] });
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550));
    });
    expect(editor.children[1]).toMatchObject({ source: "外部版本" });
    expect(current.editor.getValue()).toBe("外部版本");
  });
});
