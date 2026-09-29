/**
 * FilterPill 单测：aria-pressed 随选中 · 计数不传不渲染 · 两种未选皮肤 · className 可覆盖未选文字色 · 图标槽。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterPill } from "../FilterPill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("FilterPill", () => {
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
    return container.querySelector("button")!;
  };

  it("选中态报 aria-pressed，点击回调", () => {
    const onClick = vi.fn();
    const pill = render(<FilterPill active onClick={onClick} label="全部" count={3} />);
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(pill.className).toContain("bg-selected");
    expect(pill.textContent).toBe("全部3");
    act(() => pill.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("计数不传不渲染；0 照常渲染", () => {
    expect(render(<FilterPill active={false} onClick={() => {}} label="全部" />).textContent).toBe(
      "全部"
    );
    act(() => root?.unmount());
    expect(
      render(<FilterPill active={false} onClick={() => {}} label="需要处理" count={0} />)
        .textContent
    ).toBe("需要处理0");
  });

  it("未选皮肤：outline 描边、raised 浮起", () => {
    const outline = render(<FilterPill active={false} onClick={() => {}} label="a" />);
    expect(outline.className).toContain("border-line-1");
    expect(outline.className).not.toContain("shadow-card");
    act(() => root?.unmount());
    const raised = render(
      <FilterPill variant="raised" active={false} onClick={() => {}} label="a" />
    );
    expect(raised.className).toContain("shadow-card");
    expect(raised.className).not.toContain("border-line-1");
  });

  it("className 覆盖未选文字色（cn 合并去掉默认 text-ink-2）", () => {
    const pill = render(
      <FilterPill
        variant="raised"
        active={false}
        onClick={() => {}}
        label="需要处理"
        className="text-warn"
      />
    );
    expect(pill.className).toContain("text-warn");
    expect(pill.className).not.toContain("text-ink-2");
  });

  it("图标渲染在标签前", () => {
    const pill = render(
      <FilterPill active={false} onClick={() => {}} label="卡组" icon={<i data-icon />} />
    );
    expect(pill.firstElementChild?.hasAttribute("data-icon")).toBe(true);
  });
});
