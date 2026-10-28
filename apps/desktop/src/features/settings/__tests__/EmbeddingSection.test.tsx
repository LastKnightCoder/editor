import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { EmbeddingSection } from "../sections/EmbeddingSection";

// jsdom 的 AbortSignal 可能缺 timeout，确认框探测路径依赖它
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("timeout")), ms);
    return controller.signal;
  };
}

const mocks = vi.hoisted(() => ({
  sections: [] as unknown[],
  models: { success: true, data: [] as unknown[] },
  indexStatus: {} as Record<string, unknown>,
  execute: vi.fn(),
  openProviderSettings: vi.fn(),
  openPage: vi.fn(),
  closeSettings: vi.fn(),
}));

vi.mock("@/commands", () => ({
  getEmbeddingModels: vi.fn(async () => mocks.models),
  downloadEmbeddingModel: vi.fn(async () => ({ success: true })),
  cancelEmbeddingDownload: vi.fn(async () => ({ success: true })),
  deleteEmbeddingModel: vi.fn(async () => ({ success: true })),
  embeddingModelHealth: vi.fn(async () => ({ success: true, health: { loaded: true } })),
  getEmbeddingIndexStatus: vi.fn(async () => mocks.indexStatus),
  startEmbeddingIndex: vi.fn(async () => ({ started: true })),
  onEmbeddingDownloadProgress: () => () => undefined,
  onEmbeddingIndexProgress: () => () => undefined,
}));
vi.mock("@/app/plugins/context", () => ({
  useDesktopPlugins: () => ({ listSettings: () => mocks.sections }),
}));
vi.mock("@/app/plugins/embeddings-registry", () => ({
  rendererEmbeddingsRegistry: { execute: mocks.execute },
}));
vi.mock("@/services/open-provider-settings", () => ({
  openProviderSettings: mocks.openProviderSettings,
}));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ closeSettings: mocks.closeSettings }) },
}));

const counts = { total: 0, indexed: 0, outdated: 0, unindexed: 0 };
const localModel = {
  name: "bge-m3",
  label: "BGE-M3",
  description: "通用向量模型",
  size: "1.2 GB",
  dimensions: 1024,
  downloaded: true,
  modelscope: "",
  huggingface: "",
};
const pluginSection = {
  key: "plugin:test.embed:connection",
  mountId: 1,
  context: { pluginId: "test.embed" },
  definition: {
    id: "connection",
    title: "测试嵌入",
    target: "embeddings",
    form: {
      groups: [{ title: "连接", fields: [{ key: "apiKey", label: "API Key", type: "secret" }] }],
    },
    models: [{ id: "m1", label: "嵌入一号", dimensions: 512 }],
  },
};

let container: HTMLDivElement;
let root: Root;
const previous = useSettingStore.getState().setting;
const render = () =>
  act(async () =>
    root.render(
      <UiProvider>
        <EmbeddingSection />
      </UiProvider>
    )
  );
const text = () => container.textContent ?? "";
const bodyText = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === label)!;
const bodyButton = (label: string) =>
  [...document.body.querySelectorAll("button")].find(
    node => node.textContent?.trim() === label
  ) as HTMLButtonElement;
/** 本地模型行（rounded-tau-sm 自定义行）与插件行（SettingRow）都可能出「设为当前」，按所在行标题定位 */
const activateButton = (rowTitle: string) =>
  [...container.querySelectorAll("button")].find(
    node =>
      node.textContent?.trim() === "设为当前" &&
      (node.closest(".rounded-tau-sm")?.textContent.includes(rowTitle) ||
        node.closest(".min-h-14")?.textContent.includes(rowTitle))
  )! as HTMLButtonElement;

beforeEach(() => {
  mocks.sections = [];
  mocks.models = { success: true, data: [structuredClone(localModel)] };
  mocks.indexStatus = {
    mainDbName: "main",
    configValid: false,
    provider: null,
    pluginId: null,
    model: null,
    autoIndex: true,
    providerReady: true,
    stats: { ...counts, byType: {} },
    running: null,
    lastRun: null,
    rebuildState: null,
  };
  mocks.execute.mockReset();
  mocks.openProviderSettings.mockReset();
  mocks.openPage.mockReset();
  mocks.closeSettings.mockReset().mockReturnValue(undefined);
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      embedding: {
        active: null,
        local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
        plugins: {},
      },
    },
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useSettingStore.setState({ setting: previous });
});

