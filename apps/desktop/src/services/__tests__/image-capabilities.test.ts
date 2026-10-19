import { afterEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
const mocks = vi.hoisted(() => ({ open: vi.fn(), on: vi.fn(), off: vi.fn() }));
vi.mock("../plugin-images", () => ({ openPluginImages: mocks.open }));
vi.mock("@/electron", async importOriginal => ({
  ...(await importOriginal<object>()),
  isElectron: true,
  on: mocks.on,
  off: mocks.off,
}));
import { startImageCapabilities, useImageCapabilities } from "../image-capabilities";

const original = useSettingStore.getState().setting;
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  useSettingStore.setState({ setting: original });
  vi.clearAllMocks();
});

it("旧配置的迟到能力不能覆盖新账号，插件状态变化会撤销工具能力", async () => {
  const accounts = ["a", "b"].map(id => ({
    id,
    name: id,
    pluginId: "test.images",
    modelId: "model",
    config: {},
  }));
  useSettingStore.setState({
    setting: { ...original, imageGeneration: { currentProviderId: "a", providers: accounts } },
  });
  let resolveOld!: (value: {
    canGenerate: boolean;
    canEdit: boolean;
    dispose(): Promise<void>;
  }) => void;
  mocks.open.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveOld = resolve;
      })
  );
  const current = { canGenerate: false, canEdit: true, dispose: vi.fn(async () => {}) };
  mocks.open.mockResolvedValueOnce(current);
  stop = startImageCapabilities();
  const oldSignal = mocks.open.mock.calls[0][1] as AbortSignal;
  useSettingStore.setState({
    setting: { ...original, imageGeneration: { currentProviderId: "b", providers: accounts } },
  });
  await vi.waitFor(() => expect(useImageCapabilities.getState().canEdit).toBe(true));
  const old = { canGenerate: true, canEdit: false, dispose: vi.fn(async () => {}) };
  resolveOld(old);
  await vi.waitFor(() => expect(old.dispose).toHaveBeenCalled());
  expect(oldSignal.aborted).toBe(true);
  expect(useImageCapabilities.getState()).toMatchObject({ canGenerate: false, canEdit: true });
  mocks.open.mockRejectedValueOnce(new Error("插件已停用"));
  const changed = mocks.on.mock.calls.find(call => call[0] === "plugin-images:changed")![1];
  changed();
  await vi.waitFor(() => expect(useImageCapabilities.getState().error).toBe("插件已停用"));
  expect(useImageCapabilities.getState()).toMatchObject({ canGenerate: false, canEdit: false });
});
