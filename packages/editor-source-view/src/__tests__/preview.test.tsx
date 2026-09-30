import React, { act, createRef, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots, IEditorSlots } from "@tau/editor/src/services";
import {
  defineExtension,
  defineElement,
  focusNextBlock,
  focusPreviousBlock,
  type ElementRenderProps,
} from "@tau/editor/api";
import { PreviewWithEditor } from "../index";
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
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
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
    const current = observed.editors[0];
    await act(async () => {
      current.editor.setValue(source);
      current.props.onChange(current.editor, {}, source);
      await new Promise(resolve => setTimeout(resolve, 550));
    });
  };
  it("编辑回写与外部更新保持同步，服务派生不重装预览菜单", async () => {
    const kit = await mount("初始");
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
    const current = observed.editors[0];
    await act(async () => {
      expect(focusNextBlock(editor, [0], { reason: "arrow", direction: "forward" })).toBe(true);
    });
    expect(current.editor.focus).toHaveBeenCalled();
    expect(current.editor.getCursor()).toEqual({ line: 0, ch: 0 });
    await act(async () => current.props.onKeyDown!(current.editor, keyEvent("ArrowUp")));
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    current.editor.getDoc().setCursor({ line: 0, ch: 1 });
    await act(async () => current.props.onKeyDown!(current.editor, keyEvent("ArrowDown")));
    expect(editor.selection?.anchor.path).toEqual([2, 0]);
    await act(async () => {
      expect(focusPreviousBlock(editor, [2], { reason: "arrow", direction: "backward" })).toBe(
        true
      );
    });
    expect(current.editor.getCursor()).toEqual({ line: 0, ch: 1 });
  });
  it("空源码退格补回可编辑段落，全屏预览关闭保留已保存内容", async () => {
    await mount("内容");
    await act(async () => {
      expect(
        editor.commands?.execute(
          "tau.preview.fullscreen",
          undefined,
          editor.children[1] as never,
          [1]
        )
      ).toBe(true);
    });
    const overlay = document.querySelector("div.fixed.inset-0") as HTMLDivElement;
    expect(overlay).toBeTruthy();
    await changeSource("保存后的内容");
    await act(async () => overlay.click());
    expect(document.querySelector("div.fixed.inset-0")).toBeNull();
    expect(editor.children[1]).toMatchObject({ source: "保存后的内容" });
    const current = observed.editors[0];
    current.editor.setValue("");
    await act(async () => current.props.onKeyDown!(current.editor, keyEvent("Backspace")));
    expect(editor.children[1]).toMatchObject({ type: "paragraph" });
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });
});
