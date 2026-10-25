import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
const commands = vi.hoisted(() => ({
  decidePairPrompt: vi.fn(async () => {}),
  getPendingPairPrompts: vi.fn(async () => []),
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
