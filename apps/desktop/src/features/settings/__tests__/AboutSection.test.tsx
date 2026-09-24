import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { AboutSection } from "../sections/AboutSection";

const mocks = vi.hoisted(() => ({
  installCli: vi.fn(async () => ({ success: true })),
  openExternal: vi.fn(),
}));

vi.mock("@/commands", () => ({
  getVersions: vi.fn(async () => ({ app: "3.8.2" })),
  getCliStatus: vi.fn(async () => ({ installed: false, path: "" })),
  installCli: mocks.installCli,
  uninstallCli: vi.fn(),
  openExternal: mocks.openExternal,
}));
vi.mock("@/commands/updater", () => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  onInstallFailed: vi.fn(),
  onUpdateDownloadProgress: vi.fn(),
  onUpdateDownloaded: vi.fn(),
  onUpdateError: vi.fn(),
}));
vi.mock("@/platform", () => ({ platform: { os: "darwin" } }));

let container: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(<AboutSection />));
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("有可用更新：版本、状态签、下载更新与手动下载", async () => {
  const download = vi.fn(async () => {});
  useUpdateStore.setState({
    status: "available",
    newVersion: "3.9.0",
    fallbackUrl: "https://example.com/tau",
    download,
  });
  await render();
  expect(text()).toContain("Tau");
  expect(text()).toContain("v3.8.2");
  expect(text()).toContain("v3.9.0 可更新");
  expect(text()).toContain("自动检查更新");
  await act(async () => button("下载更新").click());
  expect(download).toHaveBeenCalled();
  await act(async () => button("手动下载").click());
  expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/tau");
});

it("下载中显示进度，命令行工具可安装", async () => {
  useUpdateStore.setState({ status: "downloading", newVersion: "3.9.0", progress: 42 });
  await render();
  expect(text()).toContain("正在下载 42%");
  expect(button("检查更新")).toBeUndefined();
  expect(text()).toContain("命令行工具");
  expect(text()).toContain("未安装");
  await act(async () => button("安装").click());
  expect(mocks.installCli).toHaveBeenCalled();
});
