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
import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import { SiteSettingsDrawer } from "../views/SiteSettingsDrawer";
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: vi.fn() }));

const template = (version: string) => ({
  manifest: {
    id: "tau.blog",
    name: "Tau 博客",
    version,
    template: { protocolVersion: 1, root: "site", entries: ["index.html"] },
  },
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

it("模板字段真实抽屉换语保留输入选区、选项业务值与在途连接，不重新读取或写配置", async () => {
  const originalSetting = useSettingStore.getState().setting;
  const messages = {
    fallbackLocale: "zh-CN",
    resources: {
      "zh-CN": { field: "cn-field", hint: "cn-hint", option: "cn-option" },
      "zh-TW": { field: "tw-field", hint: "tw-hint", option: "tw-option" },
      "en-US": { field: "en-field", hint: "en-hint", option: "en-option" },
    },
  };
  const listing = { ...template("1.3.0"), messages };
  const fields = [
    {
      key: "tagline",
      type: "text",
      label: { kind: "i18n", key: "field" },
      description: { kind: "i18n", key: "hint" },
      placeholder: { kind: "i18n", key: "hint" },
      default: "原默认正文",
    },
    {
      key: "layout",
      type: "select",
      label: "User fixed label",
      options: [{ value: "raw-option", label: { kind: "i18n", key: "option" } }],
      default: "raw-option",
    },
  ];
  mocks.listTemplates.mockResolvedValue([
    {
      ...listing,
      manifest: {
        ...listing.manifest,
        template: { ...listing.manifest.template, siteFields: fields },
      },
    },
  ]);
  let resolve!: (value: boolean) => void;
  mocks.checkConnection.mockReturnValue(
    new Promise<boolean>(done => {
      resolve = done;
    })
  );
  useSettingStore.setState({
    setting: {
      ...originalSetting,
      publish: {
        ...originalSetting.publish,
        active: EPublishProvider.Local,
        site: {
          ...originalSetting.publish.site,
          templateId: "tau.blog",
          fields: {
            ...originalSetting.publish.site.fields,
            "tau.blog": { tagline: "原始草稿 selection", layout: "raw-option" },
          },
        },
      },
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  let config: PublishConfig | undefined;
  const close = vi.fn();
  function Probe() {
    config = usePublishConfig();
    return <SiteSettingsDrawer open config={config} onClose={close} />;
  }
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const getConfig = () => {
    if (!config) throw new Error("Missing config");
    return config;
  };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>
      )
    );
    await act(async () =>
      vi.waitFor(() => expect(getConfig().templateFields.length).toBeGreaterThan(0))
    );
    const input = [...document.querySelectorAll("input")].find(
      node => node.value === "原始草稿 selection"
    );
    if (!input) throw new Error("Missing actual template input");
    act(() => {
      input.focus();
      input.setSelectionRange(2, 8, "backward");
    });
    const request = getConfig().request,
      setting = useSettingStore.getState().setting;
    const boundFields = getConfig().templateFields,
      boundValues = getConfig().templateFieldValues;
    const optionField = boundFields.find(field => field.type === "select");
    if (!optionField || optionField.type !== "select") throw new Error("Missing select");
    const options = optionField.options;
    const reads = mocks.listTemplates.mock.calls.length,
      targets = mocks.describeTarget.mock.calls.length;
    let check!: Promise<void>;
    act(() => {
      check = getConfig().checkConnection();
    });
    const checks = mocks.checkConnection.mock.calls.length;
    const originalLabel = input.getAttribute("aria-label");
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.activeElement).toBe(input);
      expect(input.isConnected).toBe(true);
      expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
        2,
        8,
        "backward",
      ]);
      expect(input.value).toBe("原始草稿 selection");
      expect(input.getAttribute("aria-label")).toBe(getConfig().templateFields[0].label);
      expect(input.getAttribute("aria-label")).not.toBe(originalLabel);
      expect(getConfig().templateFields).toBe(boundFields);
      expect(optionField.options).toBe(options);
      expect(getConfig().templateFieldValues).toBe(boundValues);
      expect(getConfig().request).toBe(request);
      expect(getConfig().connection).toBe("checking");
      expect(useSettingStore.getState().setting).toBe(setting);
      expect(mocks.listTemplates).toHaveBeenCalledTimes(reads);
      expect(mocks.describeTarget).toHaveBeenCalledTimes(targets);
      expect(mocks.checkConnection).toHaveBeenCalledTimes(checks);
    }
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
