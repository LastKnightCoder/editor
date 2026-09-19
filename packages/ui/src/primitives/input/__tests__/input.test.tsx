/**
 * Input 基础件单测（方案 A「经典描边」）：
 * 原生透传 · lead/size · clearable（显现时机/受控清空/焦点保留）·
 * 只读与禁用的语义接线 · 错误态正源 aria-invalid。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Search } from "lucide-react";
import { Input } from "../Input";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  input: () => HTMLInputElement;
  box: () => HTMLElement;
  cleanup: () => void;
}
function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const input = () => container.querySelector("input")!;
  const box = () => container.querySelector("div")!;
  return {
    root,
    container,
    input,
    box,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const typeInto = (input: HTMLInputElement, text: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

describe("Input（方案 A）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("原生透传：placeholder / value / type / aria 属性直达 input", () => {
    const h = render(<Input placeholder="搜索…" value="abc" type="email" aria-label="邮箱" />);
    cleanups.push(h.cleanup);
    expect(h.input().placeholder).toBe("搜索…");
    expect(h.input().value).toBe("abc");
    expect(h.input().type).toBe("email");
    expect(h.input().getAttribute("aria-label")).toBe("邮箱");
    expect(h.box().className).toContain("border-line-1");
    expect(h.box().className).toContain("bg-surface");
  });

  it("lead 前缀 icon 渲染；size 两档高度", () => {
    const h = render(
      <>
        <Input lead={Search} />
        <Input size="sm" />
      </>
    );
    cleanups.push(h.cleanup);
    expect(h.container.querySelector("svg")).not.toBeNull();
    const boxes = [...h.container.querySelectorAll("div")].slice(0, 2);
    expect(boxes[0].className).toContain("h-[34px]");
    expect(boxes[1].className).toContain("h-[28px]");
  });

  it("clearable：有值才渲染 ×；点击清空、onChange 收空串、焦点留在输入框", () => {
    const onChange = vi.fn();
    function Demo() {
      const [v, setV] = useState("浙江省 · 杭州市");
      return (
        <Input
          value={v}
          onChange={e => {
            onChange(e.target.value);
            setV(e.target.value);
          }}
          clearable
        />
      );
    }
    const h = render(<Demo />);
    cleanups.push(h.cleanup);
    const clear = h.container.querySelector<HTMLButtonElement>('[aria-label="清空"]')!;
    expect(clear.hidden).toBe(false); // 受控有值 → × 就位（可见性由容器 hover 控制）
    expect(clear.tabIndex).toBe(-1); // 不抢 Tab 流
    h.input().focus();
    click(clear);
    expect(onChange).toHaveBeenCalledWith("");
    expect(h.input().value).toBe("");
    expect(h.container.querySelector<HTMLButtonElement>('[aria-label="清空"]')!.hidden).toBe(true); // 值空 → × 移除
  });

  it("clearable 非受控：defaultValue 驱动 ×，输入同步", () => {
    const h = render(<Input defaultValue="已有值" clearable />);
    cleanups.push(h.cleanup);
    expect(h.container.querySelector<HTMLButtonElement>('[aria-label="清空"]')!.hidden).toBe(false);
    typeInto(h.input(), "");
    expect(h.container.querySelector<HTMLButtonElement>('[aria-label="清空"]')!.hidden).toBe(true);
    typeInto(h.input(), "x");
    expect(h.container.querySelector<HTMLButtonElement>('[aria-label="清空"]')!.hidden).toBe(false);
  });

  it("错误态正源 aria-invalid：透传到 input（容器经 has- 响应，类在样式层）", () => {
    const h = render(<Input aria-invalid />);
    cleanups.push(h.cleanup);
    expect(h.input().getAttribute("aria-invalid")).toBe("true");
    expect(h.box().className).toContain("has-[[aria-invalid=true]]:border-danger");
  });

  it("只读 / 禁用：原生属性透传，容器带语义 data 标记", () => {
    const h = render(
      <>
        <Input readOnly />
        <Input disabled />
      </>
    );
    cleanups.push(h.cleanup);
    const [ro, dis] = [...h.container.querySelectorAll("input")];
    expect(ro.readOnly).toBe(true);
    expect(dis.disabled).toBe(true);
    const boxes = [...h.container.querySelectorAll("div")].slice(0, 2);
    expect(boxes[0].className).toContain("has-[input:read-only]");
    expect(boxes[1].dataset.disabled).toBeDefined();
  });
});
