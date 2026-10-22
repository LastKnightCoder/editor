import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    listTemplates: vi.fn(),
    runtime: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getRevision: () => revision,
      listSettings: () => [],
      bump() {
        revision++;
        listeners.forEach(listener => listener());
      },
    },
  };
});
vi.mock("@/app/plugins/context", () => ({ useDesktopPlugins: () => mocks.runtime }));
vi.mock("@/commands/publish", () => ({
  listPublishTemplates: mocks.listTemplates,
  describePublishTarget: vi.fn(async () => ({ basePath: "/", publicUrl: "" })),
  checkPublishConnection: vi.fn(),
  savePublishPluginConfig: vi.fn(),
}));
vi.mock("@/commands", () => ({}));

import { usePublishConfig, type PublishConfig } from "../usePublishConfig";

const template = (version: string) => ({
  id: "tau.blog",
  name: "Tau 博客",
  version,
  template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
});

let container: HTMLDivElement | undefined;
const settle = async () => {
  for (let index = 0; index < 5; index++)
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
};
afterEach(() => container?.remove());

it("插件变更后重新读取模板列表，不等缓存过期", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.listTemplates.mockResolvedValueOnce([template("1.2.2")]);
  mocks.listTemplates.mockResolvedValueOnce([template("1.3.0")]);
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false } },
  });
  let config: PublishConfig | undefined;
  function Probe() {
    config = usePublishConfig();
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
  );
  await settle();
  expect(config!.templateOptions.map(option => option.label)).toEqual(["Tau 博客 · 1.2.2"]);
  act(() => mocks.runtime.bump());
  await settle();
  expect(config!.templateOptions.map(option => option.label)).toEqual(["Tau 博客 · 1.3.0"]);
  expect(mocks.listTemplates).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});
