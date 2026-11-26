import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    listTemplates: vi.fn(),
    describeTarget: vi.fn(async () => ({ basePath: "/", publicUrl: "" })),
    checkConnection: vi.fn(),
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
  describePublishTarget: mocks.describeTarget,
  checkPublishConnection: mocks.checkConnection,
  savePublishPluginConfig: vi.fn(),
}));
vi.mock("@/commands", () => ({}));

import { usePublishConfig, type PublishConfig } from "../usePublishConfig";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import useSettingStore from "@/stores/useSettingStore";

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

it("在途连接检测跨语言沿用配置与请求，不重查模板或覆盖站点草稿", async () => {
  const originalSetting = useSettingStore.getState().setting;
  let resolve!: (value: boolean) => void;
  const pending = new Promise<boolean>(done => {
    resolve = done;
  });
  mocks.listTemplates.mockResolvedValue([template("1.3.0")]);
  mocks.checkConnection.mockReturnValue(pending);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let config: PublishConfig | undefined;
  const getConfig = () => {
    if (!config) throw new Error("publish config not mounted");
    return config;
  };
  function Probe() {
    config = usePublishConfig();
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>
      )
    );
    await act(async () =>
      vi.waitFor(() => expect(config?.templateOptions.length).toBeGreaterThan(0))
    );
    act(() => getConfig().setSiteField("title", "未发布的原始站点标题"));
    const request = getConfig().request;
    const providerConfig = getConfig().providerConfig;
    const setting = useSettingStore.getState().setting;
    const templateReads = mocks.listTemplates.mock.calls.length;
    const targetReads = mocks.describeTarget.mock.calls.length;
    let check!: Promise<void>;
    act(() => {
      check = getConfig().checkConnection();
    });
    const checks = mocks.checkConnection.mock.calls.length;
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(getConfig().request).toBe(request);
      expect(getConfig().providerConfig).toBe(providerConfig);
      expect(getConfig().connection).toBe("checking");
      expect(useSettingStore.getState().setting).toBe(setting);
      expect(getConfig().publish.site.title).toBe("未发布的原始站点标题");
      expect(mocks.listTemplates).toHaveBeenCalledTimes(templateReads);
      expect(mocks.describeTarget).toHaveBeenCalledTimes(targetReads);
      expect(mocks.checkConnection).toHaveBeenCalledTimes(checks);
    }
    expect(mocks.checkConnection).toHaveBeenLastCalledWith(request);
    await act(async () => {
      resolve(true);
      await check;
    });
    expect(getConfig().connection).toBe("ok");
  } finally {
    act(() => root.unmount());
    client.clear();
    desktopLocaleSource.setLocale("zh-CN");
    useSettingStore.setState({ setting: originalSetting });
  }
});
