import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useLLMConfig } from "../useLLMConfig";

vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: unknown) => unknown) =>
    select({
      setting: {
        llmUsageSettings: { chat: { providerId: "p", modelId: "model" } },
        llmProviders: [
          {
            id: "p",
            builtin: "provider",
            models: [
              {
                id: "model",
                name: "我的名称",
                contextWindow: 10_000,
                maxTokens: 1000,
              },
            ],
          },
        ],
      },
    }),
}));
vi.mock("@/services/llmCatalog", () => ({ loadCatalogModels: vi.fn() }));

it("目录升级后读取当前容量，不沿用添加模型时保存的旧值，保留显示名称", async () => {
  const client = new QueryClient();
  client.setQueryData(
    ["llm", "catalog", "provider"],
    [
      {
        id: "model",
        contextWindow: 200_000,
        maxTokens: 20_000,
      },
    ]
  );
  let result: ReturnType<typeof useLLMConfig>;
  function Probe() {
    result = useLLMConfig("chat");
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>
      );
    });
    expect(result!.model).toMatchObject({
      id: "model",
      name: "我的名称",
      contextWindow: 200_000,
      maxTokens: 20_000,
    });
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
