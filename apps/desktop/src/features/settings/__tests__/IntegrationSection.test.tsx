import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { IntegrationSection } from "../sections/IntegrationSection";

const mocks = vi.hoisted(() => ({
  getBilibiliQRCode: vi.fn(),
}));

vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
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

it("集成页只保留现役内容服务，GitHub 与 S3 发布账号归插件", () => {
  render();
  for (const name of ["Bilibili", "YouTube", "内容平台"]) expect(text()).toContain(name);
  for (const name of ["存储服务", "GitHub", "S3", "WebDAV", "阿里云 OSS", "微信读书", "Minimax"])
    expect(text()).not.toContain(name);
  expect(byLabel("连接 GitHub")).toBeNull();
  expect(useSettingStore.getState().setting.integration).not.toHaveProperty("github");
  expect(useSettingStore.getState().setting.integration).not.toHaveProperty("s3");
});

it("YouTube 代理行内即时保存", () => {
  render();
  typeInto(byLabel<HTMLInputElement>("YouTube 代理"), "http://127.0.0.1:7890");
  expect(useSettingStore.getState().setting.integration.youtube.proxy).toBe(
    "http://127.0.0.1:7890"
  );
  expect(text()).toContain("已设代理");
});
