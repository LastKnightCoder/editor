/**
 * Checkbox / Switch 单测（Input 方案 A 语言）：
 * 原生语义透传 · label 关联点击 · indeterminate DOM 属性 · peer 类驱动形制 ·
 * role=switch 受控切换 · 尺寸两档 · 禁用 · 错误态 aria-invalid 变体类。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "../Checkbox";
import { Switch } from "../Switch";

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

describe("Checkbox", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("原生语义：type=checkbox、checked/aria 属性透传、label 点击切换", () => {
    const onChange = vi.fn();
    const h = render(<Checkbox checked onChange={onChange} aria-label="同步" />);
    cleanups.push(h.cleanup);
    const input = h.container.querySelector("input")!;
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true);
    expect(input.getAttribute("aria-label")).toBe("同步");
    click(input);
    expect(onChange).toHaveBeenCalledTimes(1); // 受控：事件透传，state 归调用方
    // label 文字点击 → 关联 input 切换路径
    const h2 = render(<Checkbox label="自动同步" />);
    cleanups.push(h2.cleanup);
    const label = h2.container.querySelector("label")!;
    expect(label.textContent).toContain("自动同步");
    click(label);
    expect(h2.container.querySelector("input")!.checked).toBe(true);
  });

  it("indeterminate：DOM 属性生效（视觉类 peer-indeterminate 存在）", () => {
    const h = render(<Checkbox indeterminate />);
    cleanups.push(h.cleanup);
    const input = h.container.querySelector("input")!;
    expect(input.indeterminate).toBe(true);
    expect(h.container.querySelector("label > span > span")!.className).toContain(
      "peer-indeterminate:bg-accent"
    );
  });

  it("形制类：命中 24×24、ring/disabled 走锚格 has- 变体、错误态变体", () => {
    const h = render(<Checkbox aria-invalid />);
    cleanups.push(h.cleanup);
    const anchor = h.container.querySelector("label > span")!;
    const cell = h.container.querySelector("label > span > span")!;
    expect(anchor.className).toContain("size-6");
    expect(anchor.className).toContain("has-[:focus-visible]:shadow-[var(--tau-focus-ring)]");
    expect(cell.className).toContain("peer-[&[aria-invalid=true]]:border-danger");
    expect(cell.className).toContain("peer-checked:border-accent");
  });

  it("禁用：原生 disabled 透传 + 锚格降透明", () => {
    const h = render(<Checkbox disabled />);
    cleanups.push(h.cleanup);
    const input = h.container.querySelector("input")!;
    expect(input.disabled).toBe(true);
    expect(h.container.querySelector("label > span")!.className).toContain(
      "has-[:disabled]:opacity-55"
    );
  });
});

describe("Switch", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("role=switch + aria-checked：点击切换、受控 onValueChange", () => {
    const onCheckedChange = vi.fn();
    const h = render(
      <Switch checked={false} onCheckedChange={onCheckedChange} aria-label="同步" />
    );
    cleanups.push(h.cleanup);
    const btn = h.container.querySelector("button")!;
    expect(btn.getAttribute("role")).toBe("switch");
    expect(btn.getAttribute("aria-checked")).toBe("false");
    click(btn);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(btn.getAttribute("aria-checked")).toBe("false"); // 受控：外部未变则不变
  });

  it("非受控：defaultChecked 起步，点击自切换", () => {
    const h = render(<Switch defaultChecked />);
    cleanups.push(h.cleanup);
    const btn = h.container.querySelector("button")!;
    expect(btn.getAttribute("aria-checked")).toBe("true");
    click(btn);
    expect(btn.getAttribute("aria-checked")).toBe("false");
  });

  it("形制类：轨道色条件互斥（选中 accent / 未选中 bg-track）、thumb 描边、位移、两档尺寸", () => {
    const h = render(<Switch checked size="md" />);
    cleanups.push(h.cleanup);
    const btn = h.container.querySelector("button")!;
    const thumb = btn.querySelector("span")!;
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).not.toContain("bg-track"); // 轨道色互斥：选中即 accent
    expect(btn.className).toContain("h-5");
    expect(thumb.className).toContain("border-transparent"); // 选中后描边功成身退
    expect(thumb.className).toContain("left-[17px]");
    const h2 = render(<Switch size="sm" />);
    cleanups.push(h2.cleanup);
    const btn2 = h2.container.querySelector("button")!;
    const thumb2 = btn2.querySelector("span")!;
    expect(btn2.className).toContain("bg-track"); // 未选中轨道消费 token
    expect(btn2.className).toContain("w-[30px]");
    expect(thumb2.className).toContain("border-ink-3"); // 未选中 thumb 靠描边环显形
    expect(thumb2.className).not.toContain("left-[");
  });

  it("label：渲染在左、点击文字切换；禁用不动", () => {
    const h = render(<Switch label="自动同步" />);
    cleanups.push(h.cleanup);
    const label = h.container.querySelector("label")!;
    expect(label.textContent).toContain("自动同步");
    const btn = label.querySelector("button")!;
    click(label.querySelector("span")!); // 点文字
    expect(btn.getAttribute("aria-checked")).toBe("true");
    const h2 = render(<Switch label="企业锁定" disabled />);
    cleanups.push(h2.cleanup);
    click(h2.container.querySelector("button")!);
    expect(h2.container.querySelector("button")!.getAttribute("aria-checked")).toBe("false");
  });
});