it("无 active 时空态提示未启用，挂载与浏览不写 active", async () => {
  await render();
  expect(text()).toContain("尚未启用嵌入模型");
  expect(text()).toContain("获取更多嵌入模型");
  expect(useSettingStore.getState().setting.embedding.active).toBeNull();
});

it("本地已下载模型：确认后写入 active，取消不写", async () => {
  await render();
  await act(async () => activateButton("BGE-M3").click());
  expect(bodyText()).toContain("启用嵌入模型");
  await act(async () => bodyButton("取消").click());
  expect(useSettingStore.getState().setting.embedding.active).toBeNull();

  await act(async () => activateButton("BGE-M3").click());
  await act(async () => bodyButton("启用").click());
  expect(useSettingStore.getState().setting.embedding.active).toEqual({
    provider: "local",
    model: "bge-m3",
    dimensions: 1024,
  });
});

it("已有 active 时切换为危险确认：展示清除数量与两侧模型", async () => {
  mocks.indexStatus = {
    ...mocks.indexStatus,
    stats: {
      ...counts,
      total: 130,
      indexed: 120,
      outdated: 5,
      unindexed: 5,
      byType: {
        card: { ...counts },
        article: { ...counts },
        "project-item": { ...counts },
        "diary-moment": { ...counts },
        excerpt: { ...counts },
        "pdf-annotation": { ...counts },
        "web-clip": { ...counts },
        "plugin-entity": { ...counts },
      },
    },
  };
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      embedding: {
        ...state.setting.embedding,
        active: { provider: "local", model: "bge-small", dimensions: 512 },
      },
    },
  }));
  await render();
  await act(async () => activateButton("BGE-M3").click());
  expect(bodyText()).toContain("切换嵌入模型");
  expect(bodyText()).toContain("当前：bge-small → 切换为：BGE-M3");
  expect(bodyText()).toContain("将清除 120 条已建立的索引");
  expect(bodyButton("清除索引并切换")).toBeTruthy();
});

it("插件未配置时模型行不可设为当前，配置入口跳插件页", async () => {
  mocks.sections = [pluginSection];
  await render();
  expect(activateButton("嵌入一号").disabled).toBe(true);
  await act(async () => button("去配置").click());
  expect(mocks.openProviderSettings).toHaveBeenCalledWith(
    "test.embed",
    "plugin:test.embed:connection",
    "embedding"
  );
});

it("插件探测失败：对话框保留并显示错误，active 不变", async () => {
  mocks.sections = [pluginSection];
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      embedding: {
        ...state.setting.embedding,
        plugins: { "test.embed": { config: { apiKey: "key" } } },
      },
    },
  }));
  mocks.execute.mockRejectedValueOnce(new Error("连接超时"));
  await render();
  await act(async () => activateButton("嵌入一号").click());
  await act(async () => bodyButton("启用").click());
  expect(bodyText()).toContain("连接超时");
  expect(bodyText()).toContain("启用嵌入模型");
  expect(mocks.execute).toHaveBeenCalledWith(
    expect.objectContaining({ pluginId: "test.embed", modelId: "m1" }),
    expect.any(AbortSignal)
  );
  expect(useSettingStore.getState().setting.embedding.active).toBeNull();
});

it("插件探测成功：以实测维度写入 active", async () => {
  mocks.sections = [pluginSection];
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      embedding: {
        ...state.setting.embedding,
        plugins: { "test.embed": { config: { apiKey: "key" } } },
      },
    },
  }));
  mocks.execute.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
  await render();
  await act(async () => activateButton("嵌入一号").click());
  await act(async () => bodyButton("启用").click());
  expect(useSettingStore.getState().setting.embedding.active).toEqual({
    provider: "plugin",
    pluginId: "test.embed",
    model: "m1",
    dimensions: 3,
  });
});
