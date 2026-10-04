import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AddTag from "@/components/AddTag";

vi.mock("react-dnd", () => ({
  useDrag: () => [{ isDragging: false }, (ref: unknown) => ref],
  useDrop: () => [{}, (ref: unknown) => ref],
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it("divided 时标签行自带上分割线，不依赖正文末块的外边距", () => {
  act(() => root.render(<AddTag divided tags={[]} addTag={vi.fn()} removeTag={vi.fn()} />));
  expect(host.firstElementChild?.className).toContain("border-t");
});

it("新增标签去首尾空白，已存在的标签不重复提交", () => {
  const addTag = vi.fn();
  act(() => root.render(<AddTag tags={["已有"]} addTag={addTag} removeTag={vi.fn()} />));

  const submit = (text: string) => {
    const button = Array.from(host.querySelectorAll("span")).find(
      element => element.textContent === "添加标签"
    )!;
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => vi.runAllTimers());
    const input = host.querySelector<HTMLElement>("[contenteditable]")!;
    input.textContent = text;
    // is-hotkey 按 which 匹配，jsdom 的 KeyboardEvent 构造参数不落 which
    const enter = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(enter, "which", { value: 13 });
    act(() => document.dispatchEvent(enter));
  };

  submit(" 已有 ");
  submit("  新标签 ");
  expect(addTag).toHaveBeenCalledTimes(1);
  expect(addTag).toHaveBeenCalledWith("新标签");
});
