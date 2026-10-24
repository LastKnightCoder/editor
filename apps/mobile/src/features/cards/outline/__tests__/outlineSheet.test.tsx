import { act, forwardRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Node, type Descendant, type Editor } from "slate";
import { withHistory } from "slate-history";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorRef } from "@tau/editor";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast }));
vi.mock("../../../../components/SnapSheet", () => ({
  SnapSheet: Object.assign(
    ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div data-testid="sheet">{children}</div> : null,
    {
      Handle: () => null,
      Scroll: forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
        ({ children }, ref) => (
          <div ref={ref} data-testid="scroll">
            {children}
          </div>
        )
      ),
    }
  ),
}));

import { OutlineSheet } from "../OutlineSheet";

const ROW_HEIGHT = 46;
const text = (value: string) => [{ type: "formatted", text: value }];
const paragraph = (value: string) =>
  ({ type: "paragraph", children: text(value) }) as unknown as Descendant;
const header = (level: number, value: string) =>
  ({ type: "header", level, children: text(value) }) as unknown as Descendant;

function createDoc(children: Descendant[]) {
  const editor = withHistory(createEditor());
  editor.normalizeNode = () => {};
  editor.children = children;
  return editor;
}

const texts = (editor: Editor) => editor.children.map(node => Node.string(node));

function pointer(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientY, pointerId: 1, button: 0 });
  return event;
}

describe("OutlineSheet", () => {
  let host: HTMLDivElement;
  let root: Root;
  let editor: Editor;
  const onClose = vi.fn();
  const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");

  beforeEach(() => {
    toast.mockClear();
    onClose.mockClear();
    // 行按 DOM 顺序紧挨排列，其余元素视为 800 高的可视区
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this.dataset.outlineRow !== undefined) {
        const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
        return { top: index * ROW_HEIGHT, height: ROW_HEIGHT, bottom: 0 } as DOMRect;
      }
      return { top: 0, bottom: 800, height: 800 } as DOMRect;
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(children: Descendant[]) {
    editor = createDoc(children);
    const editorRef = { current: { getEditor: () => editor } as unknown as EditorRef };
    act(() => root.render(<OutlineSheet open editorRef={editorRef} onClose={onClose} />));
  }

  const rowLabels = () =>
    Array.from(host.querySelectorAll<HTMLElement>("[data-outline-row]")).map(
      row => row.querySelector(".truncate")?.textContent
    );
  const clickText = (label: string) => {
    const button = Array.from(host.querySelectorAll("button")).find(
      item => item.textContent === label
    );
    act(() => button?.click());
  };
  const drag = (row: number, deltaY: number) => {
    const grip = host.querySelectorAll<HTMLElement>('[aria-label="拖动排序"]')[row];
    const startY = row * ROW_HEIGHT + 23;
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", startY));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", startY + deltaY));
    });
    act(() => {
      window.dispatchEvent(pointer("pointerup", startY + deltaY));
    });
  };

  const sectionDoc = () => [
    header(1, "标题甲"),
    paragraph("甲一"),
    header(2, "小节乙"),
    paragraph("乙一"),
    paragraph("乙二"),
    header(1, "标题丙"),
  ];

  it("每块一行，标题加粗并按级别缩进", () => {
    render(sectionDoc());
    expect(rowLabels()).toEqual(["标题甲", "甲一", "小节乙", "乙一", "乙二", "标题丙"]);
    const rows = host.querySelectorAll<HTMLElement>("[data-outline-row]");
    expect(rows[2].className).toContain("font-bold");
    expect(rows[2].style.paddingLeft).toBe("22px");
    expect(rows[1].className).not.toContain("font-bold");
  });

  it("折叠标题隐藏节内行并显示计数，再点展开", () => {
    render(sectionDoc());
    const toggles = () => host.querySelectorAll<HTMLButtonElement>('[aria-label="折叠"]');
    // 标题丙没有子内容，不可折叠
    expect(toggles()).toHaveLength(2);
    act(() => toggles()[1].click());
    expect(rowLabels()).toEqual(["标题甲", "甲一", "小节乙", "标题丙"]);
    expect(host.textContent).toContain("含 2 个块");
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="展开"]')?.click());
    expect(rowLabels()).toHaveLength(6);
  });

  it("全部折叠 / 全部展开", () => {
    render(sectionDoc());
    clickText("全部折叠");
    expect(rowLabels()).toEqual(["标题甲", "标题丙"]);
    expect(host.textContent).toContain("含 4 个块");
    clickText("全部展开");
    expect(rowLabels()).toHaveLength(6);
  });

  it("没有可折叠标题时不显示全部折叠", () => {
    render([paragraph("A"), paragraph("B")]);
    expect(host.textContent).not.toContain("全部折叠");
  });

  it("拖动折叠的整节后完成，作为一个撤销步写入", () => {
    render(sectionDoc());
    clickText("全部折叠");
    // 把「标题丙」拖到「标题甲」之前
    drag(1, -ROW_HEIGHT);
    clickText("全部展开");
    expect(rowLabels()).toEqual(["标题丙", "标题甲", "甲一", "小节乙", "乙一", "乙二"]);
    expect(texts(editor)[0]).toBe("标题甲");
    clickText("完成");
    expect(texts(editor)).toEqual(["标题丙", "标题甲", "甲一", "小节乙", "乙一", "乙二"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    editor.undo();
    expect(texts(editor)).toEqual(["标题甲", "甲一", "小节乙", "乙一", "乙二", "标题丙"]);
  });

  it("拖动中被拖行提起，其余行让位", () => {
    render([paragraph("A"), paragraph("B"), paragraph("C")]);
    const grip = host.querySelectorAll<HTMLElement>('[aria-label="拖动排序"]')[0];
    act(() => {
      grip.dispatchEvent(pointer("pointerdown", 23));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", 23 + 50));
    });
    const rows = host.querySelectorAll<HTMLElement>("[data-outline-row]");
    expect(rows[0].className).toContain("shadow-float");
    expect(rows[0].style.transform).toBe("translateY(50px)");
    expect(rows[1].style.transform).toBe("translateY(-46px)");
    expect(rows[2].style.transform).toBe("");
    act(() => {
      window.dispatchEvent(pointer("pointercancel", 73));
    });
    expect(rowLabels()).toEqual(["A", "B", "C"]);
  });

  it("取消丢弃改动", () => {
    render([paragraph("A"), paragraph("B"), paragraph("C")]);
    drag(0, ROW_HEIGHT * 2 + 5);
    expect(rowLabels()).toEqual(["B", "C", "A"]);
    clickText("取消");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(texts(editor)).toEqual(["A", "B", "C"]);
  });

  it("顶栏用页面顶栏：带状态栏安全区，标题与取消 / 完成同页面规格", () => {
    render([paragraph("A")]);
    const header = document.querySelector("header.mobile-topbar");
    expect(header).not.toBeNull();
    expect(header?.querySelector("h1")?.textContent).toBe("整理结构");
  });

  it("未改动时完成等同关闭", () => {
    render([paragraph("A"), paragraph("B")]);
    clickText("完成");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editor.history.undos).toHaveLength(0);
  });

  it("打开期间块数被外部改动时提示且不应用", () => {
    render([paragraph("A"), paragraph("B")]);
    drag(0, ROW_HEIGHT);
    editor.children = [...editor.children, paragraph("C")];
    clickText("完成");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ text: "内容已变化，请重新整理" }));
    expect(texts(editor)).toEqual(["A", "B", "C"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
