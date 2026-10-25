import React, {
  Activity,
  act,
  createRef,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, defaultMenuExtension, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import {
  IEditorInteraction,
  defineExtension,
  defineElement,
  focusNextBlock,
  focusPreviousBlock,
  type ElementRenderProps,
} from "@tau/editor/api";
import { PreviewWithEditor } from "../index";
import { Code2 } from "lucide-react";
import { previewMenuExtension } from "../../menu";

vi.mock("../overlay/shikiHighlighter", () => ({
  renderCodeWithShiki: vi.fn(async (code: string) => code),
  resolveShikiLanguage: vi.fn((language: string) => language),
}));

type PreviewElement = { type: "test-preview"; source: string; children: Descendant[] };
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "test-preview": PreviewElement;
  }
}
const PreviewBlock = ({
  attributes,
  element,
  children,
  inPlace,
}: ElementRenderProps<PreviewElement> & { inPlace?: boolean }) => {
  const editor = useSlateStatic();
  return (
    <div {...attributes}>
      <PreviewWithEditor
        title="源码"
        icon={Code2}
        element={element as never}
        mode="javascript"
        initValue={element.source}
        inPlace={inPlace}
        delimiters={inPlace ? "$$" : undefined}
        immediate={inPlace}
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
const createFixture = (inPlace = false) =>
  defineExtension({
    id: inPlace ? "test.preview-in-place" : "test.preview",
    elements: [
      defineElement<PreviewElement>({
        type: "test-preview",
        kind: "block",
        isVoid: true,
        render: props => <PreviewBlock {...props} inPlace={inPlace} />,
      }),
    ],
  });
const fixture = createFixture();
const inPlaceFixture = createFixture(true);
const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const keyEvent = (key: "ArrowUp" | "ArrowDown" | "Backspace") => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  const code = { ArrowUp: 38, ArrowDown: 40, Backspace: 8 }[key];
  Object.defineProperties(event, { which: { value: code }, keyCode: { value: code } });
  return event;
};

describe("源码预览迁包后的行为", () => {
  let root: Root;
  let host: HTMLDivElement;
  let editor: SlateEditor;
  const outerInput = vi.fn();
  const outerKey = vi.fn();
  const outerPaste = vi.fn();
  function Visibility({ children }: { children: ReactNode }) {
    const [hidden] = useState(false);
    return (
      <div
        onInput={outerInput}
        onKeyDown={outerKey}
        onPaste={outerPaste}
        style={hidden ? { display: "none" } : undefined}
      >
        <Activity mode={hidden ? "hidden" : "visible"}>{children}</Activity>
      </div>
    );
  }
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    outerInput.mockClear();
    outerKey.mockClear();
    outerPaste.mockClear();
  });
  const mount = async (source: string, touch = false, inPlace = false) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [
        previewMenuExtension,
        inPlace ? inPlaceFixture : fixture,
        ...(touch ? [defaultMenuExtension] : []),
      ],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          if (touch) register(IEditorInteraction, { touch: true });
        },
      ],
    });
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Visibility>
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
          </Visibility>
        </DndProvider>
      )
    );
    editor = ref.current!.getEditor();
    return kit;
  };
  const textarea = () => host.querySelector<HTMLTextAreaElement>(".ed-preview-source textarea");
  /** 以原生输入的方式改源码；wait 为真时等过 500ms 的写回防抖 */
  const typeSource = async (source: string, wait = true) => {
    await act(async () => {
      const input = textarea()!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        input,
        source
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (wait) await new Promise(resolve => setTimeout(resolve, 550));
    });
  };
  const press = async (key: "ArrowUp" | "ArrowDown" | "Backspace") => {
    await act(async () => {
      textarea()!.dispatchEvent(keyEvent(key));
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
  it("原位模式在触摸策略下保留实时预览并立即回写", async () => {
    await mount("初始", true, true);
    await edit();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector(".ed-preview-source--in-place textarea")).toBeTruthy();
    expect(host.querySelector("output")?.textContent).toBe("初始");
    expect(host.textContent?.match(/\$\$/g)).toHaveLength(2);
    await typeSource("更新", false);
    expect((editor.children[1] as PreviewElement).source).toBe("更新");
    expect(host.querySelector("output")?.textContent).toBe("更新");
  });
  it.each([" ", "Enter"])("选中原位块后按 %s 进入源码编辑", async key => {
    await mount("初始", false, true);
    await act(async () => {
      Transforms.select(editor, [1]);
      ReactEditor.focus(editor as ReactEditor);
      ReactEditor.toDOMNode(editor as ReactEditor, editor).dispatchEvent(
        new FocusEvent("focus", { bubbles: true })
      );
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );
    });
    expect(textarea()).toBeTruthy();
  });
  it("编辑回写与外部更新保持同步，服务派生不重装预览菜单", async () => {
    const kit = await mount("初始");
    expect(textarea()).toBeNull();
    await edit();
    await typeSource("编辑");
    expect(editor.children[1]).toMatchObject({ source: "编辑" });
    await act(async () => Transforms.setNodes(editor, { source: "外部" } as never, { at: [1] }));
    expect(textarea()?.value).toBe("外部");
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
    expect(document.activeElement).toBe(textarea());
    expect(textarea()?.selectionStart).toBe(0);
    await press("ArrowUp");
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    expect(textarea()).toBeNull();
    await act(async () => {
      expect(focusPreviousBlock(editor, [2], { reason: "arrow", direction: "backward" })).toBe(
        true
      );
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(textarea()?.selectionStart).toBe(1);
    await press("ArrowDown");
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
    await typeSource("", false);
    await press("Backspace");
    expect(editor.children[1]).toMatchObject({ type: "paragraph" });
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });
  it("输入后立即完成会提交草稿并释放编辑器，重新打开不丢字", async () => {
    await mount("初始");
    await edit();
    await typeSource("未等防抖的内容", false);
    await act(async () => {
      Array.from(host.querySelectorAll("button"))
        .find(button => button.textContent?.includes("完成"))!
        .click();
    });
    expect(editor.children[1]).toMatchObject({ source: "未等防抖的内容" });
    expect(textarea()).toBeNull();
    await edit();
    expect(textarea()?.value).toBe("未等防抖的内容");
  });
  it("源码编辑器失焦立即提交草稿，不等防抖", async () => {
    await mount("初始");
    await edit();
    await typeSource("失焦前的输入", false);
    await act(async () => {
      textarea()!.focus();
      textarea()!.blur();
    });
    expect(editor.children[1]).toMatchObject({ source: "失焦前的输入" });
  });
  it("外部更新取消尚未提交的本地草稿，避免迟到回写覆盖", async () => {
    await mount("初始");
    await edit();
    await typeSource("本地草稿", false);
    await act(async () => {
      Transforms.setNodes(editor, { source: "外部版本" } as never, { at: [1] });
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550));
    });
    expect(editor.children[1]).toMatchObject({ source: "外部版本" });
    expect(textarea()?.value).toBe("外部版本");
  });
  it("块内编辑沿用代码块的成对括号与缩进", async () => {
    await mount("");
    await edit();
    const input = textarea()!;
    await act(async () => {
      input.setSelectionRange(0, 0);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "(", bubbles: true, cancelable: true })
      );
      await Promise.resolve();
    });
    expect(textarea()?.value).toBe("()");
    expect(textarea()?.selectionStart).toBe(1);
  });
});
