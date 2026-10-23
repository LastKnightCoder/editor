import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, Node, Transforms, type Descendant, type Editor } from "slate";
import { withHistory } from "slate-history";
import type { EditorKit, EditorRef } from "@tau/editor";
import type { ContextMenuItem } from "@tau/editor/api";

/** 顶层块下标 → 模拟 DOM；测量走 getBoundingClientRect */
const dom = vi.hoisted(() => ({ blocks: [] as HTMLElement[] }));

vi.mock("slate-react", async importOriginal => {
  const actual = await importOriginal<typeof import("slate-react")>();
  return {
    ...actual,
    ReactEditor: {
      ...actual.ReactEditor,
      toDOMNode: (editor: Editor, node: Node) => {
        const element = dom.blocks[editor.children.indexOf(node as Descendant)];
        if (!element) throw new Error("no dom");
        return element;
      },
    },
  };
});

const { copyNodeToClipboard } = vi.hoisted(() => ({
  copyNodeToClipboard: vi.fn(async (..._args: unknown[]) => true),
}));
/** 按元素类型给出块菜单（代替内核菜单聚合器） */
const menus = vi.hoisted(() => ({
  byType: {} as Record<string, (element: unknown) => ContextMenuItem[]>,
}));
vi.mock("@tau/editor/api", () => ({
  copyNodeToClipboard,
  createParagraph: () => ({ type: "paragraph", children: [{ type: "formatted", text: "" }] }),
  resolveElementMenu: (_kit: unknown, _editor: unknown, element: { type: string }) =>
    menus.byType[element.type]?.(element) ?? [],
}));

import { useToastStore } from "../../../../components/toast";
import { createControllerStub } from "../../__tests__/toolbarControllerStub";
import { BlockActionBar } from "../BlockActionBar";
import { BlockHandle } from "../BlockHandle";
import {
  HANDLE_DRAG_CANCEL_DISTANCE,
  HANDLE_DRAG_DELAY_MS,
  resolveHandleBlockIndex,
} from "../blockHandleState";
import { BlockSelectionHeader } from "../BlockSelectionHeader";
import { BlockSelectionLayer } from "../BlockSelectionLayer";

const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

function rectOf(top: number, height: number): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** 三个块：[0,30]、[40,100]、[120,150]，包裹元素顶边在 0 */
function setupBlocks(container: HTMLElement) {
  const layout = [rectOf(0, 30), rectOf(40, 60), rectOf(120, 30)];
  dom.blocks = layout.map(rect => {
    const element = document.createElement("div");
    element.style.lineHeight = "30px";
    element.getBoundingClientRect = () => rect;
    container.appendChild(element);
    return element;
  });
  container.getBoundingClientRect = () => rectOf(0, 150);
}

function createDoc(texts: string[]) {
  const editor = withHistory(createEditor());
  editor.children = texts.map(paragraph);
  return editor;
}

function editorRefOf(editor: Editor): RefObject<EditorRef | null> {
  const ref = createRef<EditorRef | null>() as { current: EditorRef | null };
  ref.current = {
    getEditor: () => editor,
    getEditableElement: () => null,
  } as unknown as EditorRef;
  return ref;
}

function buttonByLabel(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function buttonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find(
    button => button.textContent?.trim() === text
  );
}

/** motion 退场动画在 jsdom 中按真实时间播放，轮询等待最终状态 */
async function waitFor(check: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error("等待超时");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
}

const fakeKit = {} as EditorKit;

