/** Tag 的语义色板、可选圆点与移除事件。 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tag, TAG_COLORS } from "../Tag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(ui: ReactNode): { root: Root; container: HTMLElement; cleanup: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    root,
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

describe("Tag", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("7 色板映射：soft 底 + solid 文字，点与文字分语义位（orange 文字 accent-text、点 accent）", () => {
    const h = render(
      <div>
        {TAG_COLORS.map(color => (
          <Tag key={color} color={color}>
            {color}
          </Tag>
        ))}
      </div>
    );
    cleanups.push(h.cleanup);
    const tags = [...h.container.querySelectorAll("span > span.truncate")].map(
      el => el.parentElement!
    );
    const byClass = (cls: string) => tags.filter(t => t.className.includes(cls));
    expect(tags).toHaveLength(7);
    expect(byClass("bg-danger-soft")[0].className).toContain("text-danger");
    expect(byClass("bg-accent-soft")[0].className).toContain("text-accent-text"); // 文字语义位
    expect(byClass("bg-warn-soft")[0].className).toContain("text-warn");
    expect(byClass("bg-ok-soft")[0].className).toContain("text-ok");
    expect(byClass("bg-info-soft")[0].className).toContain("text-info");
    expect(byClass("bg-tag-3-soft")[0].className).toContain("text-tag-3");
    expect(byClass("bg-surface")[0].className).toContain("text-ink-2");
    // 点：彩色 6 色 solid，orange 点走 accent（与文字分位）
    const redDot = byClass("bg-danger-soft")[0].querySelector("span:not(.truncate)")!;
    expect(redDot.className).toContain("bg-danger");
    const orangeDot = byClass("bg-accent-soft")[0].querySelector("span:not(.truncate)")!;
    expect(orangeDot.className).toContain("bg-accent");
    expect(orangeDot.className).not.toContain("accent-text");
  });

  it("gray 默认：surface 亮底 + line-1 描边（D-009 行内药丸口径）+ ink-2 文字，恒无点（showDot 也压不住）", () => {
    const h = render(<Tag showDot>未分类</Tag>);
    cleanups.push(h.cleanup);
    const tag = h.container.querySelector("span") as HTMLElement;
    expect(tag.className).toContain("bg-surface");
    expect(tag.className).toContain("border-line-1");
    expect(tag.className).toContain("text-ink-2");
    expect(tag.querySelectorAll("span")).toHaveLength(1); // 只剩 truncate 文字位
  });

  it("showDot=false：彩色也不出点（退化为纯软底形态）", () => {
    const h = render(
      <Tag color="blue" showDot={false}>
        同步中
      </Tag>
    );
    cleanups.push(h.cleanup);
    const tag = h.container.querySelector("span")!;
    expect(tag.className).toContain("bg-info-soft");
    expect(tag.querySelector("span:not(.truncate)")).toBeNull();
  });

  it("onRemove：显 × button（aria-label / 热区外扩类 / focus-visible ring 类），点击回报且不冒泡", () => {
    const onRemove = vi.fn();
    const parentClick = vi.fn();
    const h = render(
      <div onClick={parentClick}>
        <Tag color="blue" onRemove={onRemove}>
          设计
        </Tag>
      </div>
    );
    cleanups.push(h.cleanup);
    const x = h.container.querySelector("button")!;
    expect(x.getAttribute("aria-label")).toBe("移除");
    expect(x.className).toContain("before:-inset-2"); // 热区 24（视觉 16）
    expect(x.className).toContain("focus-visible:shadow-[var(--tau-focus-ring)]");
    click(x);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled(); // stopPropagation：表格行不受牵连
    // 不传 onRemove 则无 ×
    const h2 = render(<Tag color="blue">设计</Tag>);
    cleanups.push(h2.cleanup);
    expect(h2.container.querySelector("button")).toBeNull();
  });
});
