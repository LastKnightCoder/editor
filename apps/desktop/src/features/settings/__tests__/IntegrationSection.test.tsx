import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { IntegrationSection } from "../sections/IntegrationSection";

const mocks = vi.hoisted(() => ({
  getGithubUserInfo: vi.fn(),
  getBilibiliQRCode: vi.fn(),
}));

vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
vi.mock("@/utils/github", () => ({ getGithubUserInfo: mocks.getGithubUserInfo }));
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
    setting: structuredClone(initialSetting),
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

it("保留存储和内容服务，移除重复语音集成入口", () => {
  render();
  for (const title of ["存储服务", "内容平台"]) expect(text()).toContain(title);
  expect(text()).not.toContain("AI 平台");
  expect(text()).not.toContain("Minimax");
  for (const name of ["S3", "GitHub", "Bilibili", "YouTube"]) {
    expect(text()).toContain(name);
  }
  expect(text()).not.toContain("WebDAV");
  expect(text()).not.toContain("阿里云 OSS");
  // 微信读书已改为插件，不在账号与连接里
  expect(text()).not.toContain("微信读书");
  // 未连接服务
  expect(byLabel("连接 GitHub")).toBeTruthy();
  expect(byLabel("连接 Minimax")).toBeNull();
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
