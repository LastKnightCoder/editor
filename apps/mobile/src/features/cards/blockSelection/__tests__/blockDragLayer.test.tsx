import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockDragLayer } from "../BlockDragLayer";
import {
  cloneBlockForDrag,
  fillBlockRects,
  resolveDropLineTop,
  type BlockDragState,
} from "../blockDrag";

/** 三个块：[0,30]、[40,100]、[120,150] */
const RECTS = [
  { top: 0, height: 30 },
  { top: 40, height: 60 },
  { top: 120, height: 30 },
];

function createBlockDom() {
  const block = document.createElement("div");
  block.setAttribute("data-slate-node", "element");
  block.id = "block-1";
  block.innerHTML =
    '<span data-slate-node="text"><span data-slate-leaf="true" contenteditable="false">第二段</span></span>';
  document.body.appendChild(block);
  return block;
}

describe("blockDrag 工具", () => {
  it("测量失败的块按前一块底边记为零高度", () => {
    expect(fillBlockRects([null, { top: 10, height: 20, lineHeight: 30 }, null])).toEqual([
      { top: 0, height: 0 },
      { top: 10, height: 20 },
      { top: 30, height: 0 },
    ]);
  });

  it("插入线：上移插到块 to 之前，下移插到块 to + 1 之前，末尾在最后一块下方", () => {
    expect(resolveDropLineTop(RECTS, 2, 0)).toBe(-3);
    expect(resolveDropLineTop(RECTS, 2, 1)).toBe(37);
    expect(resolveDropLineTop(RECTS, 0, 1)).toBe(117);
    expect(resolveDropLineTop(RECTS, 0, 2)).toBe(153);
    // 原位：被拖块上方
    expect(resolveDropLineTop(RECTS, 1, 1)).toBe(37);
  });

  it("克隆节点移除 contenteditable、data-slate-* 与 id", () => {
    const clone = cloneBlockForDrag(createBlockDom());
    expect(clone.textContent).toBe("第二段");
    for (const element of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
      expect(element.hasAttribute("contenteditable")).toBe(false);
      expect(element.hasAttribute("id")).toBe(false);
      expect(element.getAttributeNames().some(name => name.startsWith("data-slate"))).toBe(false);
    }
  });
});

describe("BlockDragLayer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("拖拽中渲染占位、克隆浮层与插入线，原块透明；结束后恢复", () => {
    const blockDom = createBlockDom();
    blockDom.style.opacity = "0.9";
    const drag: BlockDragState = { from: 1, to: 1, offsetY: 0, rects: RECTS, blockDom };
    act(() => root.render(<BlockDragLayer drag={drag} />));

    const placeholder = host.querySelector<HTMLElement>('[data-block-drag-placeholder="true"]');
    expect(placeholder?.style.top).toBe("40px");
    expect(placeholder?.style.height).toBe("60px");
    const lifted = host.querySelector<HTMLElement>('[data-block-drag-lifted="true"]');
    expect(lifted?.textContent).toBe("第二段");
    expect(lifted?.querySelector("[contenteditable]")).toBeNull();
    expect(lifted?.querySelector("[data-slate-node]")).toBeNull();
    expect(lifted?.style.top).toBe("32px");
    expect(blockDom.style.opacity).toBe("0");
    // 落点在原位时不画插入线
    expect(host.querySelector('[data-block-drop-line="true"]')).toBeNull();

    act(() => root.render(<BlockDragLayer drag={{ ...drag, to: 2, offsetY: 90 }} />));
    expect(host.querySelector<HTMLElement>('[data-block-drop-line="true"]')?.style.top).toBe(
      "153px"
    );
    expect(lifted?.style.transform).toContain("translateY(90px)");

    act(() => root.render(<BlockDragLayer drag={null} />));
    expect(host.querySelector('[data-block-drag-lifted="true"]')).toBeNull();
    expect(host.querySelector('[data-block-drop-line="true"]')).toBeNull();
    expect(blockDom.style.opacity).toBe("0.9");
  });
});
