/**
 * Drawer 基础件单测：开合与 aria · Esc / 遮罩 / × 关闭 · 内层 defaultPrevented 让位 ·
 * 初始焦点与焦点归还 · 退场后卸载 · useRetainedValue 退场期间保留内容。
 */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Drawer, useRetainedValue } from "../Drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function flushAnim() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 320));
  });
}

function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

function keydown(el: HTMLElement, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("Drawer", () => {
  it("open 时渲染，title 作为无障碍名", () => {
    mount(
      <Drawer open onOpenChange={() => undefined} title="站点设置">
        正文
      </Drawer>
    );
    const el = panel()!;
    expect(el.getAttribute("aria-modal")).toBe("true");
    const labelledby = el.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledby)?.textContent).toBe("站点设置");
    expect(el.textContent).toContain("正文");
  });

  it("关闭态不渲染", () => {
    mount(
      <Drawer open={false} onOpenChange={() => undefined} title="x">
        正文
      </Drawer>
    );
    expect(panel()).toBeNull();
  });

  it("Esc / × / 遮罩点击都请求关闭", () => {
    const change = vi.fn();
    mount(
      <Drawer open onOpenChange={change} title="x">
        正文
      </Drawer>
    );
    keydown(panel()!, "Escape");
    act(() => panel()!.querySelector<HTMLElement>('[aria-label="关闭"]')!.click());
    act(() => (panel()!.previousElementSibling as HTMLElement).click());
    expect(change.mock.calls).toEqual([[false], [false], [false]]);
  });

  it("内层已消费的 Esc 不关闭抽屉", () => {
    const change = vi.fn();
    mount(
      <Drawer open onOpenChange={change} title="x">
        <input data-testid="inner" onKeyDown={e => e.key === "Escape" && e.preventDefault()} />
      </Drawer>
    );
    keydown(document.querySelector<HTMLElement>('[data-testid="inner"]')!, "Escape");
    expect(change).not.toHaveBeenCalled();
  });

  it("初始焦点落 data-autofocus，关闭卸载后归还触发元素并回调 onAfterClose", async () => {
    const afterClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    let setOpen: (v: boolean) => void = () => undefined;
    function Host() {
      const [open, set] = useState(true);
      setOpen = set;
      return (
        <Drawer open={open} onOpenChange={set} onAfterClose={afterClose} title="x">
          <input data-autofocus data-testid="first" />
        </Drawer>
      );
    }
    mount(<Host />);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="first"]'));
    act(() => setOpen(false));
    expect(panel()).not.toBeNull(); // 退场动画期间仍挂载
    await flushAnim();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(afterClose).toHaveBeenCalledTimes(1);
    trigger.remove();
  });
});

describe("useRetainedValue", () => {
  it("值为空时返回最后一次非空值", () => {
    let set: (v: string | null) => void = () => undefined;
    let seen: string | null = null;
    function Host() {
      const [v, setV] = useState<string | null>(null);
      set = setV;
      seen = useRetainedValue(v);
      return null;
    }
    mount(<Host />);
    expect(seen).toBeNull();
    act(() => set("a"));
    expect(seen).toBe("a");
    act(() => set(null));
    expect(seen).toBe("a");
    act(() => set("b"));
    expect(seen).toBe("b");
  });
});

describe("Drawer · 非模态", () => {
  it("就地渲染、无遮罩、不抢焦点、不锁滚动，无 dialog 角色", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    mount(
      <div data-testid="host">
        <Drawer modal={false} open onOpenChange={() => undefined} title="参考资料">
          正文
        </Drawer>
      </div>
    );
    const aside = document.querySelector('[data-testid="host"] > aside')!;
    expect(aside).not.toBeNull();
    expect(aside.getAttribute("role")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(aside.previousElementSibling).toBeNull(); // 无遮罩
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
    trigger.remove();
  });

  it("焦点在抽屉内时 Esc 关闭", () => {
    const change = vi.fn();
    mount(
      <Drawer modal={false} open onOpenChange={change} title="x">
        <input data-testid="inner" />
      </Drawer>
    );
    keydown(document.querySelector<HTMLElement>('[data-testid="inner"]')!, "Escape");
    expect(change).toHaveBeenCalledWith(false);
  });

  it("isolateKeyboard：内层照常收到键盘事件，document 收不到", () => {
    const inner = vi.fn();
    const onDoc = vi.fn();
    document.addEventListener("keydown", onDoc);
    mount(
      <Drawer modal={false} open onOpenChange={() => undefined} title="x" isolateKeyboard>
        <input data-testid="inner" onKeyDown={inner} />
      </Drawer>
    );
    keydown(document.querySelector<HTMLElement>('[data-testid="inner"]')!, "Delete");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(onDoc).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDoc);
  });

  it("无 title 时不渲染头部，× 浮在右上角", () => {
    mount(
      <Drawer modal={false} open onOpenChange={() => undefined} label="视频笔记" fill>
        <div data-testid="content" />
      </Drawer>
    );
    const aside = document.querySelector("aside")!;
    expect(aside.querySelector("header")).toBeNull();
    expect(aside.getAttribute("aria-label")).toBe("视频笔记");
    expect(aside.querySelector('[aria-label="关闭"]')).not.toBeNull();
  });

  it("onWidthChange 开启拖拽手柄，受控宽度夹进上下限", () => {
    mount(
      <Drawer
        modal={false}
        open
        onOpenChange={() => undefined}
        title="x"
        width={900}
        onWidthChange={() => undefined}
        minWidth={200}
        maxWidth={600}
      />
    );
    const aside = document.querySelector("aside")!;
    expect(aside.querySelector('[role="separator"]')).not.toBeNull();
    expect(aside.style.width).toBe("600px");
  });
});
