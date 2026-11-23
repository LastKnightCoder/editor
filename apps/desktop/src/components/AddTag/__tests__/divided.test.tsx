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
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function openPicker() {
  const button = Array.from(document.querySelectorAll<HTMLElement>("[role=button]")).find(
    element => element.textContent === "添加标签"
  )!;
  await act(async () => button.click());
  return document.querySelector<HTMLInputElement>("input[aria-label='搜索或新建标签']")!;
}

async function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  );
}

it("新建标签去首尾空白，已有的标签不重复提交", async () => {
  const addTag = vi.fn();
  act(() => root.render(<AddTag tags={["已有"]} addTag={addTag} removeTag={vi.fn()} />));

  const input = await openPicker();
  await type(input, " 已有 ");
  await type(input, "  新标签 ");
  expect(addTag).toHaveBeenCalledTimes(1);
  expect(addTag).toHaveBeenCalledWith("新标签");
});

it("输入命中已有标签时回车选中它，而不是按输入新建", async () => {
  const addTag = vi.fn();
  const loadSuggestions = vi.fn(async () => [
    { tag: "前端/CSS", count: 6, lastUsedAt: 2 },
    { tag: "算法", count: 4, lastUsedAt: 1 },
  ]);
  act(() =>
    root.render(
      <AddTag tags={[]} addTag={addTag} removeTag={vi.fn()} loadSuggestions={loadSuggestions} />
    )
  );

  const input = await openPicker();
  await type(input, "css");
  expect(addTag).toHaveBeenCalledWith("前端/CSS");
});
