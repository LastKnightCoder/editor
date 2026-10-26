import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { ImageGenerationSection } from "../sections/ImageGenerationSection";
const mocks = vi.hoisted(() => ({ open: vi.fn(), active: true }));
vi.mock("@/services/open-provider-settings", () => ({ openProviderSettings: mocks.open }));
vi.mock("@/app/plugins/context", () => ({
  useDesktopPlugins: () => ({
    listSettings: () =>
      mocks.active
        ? [
            {
              key: "connection",
              context: { pluginId: "test.images" },
              definition: {
                target: "images",
                title: "图片插件",
                form: {
                  groups: [
                    {
                      title: "账号",
                      fields: [{ key: "apiKey", label: "API Key", type: "secret" }],
                    },
                  ],
                },
              },
            },
          ]
        : [],
  }),
}));
let container: HTMLDivElement, root: Root;
const previous = useSettingStore.getState().setting;
beforeEach(() => {
  mocks.open.mockReset();
  mocks.active = true;
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: {
        currentProviderId: "a",
        providers: ["a", "b"].map(id => ({
          id,
          name: id,
          pluginId: "test.images",
          config: { apiKey: id },
          modelId: "model",
        })),
      },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useSettingStore.setState({ setting: previous });
});
const render = () =>
  act(async () =>
    root.render(
      <UiProvider>
        <ImageGenerationSection />
      </UiProvider>
    )
  );
it("设置只选择账号，配置入口导航至插件页且不修改凭据或选用", async () => {
  await render();
  expect(container.querySelector('input[type="password"]')).toBeNull();
  const before = structuredClone(useSettingStore.getState().setting.imageGeneration);
  const button = [...container.querySelectorAll("button")].find(
    item => item.textContent === "配置"
  )!;
  await act(async () => button.click());
  expect(mocks.open).toHaveBeenCalledWith("test.images", "connection", "imageGeneration");
  expect(useSettingStore.getState().setting.imageGeneration).toEqual(before);
  await act(async () => container.querySelector<HTMLInputElement>('input[value="b"]')!.click());
  expect(useSettingStore.getState().setting.imageGeneration.currentProviderId).toBe("b");
  expect(useSettingStore.getState().setting.imageGeneration.providers).toEqual(before.providers);
});
it("插件停用时保留账号和当前选择，但不允许选择不可用服务", async () => {
  mocks.active = false;
  await render();
  expect(
    [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(
      input => input.disabled
    )
  ).toBe(true);
  expect(useSettingStore.getState().setting.imageGeneration.currentProviderId).toBe("a");
  expect(useSettingStore.getState().setting.imageGeneration.providers).toHaveLength(2);
});
