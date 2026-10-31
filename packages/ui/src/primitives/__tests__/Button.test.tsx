/** Button 的类型、禁用、加载、样式覆盖、引用与属性透传。 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../Button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function render(node: React.ReactElement): HTMLButtonElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("button 未渲染");
  return button;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("Button", () => {
  it("type 默认 button，可透传 submit", () => {
    expect(render(<Button>取消</Button>).type).toBe("button");
    expect(render(<Button type="submit">提交</Button>).type).toBe("submit");
  });

  it("disabled：原生属性封锁点击", () => {
    const onClick = vi.fn();
    const b = render(
      <Button disabled onClick={onClick}>
        创建
      </Button>
    );
    expect(b.disabled).toBe(true);
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading：aria-busy + spinner + 文案切换 + disabled，点击不触发", () => {
    const onClick = vi.fn();
    const b = render(
      <Button variant="primary" loading loadingText="创建中…" onClick={onClick}>
        创建
      </Button>
    );
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe("创建中…");
    expect(b.querySelector(".animate-spin")).not.toBeNull();
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading 无 loadingText 时保持 children", () => {
    const b = render(
      <Button loading onClick={() => undefined}>
        导出
      </Button>
    );
    expect(b.textContent).toBe("导出");
  });

  it("className 覆盖默认样式（cn 合并，非静默失效）", () => {
    const b = render(<Button className="h-[40px]">取消</Button>);
    expect(b.className).toContain("h-[40px]");
    expect(b.className).not.toContain("h-[34px]");
  });

  it("ref 转发到原生 button", () => {
    const ref = vi.fn();
    render(<Button ref={ref}>取消</Button>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it("其余 props 透传（data-* / aria-*）", () => {
    const b = render(
      <Button data-autofocus aria-label="删除">
        删除
      </Button>
    );
    expect(b.hasAttribute("data-autofocus")).toBe(true);
    expect(b.getAttribute("aria-label")).toBe("删除");
  });
});
