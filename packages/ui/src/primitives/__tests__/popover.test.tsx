/**
 * Popover 基础件单测（D-014）：
 * 开合与 aria 接线（dialog/haspopup/expanded/labelled-by 头行）· 初始焦点
 * （data-autofocus 优先，否则卡片）· Esc 焦点链（卡片与触发器两处消费、还焦、
 * 不冒泡）· Tab 移出即关 · 外点关闭与浮层内点击不关 · 嵌套链（二级 Popover
 * 点击不误伤一级、Esc LIFO 先关二级）· 顶层互斥（开新关旧）· 受控 open
 * （props 为准、回调单次）· 触发器键盘开合 · Header × · 箭头随 arrow prop。
 * jsdom 无布局：定位只验证不崩（引擎数学由 anchoredPosition.test.ts 守护）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover } from "../Popover";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  trigger: HTMLButtonElement;
  card: HTMLElement;
  cleanup: () => void;
}

function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const trigger = container.querySelector<HTMLButtonElement>("button");
  const card = document.querySelector<HTMLElement>('[role="dialog"]');
  return {
    root,
    container,
    trigger: trigger as HTMLButtonElement,
    card: card as HTMLElement,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
const outside = (el: Element = document.body) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });

describe("Popover", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
    vi.restoreAllMocks();
  });

  it("click toggle：开合、aria 与初始焦点（卡片自身）", () => {
    const h = render(
      <Popover trigger={<button>说明</button>}>
        <Popover.Header>标题</Popover.Header>
        <Popover.Body>正文内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    expect(h.trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.card.hasAttribute("inert")).toBe(true);

    click(h.trigger);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(h.card.hasAttribute("inert")).toBe(false);
    expect(h.card.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(h.card.getAttribute("aria-labelledby")!)?.textContent).toContain(
      "标题"
    );
    expect(document.activeElement).toBe(h.card); // 无 data-autofocus → 卡片自身（Esc 可达）

    click(h.trigger);
    expect(h.card.hasAttribute("inert")).toBe(true);
  });

  it("初始焦点落 [data-autofocus]（表单首输入框）", () => {
    const h = render(
      <Popover trigger={<button>新建</button>}>
        <Popover.Body>
          <input data-autofocus />
        </Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    expect(document.activeElement).toBe(h.card.querySelector("input"));
  });

  it("无 Header 时卡片不挂 aria-labelledby", () => {
    const h = render(
      <Popover trigger={<button>色板</button>}>
        <Popover.Body>裸内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    expect(h.card.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("Esc：卡片内消费（不冒泡）+ 还焦触发器；触发器上 Esc 也关", () => {
    const changed = vi.fn();
    const h = render(
      <Popover trigger={<button>筛选</button>} onOpenChange={changed}>
        <Popover.Body>内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    changed.mockClear();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => h.card.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); // 不冒泡成页面后退
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(document.activeElement).toBe(h.trigger);

    click(h.trigger);
    key(h.trigger, "Escape"); // 焦点回到触发器时同样能关
    expect(h.card.hasAttribute("inert")).toBe(true);
  });

  it("Tab：关闭还焦触发器且放行默认行为（非模态不圈闭）", () => {
    const changed = vi.fn();
    const h = render(
      <Popover trigger={<button>筛选</button>} onOpenChange={changed}>
        <Popover.Body>内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    changed.mockClear();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => h.card.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(document.activeElement).toBe(h.trigger);
  });

  it("触发器键盘：Enter / ArrowDown 开", () => {
    const h = render(
      <Popover trigger={<button>筛选</button>}>
        <Popover.Body>内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    key(h.trigger, "Enter");
    expect(h.card.hasAttribute("inert")).toBe(false);
    key(h.trigger, "Escape");
    key(h.trigger, "ArrowDown");
    expect(h.card.hasAttribute("inert")).toBe(false);
  });

  it("外点关闭；浮层内点击不关；Header × 关闭", () => {
    const h = render(
      <Popover trigger={<button>筛选</button>}>
        <Popover.Header icon={null}>标题</Popover.Header>
        <Popover.Body>
          <button>浮层内按钮</button>
        </Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    outside(h.card.querySelector("button")!); // 浮层内 pointerdown
    expect(h.card.hasAttribute("inert")).toBe(false);

    const outsider = document.createElement("div");
    document.body.appendChild(outsider);
    outside(outsider);
    expect(h.card.hasAttribute("inert")).toBe(true);
    outsider.remove();

    click(h.trigger);
    click(h.card.querySelector('button[aria-label="关闭"]')!); // Header ×
    expect(h.card.hasAttribute("inert")).toBe(true);
  });

  it("嵌套链：二级 Popover 内点击不误伤一级；Esc LIFO 先关二级", () => {
    const h = render(
      <Popover trigger={<button>筛选</button>}>
        <Popover.Body>
          <Popover trigger={<button>高级选项</button>} placement="right-start">
            <Popover.Body>
              <input />
            </Popover.Body>
          </Popover>
        </Popover.Body>
      </Popover>
    );
    cleanups.push(h.cleanup);
    // 嵌套时二级 portal 先于一级插入 body（React 深度优先提交）——按内容认卡，别按序号
    const outer = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(c =>
      c.textContent!.includes("高级选项")
    )!;
    const innerTrigger = outer.querySelector<HTMLButtonElement>("button")!;
    click(h.trigger); // 一级
    click(innerTrigger); // 二级
    const cards = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    expect(cards).toHaveLength(2);
    const inner = cards.find(c => c !== outer)!;

    // 层序：二级 portal 先插入 DOM（深度优先），靠 dismiss 层的 z 递增保证后开在上
    expect(Number(inner.style.zIndex)).toBeGreaterThan(Number(outer.style.zIndex));

    act(() => {
      inner.querySelector("input")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(outer.hasAttribute("inert")).toBe(false); // 一级不受伤
    expect(inner.hasAttribute("inert")).toBe(false);

    key(inner, "Escape");
    expect(inner.hasAttribute("inert")).toBe(true);
    expect(outer.hasAttribute("inert")).toBe(false); // Esc 只关栈顶
  });

  it("顶层互斥：开第二个 Popover 关第一个", () => {
    const h = render(
      <div>
        <Popover trigger={<button>A</button>}>
          <Popover.Body>甲</Popover.Body>
        </Popover>
        <Popover trigger={<button>B</button>}>
          <Popover.Body>乙</Popover.Body>
        </Popover>
      </div>
    );
    cleanups.push(h.cleanup);
    const [a, b] = [...h.container.querySelectorAll("button")];
    const cards = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    click(a);
    expect(cards[0].hasAttribute("inert")).toBe(false);
    click(b);
    expect(cards[0].hasAttribute("inert")).toBe(true);
    expect(cards[1].hasAttribute("inert")).toBe(false);
  });

  it("受控 open：props 为准，外点仍回调（由调用方决定状态）", () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <Popover trigger={<button>受控</button>} open={open} onOpenChange={setOpen}>
          <Popover.Body>内容</Popover.Body>
        </Popover>
      );
    }
    const h = render(<Controlled />);
    cleanups.push(h.cleanup);
    expect(h.card.hasAttribute("inert")).toBe(false);
    const outsider = document.createElement("div");
    document.body.appendChild(outsider);
    outside(outsider);
    outsider.remove();
    expect(h.card.hasAttribute("inert")).toBe(true); // 回调把 state 落了地
  });

  it("箭头随 arrow prop 出现 / 消失", () => {
    const h = render(
      <Popover trigger={<button>有箭头</button>}>
        <Popover.Body>内容</Popover.Body>
      </Popover>
    );
    expect(h.card.querySelector("span[aria-hidden]")).not.toBeNull();
    h.cleanup(); // portal 是 body 级兄弟，先清掉再验第二例，避免 querySelector 拿错卡

    const h2 = render(
      <Popover trigger={<button>无箭头</button>} arrow={false}>
        <Popover.Body>内容</Popover.Body>
      </Popover>
    );
    cleanups.push(h2.cleanup);
    expect(h2.card.querySelector("span[aria-hidden]")).toBeNull();
  });
});
