import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { produce } from "immer";
import { afterEach, beforeEach, expect, it } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { ImageGenerationSection } from "../sections/ImageGenerationSection";

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<ImageGenerationSection />));
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label));
const imageGeneration = () => useSettingStore.getState().setting.imageGeneration;
const setImageGeneration = (value: ReturnType<typeof imageGeneration>) =>
  useSettingStore.setState(s => ({
    setting: produce(s.setting, draft => {
      draft.imageGeneration = value;
    }),
  }));

beforeEach(() => {
  setImageGeneration({ providers: [], currentProviderId: "" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("无提供商时空态引导，添加后使用 legacy 默认值并设为当前", () => {
  render();
  expect(text()).toContain("还没有图片生成提供商");
  act(() => button("添加提供商")!.click());
  const { providers, currentProviderId } = imageGeneration();
  expect(providers).toHaveLength(1);
  expect(providers[0]).toMatchObject({
    name: "OpenAI 兼容 1",
    providerType: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    modelName: "gpt-image-2",
  });
  expect(currentProviderId).toBe(providers[0].id);
  expect(text()).toContain("当前");
  expect(button("设为当前")).toBeUndefined();
});

it("选中非当前提供商可设为当前", () => {
  setImageGeneration({
    currentProviderId: "a",
    providers: [
      { id: "a", name: "甲", providerType: "openai", baseUrl: "", apiKey: "", modelName: "m" },
      { id: "b", name: "乙", providerType: "openai", baseUrl: "", apiKey: "", modelName: "m" },
    ],
  });
  render();
  act(() => button("乙")!.click());
  expect(imageGeneration().currentProviderId).toBe("a");
  act(() => button("设为当前")!.click());
  expect(imageGeneration().currentProviderId).toBe("b");
});
