/**
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Stepper } from "../index";

const roots: Root[] = [];

/** 受控宿主：onChange 回写 value，贴近 setter 弹层的真实用法 */
function mountStepper(initial: number) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const reads: number[] = [];
  function Harness() {
    const [v, setV] = useState(initial);
    return (
      <Stepper
        value={v}
        min={0}
        max={6}
        step={2}
        label="线宽"
        onChange={n => {
          reads.push(n);
          setV(n);
        }}
      />
    );
  }
  void act(() => {
    root.render(<Harness />);
  });
  const q = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  return {
    input: q<HTMLInputElement>("input"),
    minus: q<HTMLButtonElement>('button[aria-label="减小线宽"]'),
    plus: q<HTMLButtonElement>('button[aria-label="增大线宽"]'),
    reads,
  };
}

/** 受控 input 改值必须走原生 setter + input 事件，React onChange 才会触发 */
function setNativeValue(el: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("Stepper", () => {
  it("+ / − 按步长增减，输入框回显受控新值", () => {
    const { input, minus, plus, reads } = mountStepper(2);
    void act(() => {
      plus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    void act(() => {
      minus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(reads).toEqual([4, 2]);
    expect(input.getAttribute("aria-label")).toBe("线宽");
    expect(input.value).toBe("2");
  });

  it("到达 min / max 边界时对应按钮禁用", () => {
    const atMin = mountStepper(0);
    expect(atMin.minus.disabled).toBe(true);
    expect(atMin.plus.disabled).toBe(false);

    const atMax = mountStepper(6);
    expect(atMax.plus.disabled).toBe(true);
    expect(atMax.minus.disabled).toBe(false);
  });

  it("输入越界被钳制到边界，不对齐的值按 step 取整", () => {
    const { input, reads } = mountStepper(2);
    void act(() => {
      setNativeValue(input, "99");
    });
    expect(reads).toEqual([6]);
    expect(input.value).toBe("6"); // 受控回显钳制后的值

    void act(() => {
      setNativeValue(input, "3"); // 距 2 / 4 等距，向上取 4
    });
    expect(reads).toEqual([6, 4]);
  });

  it("清空输入提交 null 被忽略，不触发 onChange", () => {
    const { input, reads } = mountStepper(2);
    void act(() => {
      setNativeValue(input, "");
    });
    // NumberInput 契约：草稿留空等外部值变化再回显，这里只守护 null 不落到 onChange
    expect(reads).toEqual([]);
  });
});
