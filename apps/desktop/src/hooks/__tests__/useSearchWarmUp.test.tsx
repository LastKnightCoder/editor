import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useSearchWarmUp from "../useSearchWarmUp";
import {
  embeddingModelHealth,
  isEmbeddingModelDownloaded,
} from "@/commands/embedding-model";
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
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("本地 embedding 已下载时先预热模型，再执行一次真实搜索", async () => {
    await act(async () => {
      root.render(<HookHarness />);
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
});
