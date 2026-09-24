import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { ModuleSection } from "../sections/ModuleSection";

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<ModuleSection />));
const text = () => container.textContent ?? "";
const switchOf = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("按分类分组渲染模块开关，不提供「设置」模块开关", () => {
  render();
  for (const label of ["内容创作", "知识管理", "个人管理", "学习与工具"]) {
    expect(text()).toContain(label);
  }
  expect(switchOf("卡片")).not.toBeNull();
  expect(switchOf("闪卡中心")).not.toBeNull();
  expect(switchOf("设置")).toBeNull();
  expect(text()).not.toContain("其他");
});

it("切换开关写入 module.<key>.enable 并更新启用计数", () => {
  render();
  const before = useSettingStore.getState().setting.module.card.enable;
  expect(before).toBe(true);
  expect(text()).toContain("已启用 4 / 4");
  act(() => switchOf("卡片")!.click());
  expect(useSettingStore.getState().setting.module.card.enable).toBe(false);
  expect(text()).toContain("已启用 3 / 4");
});
