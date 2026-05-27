import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useSearchWarmUp from "../useSearchWarmUp";
import {
  embeddingModelHealth,
  isEmbeddingModelDownloaded,
} from "@/commands/embedding-model";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";
import { searchContent } from "@/utils/search";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const modelInfo = {
  configId: "local-python",
  providerType: "local_python" as const,
  model: "bge-m3",
  distance: 0.4,
  dimensions: 1024,
  batchSize: 8,
  devicePolicy: "cpu" as const,
  localModelDir: "/tmp/embedding-models",
};

vi.mock("@/hooks/useEmbeddingConfig", () => ({
  default: () => modelInfo,
}));

vi.mock("@/commands/embedding-model", () => ({
  embeddingModelHealth: vi.fn(async () => ({ success: true })),
  isEmbeddingModelDownloaded: vi.fn(async () => true),
}));

vi.mock("@/utils/search", () => ({
  searchContent: vi.fn(async () => []),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const HookHarness = () => {
  useSearchWarmUp();
  return null;
};

describe("useSearchWarmUp", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);
  const initialDatabaseStatus = {
    ...useGlobalStateStore.getState().databaseStatus,
  };

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        database: {
          ...state.setting.database,
          active: "data.db",
        },
      },
    }));
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {},
    }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    useSettingStore.setState((state) => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: { ...initialDatabaseStatus },
    }));
  });

  it("数据库未 ready 时不会提前触发预热搜索", async () => {
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "connecting",
      },
    }));

    await act(async () => {
      root.render(<HookHarness />);
      await flushPromises();
    });

    expect(isEmbeddingModelDownloaded).not.toHaveBeenCalled();
    expect(embeddingModelHealth).not.toHaveBeenCalled();
    expect(searchContent).not.toHaveBeenCalled();
  });

  it("数据库 ready 后先预热模型，再执行一次真实搜索", async () => {
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "connecting",
      },
    }));

    await act(async () => {
      root.render(<HookHarness />);
      await flushPromises();
    });

    expect(searchContent).not.toHaveBeenCalled();

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "ready",
        },
      }));
      await flushPromises();
    });

    expect(isEmbeddingModelDownloaded).toHaveBeenCalledWith("bge-m3");
    expect(embeddingModelHealth).toHaveBeenCalledWith("bge-m3", "cpu");
    expect(searchContent).toHaveBeenCalledWith({
      query: "__tau_search_warmup__",
      limit: 1,
      modelInfo,
    });

    const healthOrder =
      vi.mocked(embeddingModelHealth).mock.invocationCallOrder[0];
    const searchOrder = vi.mocked(searchContent).mock.invocationCallOrder[0];
    expect(searchOrder).toBeGreaterThan(healthOrder);
  });

  it("预热搜索失败后不会标记完成，后续 ready 变化会重试", async () => {
    vi.mocked(searchContent)
      .mockRejectedValueOnce(new Error("No database name found"))
      .mockResolvedValueOnce([]);

    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "ready",
      },
    }));

    await act(async () => {
      root.render(<HookHarness />);
      await flushPromises();
    });

    expect(searchContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "reconnecting",
        },
      }));
    });

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "ready",
        },
      }));
      await flushPromises();
    });

    expect(searchContent).toHaveBeenCalledTimes(2);
  });
});
