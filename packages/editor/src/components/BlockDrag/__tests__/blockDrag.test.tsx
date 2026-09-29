// 块拖拽手柄与放置指示：显示逻辑限定在最内层被悬停的块，位置可经 className 覆盖。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cn } from "@tau/ui";
import { BLOCK_DRAG_GROUP, DragHandle, DropIndicator, dimWhileDragging, dropLineClass } from "..";

describe("BlockDrag", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (ui: ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(ui));
    return container;
  };

  it("可拖时标记 data-block-reveal 交给块悬停规则显示；不可拖时不标记、也不响应悬停", () => {
    const host = render(
      <>
        <DragHandle dragRef={() => {}} canDrag />
        <DragHandle dragRef={() => {}} canDrag={false} />
      </>
    );
    const [draggable, locked] = host.querySelectorAll<HTMLElement>("[data-drag-handle]");
    expect(draggable.hasAttribute("data-block-reveal")).toBe(true);
    expect(draggable.className).toContain("opacity-0");
    expect(locked.hasAttribute("data-block-reveal")).toBe(false);
    expect(locked.className).not.toContain("hover:opacity-100");
    // Tailwind 命名 group 匹配任意同名祖先，嵌套块会一起亮，不能用
    expect(draggable.className).not.toMatch(/group-hover/);
    expect(draggable.getAttribute("contenteditable")).toBe("false");
  });

  it("块悬停规则只点亮最内层被悬停的块，且不穿透到嵌套块", () => {
    const css = readFileSync(resolve(__dirname, "../../../theme/editor.css"), "utf8");
    expect(BLOCK_DRAG_GROUP).toBe("ed-block");
    expect(css).toMatch(
      /@scope \(\.ed-block:hover:not\(:has\(\.ed-block:hover\)\)\) to \(\.ed-block\) \{\s*\[data-block-reveal\] \{\s*opacity: 1;/
    );
  });

  it("className 覆盖默认位置，点击回调透传，drag 连接器拿到节点", () => {
    const onClick = vi.fn();
    const dragRef = vi.fn();
    const host = render(
      <DragHandle
        dragRef={dragRef}
        canDrag
        onClick={onClick}
        className="-left-[1.5em] top-[0.0625em]"
      />
    );
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;
    expect(handle.className).toContain("-left-[1.5em]");
    expect(handle.className).not.toContain("-left-[1.25em]");
    expect(handle.className).toContain("top-[0.0625em]");
    expect(handle.className).not.toMatch(/(^| )top-0( |$)/);
    act(() => handle.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(dragRef).toHaveBeenCalledWith(handle);
  });

  it("放置指示：只在有拖拽经过时渲染，按 before 放上方或下方", () => {
    const host = render(
      <>
        <DropIndicator active={false} before />
        <DropIndicator active before />
        <DropIndicator active before={false} className="-bottom-[0.125em]" />
      </>
    );
    const indicators = host.querySelectorAll<HTMLElement>("[data-drop-indicator]");
    expect(indicators).toHaveLength(2);
    expect(indicators[0].dataset.dropIndicator).toBe("before");
    expect(indicators[0].className).toContain("-top-[0.625em]");
    expect(indicators[1].dataset.dropIndicator).toBe("after");
    expect(indicators[1].className).toContain("-bottom-[0.125em]");
    expect(indicators[1].className).not.toContain("bottom-[0.375em]");
  });

  it("拖拽中半透明", () => {
    expect(dimWhileDragging(true)).toBe("opacity-50");
    expect(dimWhileDragging(false)).toBeUndefined();
  });

  it("伪元素插入线：上方 / 下方各用 before / after，偏移经 cn 可覆盖", () => {
    expect(dropLineClass(false, true)).toBeUndefined();
    const before = dropLineClass(true, true)!;
    expect(before).toContain("before:-top-[0.625em]");
    expect(before).not.toContain("after:");
    const after = cn(dropLineClass(true, false), "after:-bottom-[0.125em]");
    expect(after).toContain("after:-bottom-[0.125em]");
    expect(after).not.toContain("after:bottom-[0.375em]");
  });
});
