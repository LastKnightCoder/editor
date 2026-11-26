import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
const commands = vi.hoisted(() => ({
  decidePairPrompt: vi.fn(async () => {}),
  getPendingPairPrompts: vi.fn(async () => []),
  getBrowserCompanionSnapshot: vi.fn(),
  revokeBrowserClient: vi.fn(async () => undefined),
  setAcceptNewBrowserClients: vi.fn(async () => undefined),
  setBrowserClientScopes: vi.fn(async () => undefined),
}));
const sent = vi.hoisted(() => [] as unknown[][]);

vi.mock("@/electron", () => ({
  on: (channel: string, listener: (...args: unknown[]) => void) => listeners.set(channel, listener),
  off: (channel: string) => listeners.delete(channel),
  send: (...args: unknown[]) => sent.push(args),
}));
vi.mock("@/commands/browser-companion", () => commands);
vi.mock("@/commands/window", () => ({ showAndFocusWindow: vi.fn(async () => {}) }));
vi.mock("@/services/open-content", () => ({ openContent: vi.fn() }));
const navigation = vi.hoisted(() => ({ openPage: vi.fn() }));
vi.mock("@/services/page-navigation", () => navigation);
vi.mock("@/services/browserBridgeRenderer", () => ({ installBrowserBridgeRenderer: vi.fn() }));

import { BrowserCompanionHost } from "../BrowserCompanionHost";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { browserCompanionTranslator } from "../i18n";
import { BrowserExtensionSection } from "@/features/settings/sections/BrowserExtensionSection";
import type { BrowserCompanionSnapshot } from "@/types/browser-companion";
import { rejectionText } from "../labels";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  listeners.clear();
  sent.length = 0;
  vi.clearAllMocks();
});

const prompt = {
  requestId: "req-1",
  info: { browser: "Chrome", os: "macOS", version: "0.1.0" },
  origin: `chrome-extension://${"a".repeat(32)}`,
  code: "4827",
  requestedAt: 0,
};

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find(button => button.textContent === text);

it("主进程推来配对请求时弹窗显示校验码，「使用 Tau 里的工具」默认勾选，取消后只带必需权限", async () => {
  await act(async () => root.render(<BrowserCompanionHost />));
  expect(sent.some(([channel]) => channel === "browser-companion:appearance")).toBe(true);
  await act(async () => listeners.get("browser-companion:pair-prompt")!({}, prompt));
  expect(document.body.textContent).toContain("Chrome 想连接到 Tau");
  expect(document.querySelector('[aria-label="校验码 4827"]')).not.toBeNull();

  const tools = document.querySelector<HTMLButtonElement>('[aria-label="使用 Tau 里的工具"]');
  await act(async () => tools!.click());
  await act(async () => buttonByText("允许连接")!.click());
  expect(commands.decidePairPrompt).toHaveBeenCalledWith("req-1", true, [
    "chat",
    "annotations",
    "notes",
  ]);
});

it("拒绝时也带上当前勾选；主进程撤回的请求不再显示", async () => {
  await act(async () => root.render(<BrowserCompanionHost />));
  await act(async () => listeners.get("browser-companion:pair-prompt")!({}, prompt));
  await act(async () => buttonByText("拒绝")!.click());
  expect(commands.decidePairPrompt).toHaveBeenCalledWith("req-1", false, [
    "chat",
    "annotations",
    "notes",
    "tools",
  ]);

  await act(async () =>
    listeners.get("browser-companion:pair-prompt")!({}, { ...prompt, requestId: "req-2" })
  );
  await act(async () => listeners.get("browser-companion:pair-closed")!({}, "req-2"));
  await act(async () => new Promise(resolve => setTimeout(resolve, 400)));
  expect(document.querySelector('[aria-label="校验码 4827"]')).toBeNull();
});

it("扩展里点「在 Tau 中查看」时打开网页对话页", async () => {
  await act(async () => root.render(<BrowserCompanionHost />));
  await act(async () =>
    listeners.get("browser-companion:open-chat")!({}, { url: "https://a.com/x", session: "s1" })
  );
  expect(navigation.openPage).toHaveBeenCalledWith("browser-chat", {
    url: "https://a.com/x",
    session: "s1",
  });
});

