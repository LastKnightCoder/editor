import { act, type ReactNode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";
import { Node as SlateNode, Transforms, createEditor, type Descendant, type Editor } from "slate";
import { ReactEditor } from "slate-react";

const reservation = vi.hoisted(() => ({
  reserve: vi.fn(),
  releaseWhenKeyboardShown: vi.fn(),
  releaseNow: vi.fn(),
}));
vi.mock("../../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../../components/KeyboardViewportProvider")>()),
  useKeyboardReservation: () => reservation,
}));

const caretMock = vi.hoisted(() => vi.fn());
vi.mock("../caretFromPoint", () => ({ caretFromPoint: caretMock }));

import {
  useMobileEditorToolbarController,
  type MobileEditorToolbarController,
} from "../../editorToolbar/useMobileEditorToolbarController";
import { useReadingMode, type ReadingModeState } from "../useReadingMode";

type Latest = { reading: ReadingModeState; controller: MobileEditorToolbarController };

function createDocEditor(): Editor {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "hello world" }] },
    {
      type: "check-list",
      children: [
        {
          type: "check-list-item",
          checked: false,
          children: [{ type: "paragraph", children: [{ type: "formatted", text: "待办" }] }],
        },
      ],
    },
  ] as unknown as Descendant[];
  return editor;
}

function createEditorRef(editor: Editor) {
  const focus = vi.fn(() => {
    Transforms.select(editor, { path: [0, 0], offset: 11 });
  });
  const ref: RefObject<EditorRef | null> = {
    current: {
      focus,
      deselect: vi.fn(),
      getEditor: () => editor,
      getEditableElement: () => null,
      isFocus: () => false,
    },
  };
  return { ref, focus };
}

function Probe(props: {
  editorRef: RefObject<EditorRef | null>;
  forcedReadonly: boolean;
  initialEditing: boolean | null;
  latest: { current: Latest | null };
  children?: ReactNode;
}) {
  const controller = useMobileEditorToolbarController({ editorRef: props.editorRef });
  const reading = useReadingMode({
    editorRef: props.editorRef,
    forcedReadonly: props.forcedReadonly,
    initialEditing: props.initialEditing,
    toolbarController: controller,
  });
  props.latest.current = { reading, controller };
  return (
    <div data-testid="surface" {...reading.readingSurfaceProps}>
      {props.children}
    </div>
  );
}

