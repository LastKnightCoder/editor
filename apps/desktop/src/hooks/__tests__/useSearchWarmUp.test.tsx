import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useSearchWarmUp from "../useSearchWarmUp";
import { embeddingModelHealth, isEmbeddingModelDownloaded } from "@/commands/embedding-model";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";
import { searchContent } from "@/utils/search";

const modelInfo = {
  provider: "local" as const,
  model: "bge-m3",
  distance: 0.6,
  dimensions: 1024,
  batchSize: 8,
  devicePolicy: "cpu" as const,
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

// 预热带 0~1500ms 随机抖动（多窗口错峰），用 fake timers 推过抖动窗口再断言；
// 先空推一拍让 effect 完成注册，避免与 timer 注册竞态
const flushPromises = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2_000);
};

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
  // 预热只在主窗口跑（process.argv 的 --tau-window-role=main），测试模拟主窗口身份
  let argvSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue(["--tau-window-role=main"]);
    vi.clearAllMocks();
    useSettingStore.setState(state => ({
      ...state,
      setting: {
        ...state.setting,
        database: {
          ...state.setting.database,
          active: "data.db",
        },
      },
    }));
    useGlobalStateStore.setState(state => ({
      ...state,
      databaseStatus: {},
    }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    argvSpy.mockRestore();
    vi.useRealTimers();
    container.remove();
    useSettingStore.setState(state => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
    useGlobalStateStore.setState(state => ({
      ...state,
      databaseStatus: { ...initialDatabaseStatus },
    }));
  });

  it("数据库未 ready 时不会提前触发预热搜索", async () => {
    useGlobalStateStore.setState(state => ({
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
    useGlobalStateStore.setState(state => ({
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
      useGlobalStateStore.setState(state => ({
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

    const healthOrder = vi.mocked(embeddingModelHealth).mock.invocationCallOrder[0];
    const searchOrder = vi.mocked(searchContent).mock.invocationCallOrder[0];
    expect(searchOrder).toBeGreaterThan(healthOrder);
  });

  it("预热搜索失败后不会标记完成，后续 ready 变化会重试", async () => {
    vi.mocked(searchContent)
      .mockRejectedValueOnce(new Error("No database name found"))
      .mockResolvedValueOnce([]);

    useGlobalStateStore.setState(state => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "ready",
      },
    }));

    await act(async () => {
      root.render(<HookHarness />);
    });
    await act(async () => {
      await flushPromises();
    });

    expect(searchContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGlobalStateStore.setState(state => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "reconnecting",
        },
      }));
    });

    await act(async () => {
      useGlobalStateStore.setState(state => ({
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
