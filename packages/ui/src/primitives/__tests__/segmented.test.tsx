/**
 * Segmented 单测（Input 家族连体描边语言）：
 * radiogroup 组语义与 aria-label · context 受控互斥 · 非受控 defaultValue ·
 * 连体描边/分割线/激活轻染类 · hover-not-checked 任意变体 · focus ring 锚 ·
 * 单项/组级禁用 · sm/md 尺寸档 · 图标段与纯图标段 aria-label 透传。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Segmented } from "../Segmented";

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

function Controlled({ initial }: { initial: "a" | "b" }) {
  const [value, setValue] = useState(initial);
  return (
    <Segmented label="组名" value={value} onValueChange={setValue}>
      <Segmented.Item value="a" label="选项 A" />
      <Segmented.Item value="b" label="选项 B" />
    </Segmented>
  );
}

describe("Segmented", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("组语义：radiogroup + aria-label、同 name、checked 由组 value 驱动", () => {
    const h = render(
      <Segmented label="模型来源" value="a">
        <Segmented.Item value="a" label="本地模型" />
        <Segmented.Item value="b" label="API 模型" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const group = h.container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute("aria-label")).toBe("模型来源");
    const inputs = [...group.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs.map(i => i.type)).toEqual(["radio", "radio"]);
    expect(new Set(inputs.map(i => i.name)).size).toBe(1); // 同 name 才互斥/成组
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
  });

  it("受控契约：点另一段回报 onValueChange 且互斥切换", () => {
    const h = render(<Controlled initial="a" />);
    cleanups.push(h.cleanup);
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    click(inputs[1]);
    expect(inputs[0].checked).toBe(false);
    expect(inputs[1].checked).toBe(true);
    click(inputs[0]);
    expect(inputs[0].checked).toBe(true);
  });

  it("非受控：defaultValue 起步，点击自切换回报", () => {
    const onValueChange = vi.fn();
    const h = render(
      <Segmented label="组名" defaultValue="a" onValueChange={onValueChange}>
        <Segmented.Item value="a" label="A" />
        <Segmented.Item value="b" label="B" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs[0].checked).toBe(true);
    click(inputs[1]);
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(inputs[1].checked).toBe(true);
  });

  it("形制类：连体描边容器、段间分割线、激活轻染、hover 只落未选段、ring 锚", () => {
    const h = render(
      <Segmented label="组名" defaultValue="a">
        <Segmented.Item value="a" label="A" />
        <Segmented.Item value="b" label="B" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const group = h.container.querySelector('[role="radiogroup"]')!;
    expect(group.className).toContain("border-line-1");
    expect(group.className).toContain("bg-surface");
    expect(group.className).toContain("rounded-tau-sm");
    const labels = [...h.container.querySelectorAll("label")];
    expect(labels[1].className).toContain("[&+&]:border-l"); // 段间 hairline 分割
    expect(labels[0].className).toContain("first:rounded-l-[7px]"); // 首末段内圆角贴容器
    expect(labels[0].className).toContain("last:rounded-r-[7px]");
    expect(labels[0].className).toContain("has-[:checked]:bg-accent-soft"); // 激活轻染
    expect(labels[0].className).toContain("has-[:checked]:text-accent-text");
    expect(labels[0].className).toContain("has-[:checked]:font-semibold");
    expect(labels[0].className).toContain("hover:[&:not(:has(:checked))]:bg-hover");
    expect(labels[0].className).toContain("active:[&:not(:has(:checked))]:bg-press");
    const ring = labels[0].querySelector("span")!;
    expect(ring.className).toContain("peer-focus-visible:visible");
    expect(ring.className).toContain("shadow-[var(--tau-focus-ring)]");
  });

  it("禁用：单项原生透传 + 整段降透明；组级禁用压全组", () => {
    const h = render(
      <Segmented label="组名">
        <Segmented.Item value="a" label="锁定项" disabled />
        <Segmented.Item value="b" label="B" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    const labels = [...h.container.querySelectorAll("label")];
    expect(inputs[0].disabled).toBe(true);
    expect(labels[0].className).toContain("has-[:disabled]:opacity-55");
    expect(inputs[1].disabled).toBe(false);
    const h2 = render(
      <Segmented label="组名" disabled>
        <Segmented.Item value="a" label="A" />
      </Segmented>
    );
    cleanups.push(h2.cleanup);
    expect(h2.container.querySelector("input")!.disabled).toBe(true);
  });

  it("md 档：容器 radius 9、段高 32 / tau-meta 字号", () => {
    const h = render(
      <Segmented label="组名" size="md">
        <Segmented.Item value="a" label="A" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const group = h.container.querySelector('[role="radiogroup"]')!;
    expect(group.className).toContain("rounded-[9px]");
    expect(group.className).not.toContain("rounded-tau-sm");
    const label = h.container.querySelector("label")!;
    expect(label.className).toContain("h-[32px]");
    expect(label.className).toContain("text-tau-meta");
    expect(label.className).toContain("first:rounded-l-[8px]"); // md 档内圆角随容器 9px
  });

  it("图标段与纯图标段：lucide 渲染、纯图标收窄内衬且 aria-label 透传", () => {
    const Globe = (props: { size?: number }) => <svg data-size={props.size} />;
    const h = render(
      <Segmented label="组名" defaultValue="a">
        <Segmented.Item value="a" label="API 模型" icon={Globe as never} />
        <Segmented.Item value="b" icon={Globe as never} aria-label="切换视图" />
      </Segmented>
    );
    cleanups.push(h.cleanup);
    const labels = [...h.container.querySelectorAll("label")];
    expect(labels[0].querySelector("svg")).not.toBeNull();
    expect(labels[1].textContent).toBe(""); // 纯图标段无文字
    expect(labels[1].className).toContain("px-2");
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs[1].getAttribute("aria-label")).toBe("切换视图");
  });
});