describe("useReadingMode", () => {
  let host: HTMLDivElement;
  let root: Root;
  let now = 0;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(ReactEditor, "focus").mockImplementation(() => undefined);
    vi.spyOn(ReactEditor, "isFocused").mockReturnValue(false);
    vi.spyOn(ReactEditor, "blur").mockImplementation(() => undefined);
    caretMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function setup(
    options: {
      forcedReadonly?: boolean;
      initialEditing?: boolean | null;
      children?: ReactNode;
    } = {}
  ) {
    const editor = createDocEditor();
    const { ref, focus } = createEditorRef(editor);
    const latest: { current: Latest | null } = { current: null };
    const render = (next: { forcedReadonly?: boolean; initialEditing?: boolean | null } = {}) => {
      act(() => {
        root.render(
          <Probe
            editorRef={ref}
            forcedReadonly={next.forcedReadonly ?? options.forcedReadonly ?? false}
            initialEditing={
              next.initialEditing !== undefined
                ? next.initialEditing
                : options.initialEditing === undefined
                  ? false
                  : options.initialEditing
            }
            latest={latest}
          >
            {options.children}
          </Probe>
        );
      });
    };
    render();
    const get = () => {
      if (!latest.current) throw new Error("未渲染");
      return latest.current;
    };
    return { editor, focus, render, get };
  }

  function pointerUp(target: Element, x: number, y: number) {
    act(() => {
      target.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
    });
  }

  it("默认阅读态；「编辑」无上次选区时光标到文末", () => {
    const { get, focus, editor } = setup();
    expect(get().reading.editing).toBe(false);
    expect(get().reading.canEdit).toBe(true);

    act(() => get().reading.enterEditing());
    expect(get().reading.editing).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 11 });
  });

  it("退出编辑保存选区并清除；再次「编辑」回到上次选区", () => {
    const { get, focus, editor } = setup();
    act(() => get().reading.enterEditing());
    Transforms.select(editor, { path: [0, 0], offset: 3 });

    act(() => get().reading.exitEditing());
    expect(get().reading.editing).toBe(false);
    expect(editor.selection).toBeNull();
    expect(reservation.releaseNow).toHaveBeenCalled();

    focus.mockClear();
    act(() => get().reading.enterEditing());
    expect(focus).not.toHaveBeenCalled();
    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 3 });
  });

  it("上次选区失效时回退到文末", () => {
    const { get, focus, editor } = setup();
    act(() => get().reading.enterEditing());
    Transforms.select(editor, { path: [0, 0], offset: 8 });
    act(() => get().reading.exitEditing());
    editor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "hi" }] },
    ] as unknown as Descendant[];
    focus.mockImplementation(() => {
      Transforms.select(editor, { path: [0, 0], offset: 2 });
    });
    focus.mockClear();
    act(() => get().reading.enterEditing());
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("配件栏「收起键盘」（controller.exitEditing）回到阅读态并保存选区", () => {
    const { get, editor } = setup();
    act(() => get().reading.enterEditing());
    Transforms.select(editor, { path: [0, 0], offset: 5 });

    act(() => get().controller.exitEditing());
    expect(get().reading.editing).toBe(false);
    expect(editor.selection).toBeNull();

    act(() => get().reading.enterEditing());
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 5 });
  });

  it("强制只读：编辑中切换即回阅读态且不聚焦；不可进入编辑", () => {
    const { get, render, focus, editor } = setup();
    act(() => get().reading.enterEditing());
    Transforms.select(editor, { path: [0, 0], offset: 2 });
    focus.mockClear();
    vi.mocked(ReactEditor.focus).mockClear();

    render({ forcedReadonly: true });
    expect(get().reading.editing).toBe(false);
    expect(get().reading.canEdit).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(ReactEditor.focus).not.toHaveBeenCalled();

    act(() => get().reading.enterEditing());
    expect(get().reading.editing).toBe(false);

    render({ forcedReadonly: false });
    expect(get().reading.editing).toBe(false);
  });

  it("enterEditingWithSelection 同步进入编辑、选中 range 并聚焦；强制只读时无操作", () => {
    const { get, render, focus, editor } = setup();
    const range = { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 7 } };
    act(() => {
      get().reading.enterEditingWithSelection(range);
      // 同一事件内选区已就绪，可直接执行配件栏操作
      expect(editor.selection).toEqual(range);
    });
    expect(get().reading.editing).toBe(true);
    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();

    act(() => get().reading.exitEditing());
    render({ forcedReadonly: true });
    vi.mocked(ReactEditor.focus).mockClear();
    act(() => get().reading.enterEditingWithSelection(range));
    expect(get().reading.editing).toBe(false);
    expect(editor.selection).toBeNull();
    expect(ReactEditor.focus).not.toHaveBeenCalled();
  });

  it("initialEditing 首次非 null 时只采用一次，true 时自动聚焦", () => {
    const { get, render, focus } = setup({ initialEditing: null });
    expect(get().reading.editing).toBe(false);

    render({ initialEditing: true });
    expect(get().reading.editing).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);

    act(() => get().reading.exitEditing());
    render({ initialEditing: false });
    render({ initialEditing: true });
    expect(get().reading.editing).toBe(false);
  });

  describe("双击进入编辑", () => {
    function setupWithText() {
      const ctx = setup({
        children: (
          <>
            <p data-testid="text">hello world</p>
            <a data-testid="link" href="#x">
              链接
            </a>
          </>
        ),
      });
      const text = document.querySelector('[data-testid="text"]');
      if (!text) throw new Error("未渲染");
      caretMock.mockReturnValue({ node: text.firstChild, offset: 4 });
      vi.spyOn(ReactEditor, "toSlatePoint").mockReturnValue({ path: [0, 0], offset: 4 });
      return { ...ctx, text };
    }

    it("300ms 内、位移小于 24px 的两次抬起进入编辑，光标落在双击处", () => {
      const { get, text, editor } = setupWithText();
      pointerUp(text, 100, 100);
      expect(get().reading.editing).toBe(false);
      now += 200;
      pointerUp(text, 110, 105);
      expect(get().reading.editing).toBe(true);
      expect(caretMock).toHaveBeenCalledWith(110, 105);
      expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 4 });
      expect(ReactEditor.focus).toHaveBeenCalled();
    });

    it("间隔超过 300ms 不触发", () => {
      const { get, text } = setupWithText();
      pointerUp(text, 100, 100);
      now += 350;
      pointerUp(text, 100, 100);
      expect(get().reading.editing).toBe(false);
    });

    it("位移达到 24px 不触发", () => {
      const { get, text } = setupWithText();
      pointerUp(text, 100, 100);
      now += 100;
      pointerUp(text, 124, 100);
      expect(get().reading.editing).toBe(false);
    });

    it("落在交互元素上不触发", () => {
      const { get } = setupWithText();
      const link = document.querySelector('[data-testid="link"]');
      if (!link) throw new Error("未渲染");
      pointerUp(link, 100, 100);
      now += 100;
      pointerUp(link, 100, 100);
      expect(get().reading.editing).toBe(false);
    });

    it("取不到光标点时退回「编辑」逻辑", () => {
      const { get, text, focus } = setupWithText();
      caretMock.mockReturnValue(null);
      pointerUp(text, 100, 100);
      now += 100;
      pointerUp(text, 100, 100);
      expect(get().reading.editing).toBe(true);
      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  describe("阅读态勾选待办", () => {
    function setupWithCheckbox(forcedReadonly = false) {
      const ctx = setup({
        forcedReadonly,
        children: (
          <div data-check-list-item>
            <li data-testid="item">
              <div data-testid="checkbox">
                <svg data-testid="checkbox-svg" />
              </div>
              <div>待办</div>
            </li>
          </div>
        ),
      });
      vi.spyOn(ReactEditor, "toSlateNode").mockImplementation(() =>
        SlateNode.get(ctx.editor, [1, 0])
      );
      vi.spyOn(ReactEditor, "findPath").mockReturnValue([1, 0]);
      return ctx;
    }

    function click(testId: string) {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!target) throw new Error("未渲染");
      act(() => {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    }

    it("点勾选框切换 checked", () => {
      const { editor } = setupWithCheckbox();
      click("checkbox-svg");
      expect(SlateNode.get(editor, [1, 0])).toMatchObject({ checked: true });
      click("checkbox");
      expect(SlateNode.get(editor, [1, 0])).toMatchObject({ checked: false });
    });

    it("点待办正文不切换", () => {
      const { editor } = setupWithCheckbox();
      const item = document.querySelector('[data-testid="item"] > div:last-child');
      act(() => {
        item?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      expect(SlateNode.get(editor, [1, 0])).toMatchObject({ checked: false });
    });

    it("强制只读时不切换", () => {
      const { editor } = setupWithCheckbox(true);
      click("checkbox");
      expect(SlateNode.get(editor, [1, 0])).toMatchObject({ checked: false });
    });

    it("编辑态交给编辑器自身处理", () => {
      const { editor, get } = setupWithCheckbox();
      act(() => get().reading.enterEditing());
      click("checkbox");
      expect(SlateNode.get(editor, [1, 0])).toMatchObject({ checked: false });
    });
  });
});