it("配对中换语保留权限选择、焦点与原始校验码，不重拉或提前裁决", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const current = { ...prompt, requestId: "locale-pair", code: "0042" };
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(<BrowserCompanionHost />);
    });
    const receive = listeners.get("browser-companion:pair-prompt");
    if (!receive) throw new Error("配对订阅未挂载");
    await act(async () => receive({}, current));
    const tools = document.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!tools) throw new Error("权限开关未挂载");
    await act(async () => {
      tools.click();
      tools.focus();
    });
    const appearance = [...sent];
    const subscriptions = [...listeners.entries()];
    const code = document.querySelector(
      `[aria-label="${browserCompanionTranslator.t("pair.code", { code: current.code })}"]`
    );
    if (!code) throw new Error("配对校验码未挂载");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('[role="switch"]')).toBe(tools);
      expect(tools.getAttribute("aria-checked")).toBe("false");
      expect(document.activeElement).toBe(tools);
      expect(code.textContent).toBe("0042");
      expect(
        document.querySelector(
          `[aria-label="${browserCompanionTranslator.t("pair.code", { code: current.code })}"]`
        )
      ).toBe(code);
      expect(commands.decidePairPrompt).not.toHaveBeenCalled();
      expect(commands.getPendingPairPrompts).toHaveBeenCalledTimes(1);
      expect(sent).toEqual(appearance);
      expect([...listeners.entries()]).toEqual(subscriptions);
    }
    const allow = buttonByText(browserCompanionTranslator.t("pair.allow"));
    if (!allow) throw new Error("允许连接动作未挂载");
    await act(async () => allow.click());
    expect(commands.decidePairPrompt).toHaveBeenCalledTimes(1);
    expect(commands.decidePairPrompt).toHaveBeenCalledWith("locale-pair", true, [
      "chat",
      "annotations",
      "notes",
    ]);
  } finally {
    await act(async () => {
      listeners.get("browser-companion:pair-closed")?.({}, current.requestId);
      desktopLocaleSource.setLocale(original);
    });
  }
});

it("授权设置换语保持查询与原始拒绝记录，不写权限或重拉；主动修改仍发送协议值", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const data: BrowserCompanionSnapshot = {
    acceptNew: true,
    online: [],
    clients: [
      {
        clientId: "browser-raw",
        info: prompt.info,
        origin: prompt.origin,
        scopes: ["chat", "annotations", "notes", "tools"],
        createdAt: 1,
        lastSeenAt: 2,
      },
    ],
    rejections: [
      { clientId: "old", label: "用户自定义浏览器", reason: "用户拒绝", at: 3 },
      {
        clientId: "new",
        label: "Custom",
        reason: "original diagnostic",
        reasonCode: "denied",
        at: 4,
      },
    ],
  };
  commands.getBrowserCompanionSnapshot.mockResolvedValue(data);
  await client.fetchQuery({
    queryKey: ["browser-companion", "snapshot"],
    queryFn: commands.getBrowserCompanionSnapshot,
  });
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(
        <QueryClientProvider client={client}>
          <BrowserExtensionSection />
        </QueryClientProvider>
      );
    });
    const acceptSwitch = () =>
      document.querySelector<HTMLButtonElement>(
        `[aria-label="${browserCompanionTranslator.t("settings.accept")}"]`
      );
    const toolsSwitch = () =>
      document.querySelector<HTMLButtonElement>(
        `[aria-label="${browserCompanionTranslator.t("settings.clientTools", { client: "Chrome · macOS", scope: browserCompanionTranslator.t("scope.tools.label") })}"]`
      );
    const accept = acceptSwitch(),
      tools = toolsSwitch();
    if (!accept || !tools) throw new Error("授权设置开关未挂载");
    tools.focus();
    const query = client.getQueryCache().getAll()[0];
    const subscriptions = [...listeners.entries()];
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(acceptSwitch()).toBe(accept);
      expect(toolsSwitch()).toBe(tools);
      expect(tools.getAttribute("aria-checked")).toBe("true");
      expect(document.activeElement).toBe(tools);
      expect(client.getQueryCache().getAll()).toEqual([query]);
      expect(query.state.data).toBe(data);
      expect(commands.getBrowserCompanionSnapshot).toHaveBeenCalledTimes(1);
      expect(commands.setAcceptNewBrowserClients).not.toHaveBeenCalled();
      expect(commands.setBrowserClientScopes).not.toHaveBeenCalled();
      expect(commands.revokeBrowserClient).not.toHaveBeenCalled();
      expect([...listeners.entries()]).toEqual(subscriptions);
      expect(rejectionText(data.rejections[0], browserCompanionTranslator.t)).toBe(
        data.rejections[0].reason
      );
    }
    expect(data.rejections[1].reason).toBe("original diagnostic");
    expect(data.rejections[1].reasonCode).toBe("denied");
    await act(async () => {
      tools.click();
      accept.click();
    });
    expect(commands.setBrowserClientScopes).toHaveBeenCalledExactlyOnceWith("browser-raw", [
      "chat",
      "annotations",
      "notes",
    ]);
    expect(commands.setAcceptNewBrowserClients).toHaveBeenCalledExactlyOnceWith(false);
  } finally {
    await act(async () => {
      root.render(null);
      desktopLocaleSource.setLocale(original);
    });
    client.clear();
  }
});
