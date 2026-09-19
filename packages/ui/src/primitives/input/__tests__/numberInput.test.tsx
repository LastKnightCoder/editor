/**
 * NumberInput 单测（beforeinput 事前拦截）：
 * 非法字符 preventDefault · 粘贴清洗（¥1,200 → 1200）· 合法中间态放行 ·
 * blur/Enter 归一化 · 空值 null · 外部受控值同步。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberInput } from "../NumberInput";
import { isValidNumberDraft, normalizeNumberDraft, sanitizePastedDigits } from "../numberGuard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  input: () => HTMLInputElement;
  cleanup: () => void;
}
function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const input = () => container.querySelector("input")!;
  return {
    root,
    container,
    input,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 模拟浏览器插入路径：先派发 beforeinput（可取消），未取消才落值 */
const insert = (input: HTMLInputElement, data: string, inputType = "insertText") =>
  act(() => {
    const e = new Event("beforeinput", { bubbles: true, cancelable: true }) as Event & {
      data: string;
      inputType: string;
    };
    e.data = data;
    e.inputType = inputType;
    const ok = input.dispatchEvent(e);
    if (ok && !e.defaultPrevented) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const s = input.selectionStart ?? input.value.length;
      const t = input.selectionEnd ?? input.value.length;
      setter.call(input, input.value.slice(0, s) + data + input.value.slice(t));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

const typeInto = (input: HTMLInputElement, text: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const blur = (input: HTMLInputElement) =>
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur"));
  });

describe("numberGuard 纯函数", () => {
  it("合法态与中间态放行，非法拒绝", () => {
    for (const ok of ["", "5", "0.5", ".5", "5.", "-", "-.", "-12.34"])
      expect(isValidNumberDraft(ok)).toBe(true);
    for (const bad of ["a", "1a", "1..2", "--1", "1-2", "e5", "1.2.3"])
      expect(isValidNumberDraft(bad)).toBe(false);
  });
  it("粘贴清洗与归一化", () => {
    expect(sanitizePastedDigits("¥1,200")).toBe("1200");
    expect(sanitizePastedDigits(" 3.5% ")).toBe("3.5");
    expect(normalizeNumberDraft("5.")).toBe(5);
    expect(normalizeNumberDraft(".5")).toBe(0.5);
    expect(normalizeNumberDraft("007")).toBe(7);
    expect(normalizeNumberDraft("")).toBeNull();
    expect(normalizeNumberDraft("-")).toBeNull();
  });
});

describe("NumberInput（beforeinput 事前拦截）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("非法字符被 preventDefault，值不变", () => {
    const h = render(<NumberInput value={null} onValueChange={() => {}} />);
    cleanups.push(h.cleanup);
    insert(h.input(), "a");
    expect(h.input().value).toBe("");
    insert(h.input(), "5");
    expect(h.input().value).toBe("5");
    insert(h.input(), "x");
    expect(h.input().value).toBe("5");
  });

  it("粘贴含杂质：清洗后插入合法部分（¥1,200 → 1200）", () => {
    const h = render(<NumberInput value={null} onValueChange={() => {}} />);
    cleanups.push(h.cleanup);
    insert(h.input(), "¥1,200", "insertFromPaste");
    expect(h.input().value).toBe("1200");
  });

  it("多点 / 二负号被拦；合法中间态放行", () => {
    const h = render(<NumberInput value={null} onValueChange={() => {}} />);
    cleanups.push(h.cleanup);
    insert(h.input(), "1.5");
    insert(h.input(), "."); // 第二个小数点 → 拒
    expect(h.input().value).toBe("1.5");
    insert(h.input(), "-"); // 非首位负号 → 拒
    expect(h.input().value).toBe("1.5");
    const h2 = render(<NumberInput value={null} onValueChange={() => {}} />);
    cleanups.push(h2.cleanup);
    insert(h2.input(), "-");
    expect(h2.input().value).toBe("-"); // 首位负号 = 合法中间态
    insert(h2.input(), "3.14");
    expect(h2.input().value).toBe("-3.14");
  });

  it("blur 归一化显示：5. → 5、.5 → 0.5（中间态实时上报等值，显示保留草稿）", () => {
    const onValueChange = vi.fn();
    const h = render(<NumberInput value={null} onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    typeInto(h.input(), "5.");
    expect(h.input().value).toBe("5."); // 中间态显示保留
    blur(h.input());
    expect(h.input().value).toBe("5"); // blur 归一化显示
    expect(onValueChange).toHaveBeenLastCalledWith(5);
    typeInto(h.input(), "0.5");
    blur(h.input());
    expect(onValueChange).toHaveBeenLastCalledWith(0.5);
  });

  it("清空 → null 提交；外部受控值同步草稿", () => {
    const onValueChange = vi.fn();
    const h = render(<NumberInput value={null} onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    typeInto(h.input(), "12");
    typeInto(h.input(), "");
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    act(() => h.root.render(<NumberInput value={42} onValueChange={onValueChange} />));
    expect(h.input().value).toBe("42");
  });
});
