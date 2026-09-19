/**
 * Textarea 单测（与 Input 同形 + maxLength 计数器）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Textarea } from "../Textarea";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  textarea: () => HTMLTextAreaElement;
  count: () => HTMLElement | null;
  cleanup: () => void;
}
function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const textarea = () => container.querySelector("textarea")!;
  const count = () => container.querySelector("span");
  return {
    root,
    container,
    textarea,
    count,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const typeInto = (ta: HTMLTextAreaElement, text: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("Textarea", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("不传 maxLength 无计数器；传值即渲染 n / maxLength", () => {
    const h = render(<Textarea placeholder="备注" />);
    cleanups.push(h.cleanup);
    expect(h.count()).toBeNull();
    const h2 = render(<Textarea defaultValue="abc" maxLength={10} />);
    cleanups.push(h2.cleanup);
    expect(h2.count()!.textContent).toBe("3 / 10");
  });

  it("受控输入联动计数；超限转 danger 语义类", () => {
    function Demo() {
      const [v, setV] = useState("abcde");
      return <Textarea value={v} onChange={e => setV(e.target.value)} maxLength={5} />;
    }
    const h = render(<Demo />);
    cleanups.push(h.cleanup);
    expect(h.count()!.textContent).toBe("5 / 5");
    expect(h.count()!.className).toContain("text-danger");
    typeInto(h.textarea(), "abc");
    expect(h.count()!.textContent).toBe("3 / 5");
    expect(h.count()!.className).not.toContain("text-danger");
  });

  it("maxLength 落到原生属性（浏览器层硬限），aria-invalid 同样透传", () => {
    const h = render(<Textarea maxLength={20} aria-invalid />);
    cleanups.push(h.cleanup);
    expect(h.textarea().maxLength).toBe(20);
    expect(h.textarea().getAttribute("aria-invalid")).toBe("true");
  });
});
