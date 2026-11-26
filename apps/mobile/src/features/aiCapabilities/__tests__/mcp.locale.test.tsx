import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CustomMcpServer } from "../../../types";
import { RouterProvider, definePage, getNavigator } from "../../../router";
import { PageInstanceProvider } from "../../../router/pageLifecycle";
import { mobileI18n, mobileLocaleSource } from "../../../services/i18n";
import { McpServerPage } from "../McpServerPage";
import { mcpTranslator } from "../mcp.i18n";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  connect: vi.fn(),
  capabilities: vi.fn(),
  apply: vi.fn(),
  setting: { database: { active: "mcp-original.db" }, mcpServers: [] as CustomMcpServer[] },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.native }));
vi.mock("../../../services/aiChat/chatController", () => ({
  chatCapabilities: mocks.capabilities,
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({
    syncSettings: { safeSetting: mocks.setting, updateSetting: mocks.apply },
    bootstrap: {},
  }),
}));
definePage({ key: "mcp-locale-test-root", params: {}, component: () => null });
const saved: CustomMcpServer = {
  id: "original-server",
  name: "用户服务器原名",
  url: "https://example.com/original",
  enabled: true,
  headerNames: ["X-Client"],
};
const locales = ["zh-TW", "en-US"] as const;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
    node => node.textContent?.trim() === text
  );
const input = (key: "server.name" | "server.url") =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${mcpTranslator.t(key)}"]`);
const edit = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
function PageContext({ serverId }: { serverId?: string }) {
  return (
    <PageInstanceProvider
      value={{
        entry: {
          id: "mcp-server-locale",
          key: "aiMcpServer",
          params: {},
          createdAt: 1,
          lastActiveAt: 1,
        },
        params: {},
        navigator: getNavigator(),
        phase: "active",
        transition: { seq: 0, type: null },
      }}
    >
      <McpServerPage serverId={serverId} />
    </PageInstanceProvider>
  );
}
const render = (serverId?: string) =>
  act(() =>
    root.render(
      <I18nRuntimeProvider runtime={mobileI18n}>
        <QueryClientProvider client={client}>
          <RouterProvider rootKey="mcp-locale-test-root">
            <PageContext serverId={serverId} />
          </RouterProvider>
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
beforeEach(() => {
  vi.clearAllMocks();
  mobileLocaleSource.setLocale("zh-CN");
  mocks.setting = { database: { active: "mcp-original.db" }, mcpServers: [] };
  mocks.apply.mockImplementation(update => {
    mocks.setting = update(mocks.setting);
  });
  mocks.capabilities.mockResolvedValue({ mcp: { connect: mocks.connect } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  host.remove();
  mobileLocaleSource.setLocale("zh-CN");
});

it("校验与连接在途跨语言保留原名称地址和请求头，不自动提交或重新连接", async () => {
  const native = deferred<CustomMcpServer[]>();
  const connecting = deferred<never>();
  mocks.native.mockReturnValue(native.promise);
  mocks.connect.mockReturnValue(connecting.promise);
  render();
  const name = input("server.name"),
    url = input("server.url"),
    headers = host.querySelector("textarea");
  if (!name || !url || !headers) throw new Error("MCP form missing");
  await edit(name, " 用户服务器 ");
  await edit(url, "ftp://example.com/original");
  await edit(headers, "invalid header");
  await act(async () => byText(mcpTranslator.t("add"))?.click());
  expect(url.getAttribute("aria-invalid")).toBe("true");
  name.focus();
  name.setSelectionRange(1, 3);
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(input("server.name")).toBe(name);
    expect(input("server.url")).toBe(url);
    expect(host.querySelector("textarea")).toBe(headers);
    expect([name.value, url.value, headers.value]).toEqual([
      " 用户服务器 ",
      "ftp://example.com/original",
      "invalid header",
    ]);
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([1, 3]);
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  }
  await edit(url, "https://example.com/original");
  await edit(headers, "X-Client: original-value");
  await act(async () => byText(mcpTranslator.t("add"))?.click());
  await act(async () => vi.waitFor(() => expect(mocks.native).toHaveBeenCalledOnce()));
  const mutation = mocks.native.mock.calls[0][1].mutation;
  expect(mutation).toEqual({
    kind: "upsert",
    server: { id: expect.any(String), name: "用户服务器", url: "https://example.com/original" },
    headers: { "X-Client": "original-value" },
  });
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(headers.value).toBe("X-Client: original-value");
  }
  await act(async () =>
    native.resolve([{ ...saved, id: mutation.server.id, name: mutation.server.name }])
  );
  expect(mocks.connect).toHaveBeenCalledExactlyOnceWith(
    "mcp-original.db",
    {
      id: `custom:${mutation.server.id}`,
      name: "用户服务器",
      transport: { type: "streamable-http", url: "https://example.com/original" },
    },
    undefined,
    mutation.server.id
  );
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(headers.value).toBe("X-Client: original-value");
  }
  const diagnostic = new Error("backend diagnostic, preserve verbatim");
  await act(async () => connecting.reject(diagnostic));
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(diagnostic.message);
    expect(input("server.name")).toBe(name);
    expect(name.value).toBe(" 用户服务器 ");
    expect(headers.value).toBe("X-Client: original-value");
    expect(mocks.native).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
  }
});

it("编辑保留既有请求头，删除确认跨语言保留原服务器目标且不提前删除", async () => {
  mocks.setting = { ...mocks.setting, mcpServers: [saved] };
  mocks.native.mockResolvedValue([saved]);
  mocks.connect.mockResolvedValue({ id: `custom:${saved.id}`, status: "connected", toolIds: [] });
  render(saved.id);
  const name = input("server.name");
  if (!name) throw new Error("name input missing");
  await edit(name, "改过的服务器原名");
  await act(async () => byText(mcpTranslator.t("save"))?.click());
  await act(async () => vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce()));
  expect(mocks.native).toHaveBeenCalledWith("ai_mcp_servers_mutate", {
    mutation: {
      kind: "upsert",
      server: { id: saved.id, name: "改过的服务器原名", url: saved.url },
    },
  });
  mocks.native.mockClear();
  await act(async () => byText(mcpTranslator.t("server.delete"))?.click());
  const confirm = byText(mcpTranslator.t("delete"));
  if (!confirm) throw new Error("delete confirmation missing");
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(byText(mcpTranslator.t("delete"))).toBe(confirm);
    expect(mocks.native).not.toHaveBeenCalled();
  }
  const removing = deferred<CustomMcpServer[]>();
  mocks.native.mockReturnValue(removing.promise);
  await act(async () => confirm.click());
  await act(async () => vi.waitFor(() => expect(mocks.native).toHaveBeenCalledOnce()));
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(mocks.native).toHaveBeenCalledExactlyOnceWith("ai_mcp_servers_mutate", {
      mutation: { kind: "remove", id: saved.id },
    });
  }
  await act(async () => removing.resolve([]));
});
