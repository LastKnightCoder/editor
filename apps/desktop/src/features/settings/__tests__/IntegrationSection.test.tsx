import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { produce } from "immer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { IntegrationSection } from "../sections/IntegrationSection";

const mocks = vi.hoisted(() => ({
  getGithubUserInfo: vi.fn(),
  verifyMinimaxApiKey: vi.fn(),
  validateSession: vi.fn(),
  getBilibiliQRCode: vi.fn(),
}));

vi.mock("@/services/minimax", () => ({ verifyMinimaxApiKey: mocks.verifyMinimaxApiKey }));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
vi.mock("@/utils/github", () => ({ getGithubUserInfo: mocks.getGithubUserInfo }));
vi.mock("@/services/weread", () => ({ default: { validateSession: mocks.validateSession } }));
vi.mock("@/utils/bilibili", () => ({
  BilibiliQRCodeStatus: { SUCCESS: 0, EXPIRED: 86038, NOT_CONFIRMED: 86090, NOT_SCANNED: 86101 },
  checkBilibiliLogin: vi.fn(),
  checkBilibiliQRStatus: vi.fn(),
  extractCredentialsFromQR: vi.fn(),
  getBilibiliQRCode: mocks.getBilibiliQRCode,
}));

const initialSetting = structuredClone(useSettingStore.getState().setting);

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<IntegrationSection />));
const text = () => document.body.textContent ?? "";
const byLabel = <T extends HTMLElement>(label: string) =>
  document.body.querySelector<T>(`[aria-label="${label}"]`)!;
const buttonByText = (label: string) =>
  [...document.body.querySelectorAll("button")].find(b => b.textContent === label)!;
const typeInto = (input: HTMLInputElement, value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  useSettingStore.setState({
    setting: produce(structuredClone(initialSetting), draft => {
      draft.integration.webdav = {
        enabled: true,
        url: "https://dav.example.com/dav/",
        username: "tau",
        password: "secret",
      };
      draft.integration.weread.apiKey = "wrk-expired";
      draft.integration.weread.connectionStatus = "invalid";
      draft.integration.weread.statusReason = "API Key 已过期";
    }),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

it("渲染三组服务行与各自状态签", () => {
  render();
  for (const title of ["存储服务", "内容平台", "AI 平台"]) expect(text()).toContain(title);
  for (const name of ["WebDAV", "S3", "阿里云 OSS", "GitHub", "Bilibili", "YouTube", "微信读书"]) {
    expect(text()).toContain(name);
  }
  // WebDAV 已连接：身份信息 + 管理
  expect(text()).toContain("dav.example.com · tau");
  expect(byLabel("管理 WebDAV")).toBeTruthy();
  // 微信读书已失效：原因 + 重新校验
  expect(text()).toContain("已失效");
  expect(text()).toContain("API Key 已过期");
  expect(byLabel("重新校验 微信读书")).toBeTruthy();
  // 未连接服务
  expect(byLabel("连接 GitHub")).toBeTruthy();
  expect(byLabel("连接 Minimax")).toBeTruthy();
  expect(text()).toContain("未连接");
});

it("GitHub 弹层提交后调用校验接口并保存用户名邮箱", async () => {
  mocks.getGithubUserInfo.mockResolvedValue({ login: "octocat", email: "o@example.com" });
  render();
  act(() => byLabel("连接 GitHub").click());
  expect(text()).toContain("Personal Access Token");

  typeInto(byLabel<HTMLInputElement>("Personal Access Token"), "ghp_test");
  await act(async () => buttonByText("验证并连接").click());

  expect(mocks.getGithubUserInfo).toHaveBeenCalledWith("ghp_test");
  const github = useSettingStore.getState().setting.integration.github;
  expect(github).toMatchObject({
    enabled: true,
    token: "ghp_test",
    user: { name: "octocat", email: "o@example.com" },
  });
  expect(text()).toContain("@octocat · o@example.com");
});

it("YouTube 代理行内即时保存", () => {
  render();
  typeInto(byLabel<HTMLInputElement>("YouTube 代理"), "http://127.0.0.1:7890");
  expect(useSettingStore.getState().setting.integration.youtube.proxy).toBe(
    "http://127.0.0.1:7890"
  );
  expect(text()).toContain("已设代理");
});

it("WebDAV 已连接时可断开连接（二次确认）", () => {
  render();
  act(() => byLabel("管理 WebDAV").click());
  act(() => buttonByText("断开连接").click());
  act(() => buttonByText("断开").click());
  expect(useSettingStore.getState().setting.integration.webdav).toMatchObject({
    enabled: false,
    url: "",
  });
});
