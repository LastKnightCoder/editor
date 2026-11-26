import { desktopLocaleSource } from "@/app/i18n/runtime";
import { getVersions } from "@/commands";
import { backgroundPreferenceCommands } from "@/commands/contracts/background-preferences";
import { ReleaseNotesDialog } from "@/features/release-notes/ReleaseNotesDialog";
import { useReleaseNotesStore } from "@/features/release-notes/releaseNotesStore";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { AboutSection } from "../sections/AboutSection";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
}));

vi.mock("@/commands", () => ({
  getVersions: vi.fn(async () => ({ app: "3.8.2" })),
  openExternal: mocks.openExternal,
}));
vi.mock("@/commands/updater", () => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  onUpdateDownloadProgress: vi.fn(),
  onUpdateDownloaded: vi.fn(),
  onUpdateError: vi.fn(),
}));
vi.mock("@/commands/contracts/background-preferences", () => ({
  backgroundPreferenceCommands: {
    read: {
      call: vi.fn(async () => ({
        openAtLogin: false,
        keepBackground: true,
        startHidden: false,
        loginStatus: null,
        trayAvailable: true,
      })),
    },
  },
}));
vi.mock("@/platform", () => ({ platform: { os: "darwin" } }));

let container: HTMLDivElement;
let root: Root;
const render = () =>
  act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <AboutSection />
      </QueryClientProvider>
    )
  );
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("有可用更新：状态签、立即更新、手动下载与新版本内容入口", async () => {
  const download = vi.fn(async () => {});
  useUpdateStore.setState({
    status: "available",
    newVersion: "3.9.0",
    fallbackUrl: "https://example.com/tau",
    releaseNotes: [{ version: "3.9.0", note: "## 新特性" }],
    download,
  });
  await render();
  expect(text()).toContain("Tau");
  expect(text()).toContain("v3.8.2");
  expect(text()).toContain("v3.9.0 可更新");
  expect(text()).toContain("自动检查更新");
  expect(text()).toContain("电脑开机后自动启动 Tau");
  expect(text()).toContain("新版本更新内容");
  await act(async () => button("立即更新").click());
  expect(download).toHaveBeenCalled();
  await act(async () => button("手动下载").click());
  expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/tau");
});

it("下载中显示进度", async () => {
  useUpdateStore.setState({ status: "downloading", newVersion: "3.9.0", progress: 42 });
  await render();
  expect(text()).toContain("正在下载 42%");
  expect(button("检查更新")).toBeUndefined();
});

it("切换语言保留下载状态与公告载荷，不检查、下载、安装或重新读取版本", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const check = vi.fn(),
    download = vi.fn(),
    install = vi.fn();
  const notes = [{ version: "3.9.0", note: "# 原始公告正文" }];
  useUpdateStore.setState({
    status: "downloading",
    newVersion: "3.9.0",
    progress: 42,
    releaseNotes: notes,
    check,
    download,
    install,
  });
  try {
    await render();
    const snapshot = useUpdateStore.getState(),
      reads = {
        version: vi.mocked(getVersions).mock.calls.length,
        background: vi.mocked(backgroundPreferenceCommands.read.call).mock.calls.length,
      };
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(useUpdateStore.getState()).toBe(snapshot);
      expect(useUpdateStore.getState().releaseNotes).toBe(notes);
      expect({
        version: vi.mocked(getVersions).mock.calls.length,
        background: vi.mocked(backgroundPreferenceCommands.read.call).mock.calls.length,
      }).toEqual(reads);
      expect(check).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(install).not.toHaveBeenCalled();
    }
    useReleaseNotesStore.getState().show(notes, { updateAction: true });
    await act(async () => root.render(<ReleaseNotesDialog />));
    const notice = useReleaseNotesStore.getState();
    for (const locale of ["zh-CN", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(useReleaseNotesStore.getState()).toBe(notice);
      expect(notice.notes).toBe(notes);
      expect(notice.open).toBe(true);
      expect(notice.updateAction).toBe(true);
      expect(download).not.toHaveBeenCalled();
      expect(install).not.toHaveBeenCalled();
    }
  } finally {
    await act(async () => {
      desktopLocaleSource.setLocale(original);
      useReleaseNotesStore.getState().close();
    });
  }
});