describe("块选择组件", () => {
  let host: HTMLDivElement;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    container = document.createElement("div");
    document.body.append(host, container);
    root = createRoot(host);
    setupBlocks(container);
    useToastStore.getState().clearAll();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--mobile-editor-toolbar-occlusion");
    copyNodeToClipboard.mockClear();
    menus.byType = {};
    vi.useRealTimers();
  });

  describe("BlockSelectionLayer", () => {
    function renderLayer(selected: number[], onToggle = vi.fn()) {
      const editor = createDoc(["A", "B", "C"]);
      act(() => {
        root.render(
          <BlockSelectionLayer
            editorRef={editorRefOf(editor)}
            container={container}
            active
            selected={selected}
            onToggle={onToggle}
            documentVersion={editor.children}
          />
        );
      });
      return onToggle;
    }

    function clickAt(clientY: number) {
      const hit = document.querySelector<HTMLElement>('[data-block-selection-hit="true"]');
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientY });
      act(() => {
        hit?.dispatchEvent(event);
      });
      return event;
    }

    it("按点击纵坐标切换所在块，块间空隙与外侧归最近的块，并阻止默认行为", () => {
      const onToggle = renderLayer([]);
      expect(clickAt(60).defaultPrevented).toBe(true);
      expect(onToggle).toHaveBeenLastCalledWith(1);
      clickAt(33);
      expect(onToggle).toHaveBeenLastCalledWith(0);
      clickAt(112);
      expect(onToggle).toHaveBeenLastCalledWith(2);
      clickAt(400);
      expect(onToggle).toHaveBeenLastCalledWith(2);
    });

    it("按下点击面不转移焦点；正文获得焦点时立即失焦并清除 DOM 选区", () => {
      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
      document.body.appendChild(editable);
      const editor = createDoc(["A"]);
      const ref = editorRefOf(editor) as { current: EditorRef | null };
      ref.current = { ...ref.current, getEditableElement: () => editable } as EditorRef;
      act(() => {
        root.render(
          <BlockSelectionLayer
            editorRef={ref}
            container={container}
            active
            selected={[]}
            onToggle={vi.fn()}
            documentVersion={editor.children}
          />
        );
      });
      const hit = document.querySelector<HTMLElement>('[data-block-selection-hit="true"]');
      for (const type of ["pointerdown", "mousedown"]) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        act(() => {
          hit?.dispatchEvent(event);
        });
        expect(event.defaultPrevented, type).toBe(true);
      }
      const removeAllRanges = vi.spyOn(window.getSelection()!, "removeAllRanges");
      act(() => {
        editable.focus();
      });
      expect(document.activeElement).not.toBe(editable);
      expect(removeAllRanges).toHaveBeenCalled();
      editable.remove();
    });

    it("选中块高亮并显示已选勾选圈，勾选圈与首行垂直居中", () => {
      renderLayer([1]);
      const highlights = document.querySelectorAll<HTMLElement>("[data-block-highlight]");
      expect(Array.from(highlights, element => element.dataset.blockHighlight)).toEqual(["1"]);
      expect(highlights[0].style.top).toBe("40px");
      expect(highlights[0].style.height).toBe("60px");
      const checks = document.querySelectorAll<HTMLElement>("[data-block-check]");
      expect(checks).toHaveLength(3);
      expect(checks[1].className).toContain("bg-accent");
      expect(checks[0].className).toContain("border-ink-3");
      expect(checks[1].style.top).toBe("45px");
    });

    it("未激活时不渲染", () => {
      const editor = createDoc(["A"]);
      act(() => {
        root.render(
          <BlockSelectionLayer
            editorRef={editorRefOf(editor)}
            container={container}
            active={false}
            selected={[]}
            onToggle={vi.fn()}
            documentVersion={editor.children}
          />
        );
      });
      expect(document.querySelector('[data-block-selection-hit="true"]')).toBeNull();
    });
  });

  describe("BlockActionBar", () => {
    function renderBar(editor: Editor, selected: number[], onOpenOutline?: () => void) {
      const selection = { selected, setSelected: vi.fn(), exit: vi.fn() };
      act(() => {
        root.render(
          <BlockActionBar
            editorRef={editorRefOf(editor)}
            kit={fakeKit}
            selection={selection}
            blockCount={editor.children.length}
            onOpenOutline={onOpenOutline}
          />
        );
      });
      return selection;
    }

    const texts = (editor: Editor) => editor.children.map(node => Node.string(node));
    const types = (editor: Editor) =>
      editor.children.map(node => (node as unknown as { type: string }).type);

    it("未选中时全部禁用", () => {
      renderBar(createDoc(["A", "B"]), []);
      for (const label of ["上移", "下移", "转换", "复制", "删除", "更多"]) {
        expect(buttonByLabel(label)?.disabled).toBe(true);
      }
    });

    it("按边界禁用上移 / 下移", () => {
      renderBar(createDoc(["A", "B", "C"]), [0, 1]);
      expect(buttonByLabel("上移")?.disabled).toBe(true);
      expect(buttonByLabel("下移")?.disabled).toBe(false);
      expect(buttonByLabel("转换")?.disabled).toBe(true);
      expect(buttonByLabel("更多")?.disabled).toBe(true);
    });

    it("下移后选中切到新下标", () => {
      const editor = createDoc(["A", "B", "C"]);
      const selection = renderBar(editor, [0, 1]);
      act(() => buttonByLabel("下移")?.click());
      expect(texts(editor)).toEqual(["C", "A", "B"]);
      expect(selection.setSelected).toHaveBeenCalledWith([1, 2]);
    });

    it("复制按文档顺序写剪贴板并保持选择", () => {
      const editor = createDoc(["A", "B", "C"]);
      const selection = renderBar(editor, [2, 0]);
      act(() => buttonByLabel("复制")?.click());
      expect(copyNodeToClipboard.mock.calls[0][1]).toEqual([
        editor.children[0],
        editor.children[2],
      ]);
      expect(selection.exit).not.toHaveBeenCalled();
    });

    it("删除后退出选择，toast「撤销」一次恢复", () => {
      const editor = createDoc(["A", "B", "C"]);
      const selection = renderBar(editor, [0, 2]);
      act(() => buttonByLabel("删除")?.click());
      expect(texts(editor)).toEqual(["B"]);
      expect(selection.exit).toHaveBeenCalledTimes(1);
      const message = useToastStore.getState().toasts.at(-1);
      expect(message?.text).toBe("已删除 2 个块");
      expect(message?.action?.label).toBe("撤销");
      act(() => message?.action?.onClick());
      expect(texts(editor)).toEqual(["A", "B", "C"]);
    });

    /** 段落的转换菜单：子项把元素（按引用定位）改成目标类型，并记录调用 */
    function installParagraphTransforms(editor: Editor, calls: string[]) {
      menus.byType.paragraph = element => [
        {
          key: "tau.transform",
          label: "转换成",
          children: ["header", "blockquote"].map(target => ({
            key: `to.${target}`,
            label: target === "header" ? "标题" : "引用",
            onSelect: () => {
              const index = editor.children.indexOf(element as Descendant);
              calls.push(`${target}@${index}`);
              Transforms.setNodes(editor, { type: target } as never, { at: [index] });
            },
          })),
        },
      ];
    }

    it("转换：无转换项的块禁用；单选列出子项，选择后执行并保持选择", async () => {
      const editor = createDoc(["A", "B"]);
      editor.children = [
        editor.children[0],
        { type: "image", children: [{ type: "formatted", text: "" }] } as unknown as Descendant,
      ];
      const calls: string[] = [];
      installParagraphTransforms(editor, calls);
      renderBar(editor, [1]);
      expect(buttonByLabel("转换")?.disabled).toBe(true);

      const selection = renderBar(editor, [0]);
      expect(buttonByLabel("转换")?.disabled).toBe(false);
      act(() => buttonByLabel("转换")?.click());
      expect(document.body.textContent).toContain("转换为");
      expect(buttonByText("标题")).toBeDefined();
      act(() => buttonByText("引用")?.click());
      await waitFor(() => calls.length > 0);
      expect(calls).toEqual(["blockquote@0"]);
      expect(selection.exit).not.toHaveBeenCalled();
      expect(selection.setSelected).not.toHaveBeenCalled();
    });

    it("转换：多选执行到每个块，合并为一个撤销步", async () => {
      const editor = createDoc(["A", "B", "C"]);
      const calls: string[] = [];
      installParagraphTransforms(editor, calls);
      renderBar(editor, [0, 2]);
      act(() => buttonByLabel("转换")?.click());
      act(() => buttonByText("标题")?.click());
      await waitFor(() => calls.length === 2);
      expect(types(editor)).toEqual(["header", "paragraph", "header"]);
      expect(editor.history.undos).toHaveLength(1);
      editor.undo();
      expect(types(editor)).toEqual(["paragraph", "paragraph", "paragraph"]);
    });

    function installImageMenu(calls: string[]) {
      const item = (key: string, label: string, extra: Partial<ContextMenuItem> = {}) => ({
        key,
        label,
        owner: "tau.image",
        onSelect: () => calls.push(key),
        ...extra,
      });
      menus.byType.image = () => [
        item("tau.image.crop", "裁剪"),
        item("tau.image.locked", "不可用", { disabled: true }),
        {
          key: "tau.image.align",
          label: "对齐",
          owner: "tau.image",
          children: [item("tau.image.align.left", "左对齐")],
        },
        item("acme.translate", "翻译", { owner: "acme" }),
        item("tau.transform", "转换成"),
        item("tau.block.move-up", "上移", { separator: true, owner: "tau.menu-defaults" }),
        item("tau.block.cut", "剪切", { owner: "tau.menu-defaults" }),
        item("tau.block.copy", "复制", { owner: "tau.menu-defaults" }),
        item("tau.image.clear", "清除图片", { danger: true }),
        item("tau.block.delete", "删除", { danger: true, owner: "tau.menu-defaults" }),
      ];
    }

    const imageDoc = () => {
      const editor = createDoc(["A", "B"]);
      editor.children = [
        editor.children[0],
        { type: "image", uuid: "img-1", children: [{ type: "formatted", text: "" }] },
        editor.children[1],
      ] as unknown as Descendant[];
      return editor;
    };

    const sheetLabels = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .filter(button => !button.closest('[data-block-action-bar="true"]'))
        .map(button => button.textContent?.trim());

    it("更多：多选禁用；单选按组列出完整菜单，排除操作栏项与禁用项，插件与危险项分组置后", () => {
      installImageMenu([]);
      const editor = imageDoc();
      renderBar(editor, [0, 1]);
      expect(buttonByLabel("更多")?.disabled).toBe(true);
      renderBar(editor, [1]);
      act(() => buttonByLabel("更多")?.click());
      expect(sheetLabels()).toEqual([
        "裁剪",
        "对齐",
        "剪切",
        "创建副本",
        "翻译插件 · acme",
        "清除图片",
        "取消",
      ]);
    });

    it("更多：有子项的项进入二级面板，选择后执行子项命令", async () => {
      const calls: string[] = [];
      installImageMenu(calls);
      renderBar(imageDoc(), [1]);
      act(() => buttonByLabel("更多")?.click());
      act(() => buttonByText("对齐")?.click());
      await waitFor(() => buttonByText("左对齐") !== undefined);
      act(() => buttonByText("左对齐")?.click());
      await waitFor(() => calls.length > 0);
      expect(calls).toEqual(["tau.image.align.left"]);
    });

    it("更多：创建副本在块后插入身份换新的副本，保持选择", async () => {
      installImageMenu([]);
      const editor = imageDoc();
      const selection = renderBar(editor, [1]);
      act(() => buttonByLabel("更多")?.click());
      act(() => buttonByText("创建副本")?.click());
      await waitFor(() => editor.children.length === 4);
      expect(types(editor)).toEqual(["paragraph", "image", "image", "paragraph"]);
      expect((editor.children[2] as unknown as { uuid: string }).uuid).not.toBe("img-1");
      expect(selection.exit).not.toHaveBeenCalled();
    });

    it("更多：传入 onOpenOutline 时出现「整理结构」，点击退出块选择并打开", async () => {
      installImageMenu([]);
      const onOpenOutline = vi.fn();
      const selection = renderBar(imageDoc(), [1], onOpenOutline);
      act(() => buttonByLabel("更多")?.click());
      expect(sheetLabels()).toContain("整理结构");
      act(() => buttonByText("整理结构")?.click());
      await waitFor(() => onOpenOutline.mock.calls.length > 0);
      expect(selection.exit).toHaveBeenCalledTimes(1);
      expect(onOpenOutline).toHaveBeenCalledTimes(1);
    });

    it("更多：剪切写剪贴板后删除该块并退出块选择", async () => {
      const calls: string[] = [];
      installImageMenu(calls);
      const editor = imageDoc();
      const selection = renderBar(editor, [1]);
      act(() => buttonByLabel("更多")?.click());
      act(() => buttonByText("剪切")?.click());
      await waitFor(() => editor.children.length === 2);
      expect(selection.exit).toHaveBeenCalledTimes(1);
      expect(copyNodeToClipboard).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([]);
      expect(types(editor)).toEqual(["paragraph", "paragraph"]);
    });

    it("挂载时写入遮挡留白，卸载时移除", () => {
      renderBar(createDoc(["A"]), [0]);
      const style = document.documentElement.style;
      expect(style.getPropertyValue("--mobile-editor-toolbar-occlusion")).toContain("67px");
      act(() => root.render(null));
      expect(style.getPropertyValue("--mobile-editor-toolbar-occlusion")).toBe("");
    });
  });

  describe("BlockSelectionHeader", () => {
    it("显示已选数量，全选与取消全选切换", () => {
      const props = { onCancel: vi.fn(), onSelectAll: vi.fn(), onDeselectAll: vi.fn() };
      act(() => {
        root.render(<BlockSelectionHeader selectedCount={0} totalCount={3} {...props} />);
      });
      expect(document.body.textContent).toContain("选择块");
      act(() => buttonByText("全选")?.click());
      expect(props.onSelectAll).toHaveBeenCalled();

      act(() => {
        root.render(<BlockSelectionHeader selectedCount={3} totalCount={3} {...props} />);
      });
      expect(document.body.textContent).toContain("已选 3 个块");
      act(() => buttonByText("取消全选")?.click());
      expect(props.onDeselectAll).toHaveBeenCalled();
      act(() => buttonByText("取消")?.click());
      expect(props.onCancel).toHaveBeenCalled();
    });
  });

  describe("BlockHandle", () => {
    it("显示条件：编辑态、聚焦、通用或格式模式、无面板", () => {
      const editor = createDoc(["A", "B", "C"]);
      editor.selection = {
        anchor: { path: [1, 0], offset: 0 },
        focus: { path: [1, 0], offset: 0 },
      };
      const controller = createControllerStub();
      expect(resolveHandleBlockIndex(editor, true, controller)).toBe(1);
      expect(
        resolveHandleBlockIndex(editor, true, {
          ...controller,
          editingContext: { kind: "selection" },
        })
      ).toBe(1);
      expect(resolveHandleBlockIndex(editor, false, controller)).toBeNull();
      expect(
        resolveHandleBlockIndex(editor, true, { ...controller, isEditorFocused: false })
      ).toBeNull();
      expect(
        resolveHandleBlockIndex(editor, true, { ...controller, activePanel: "style" })
      ).toBeNull();
      expect(
        resolveHandleBlockIndex(editor, true, { ...controller, isTableMenuOpen: true })
      ).toBeNull();
      expect(
        resolveHandleBlockIndex(editor, true, {
          ...controller,
          editingContext: {
            kind: "table",
            tablePath: [1],
            row: 0,
            col: 0,
            rowCount: 1,
            colCount: 1,
          },
        })
      ).toBeNull();
      editor.selection = null;
      expect(resolveHandleBlockIndex(editor, true, controller)).toBeNull();
    });

    function renderHandle(blockIndex: number | null, onEnter = vi.fn(), onDragStart = vi.fn()) {
      const editor = createDoc(["A", "B", "C"]);
      act(() => {
        root.render(
          <BlockHandle
            editorRef={editorRefOf(editor)}
            container={container}
            blockIndex={blockIndex}
            onEnter={onEnter}
            onDragStart={onDragStart}
            version={editor.children}
          />
        );
      });
      return onEnter;
    }

    function pointerOn(target: Element, type: string, clientX: number, clientY: number) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientX, clientY, pointerId: 7 });
      act(() => {
        target.dispatchEvent(event);
      });
    }

    it("位于光标所在块首行左侧，点击进入块选择", () => {
      const onEnter = renderHandle(1);
      const handle = buttonByLabel("选择块");
      // 首行 40 + (30 - 26) / 2 = 42，热区上移 7
      expect(handle?.style.top).toBe("35px");
      act(() => handle?.click());
      expect(onEnter).toHaveBeenCalledWith(1);
    });

    it("blockIndex 为 null 时不显示", () => {
      renderHandle(null);
      expect(buttonByLabel("选择块")).toBeNull();
    });

    it("长按 300ms 提起拖拽（带最近的指针位置与把手元素），松手后的点击不进入块选择", () => {
      vi.useFakeTimers();
      const onEnter = vi.fn();
      const onDragStart = vi.fn();
      renderHandle(2, onEnter, onDragStart);
      const handle = buttonByLabel("选择块")!;
      pointerOn(handle, "pointerdown", 10, 100);
      pointerOn(handle, "pointermove", 12, 104);
      act(() => {
        vi.advanceTimersByTime(HANDLE_DRAG_DELAY_MS - 1);
      });
      expect(onDragStart).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDragStart).toHaveBeenCalledTimes(1);
      expect(onDragStart).toHaveBeenCalledWith(2, {
        clientX: 12,
        clientY: 104,
        pointerId: 7,
        target: handle,
      });
      pointerOn(handle, "pointerup", 12, 104);
      act(() => handle.click());
      expect(onEnter).not.toHaveBeenCalled();
    });

    it("长按期间移动超过 8px 取消：不拖拽，也不进入块选择", () => {
      vi.useFakeTimers();
      const onEnter = vi.fn();
      const onDragStart = vi.fn();
      renderHandle(1, onEnter, onDragStart);
      const handle = buttonByLabel("选择块")!;
      pointerOn(handle, "pointerdown", 10, 100);
      pointerOn(handle, "pointermove", 10, 100 + HANDLE_DRAG_CANCEL_DISTANCE + 1);
      act(() => {
        vi.advanceTimersByTime(HANDLE_DRAG_DELAY_MS);
      });
      expect(onDragStart).not.toHaveBeenCalled();
      act(() => handle.click());
      expect(onEnter).not.toHaveBeenCalled();
      // 下一次按下重新计算
      pointerOn(handle, "pointerdown", 10, 100);
      pointerOn(handle, "pointerup", 10, 100);
      act(() => handle.click());
      expect(onEnter).toHaveBeenCalledWith(1);
    });
  });
});
