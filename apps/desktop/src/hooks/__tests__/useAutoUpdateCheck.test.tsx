import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import useSettingStore from "@/stores/useSettingStore";
import { useUpdateStore } from "@/stores/useUpdateStore";
import useAutoUpdateCheck from "../useAutoUpdateCheck";
const transport = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  change: vi.fn(),
  notify: vi.fn(),
  downloaded: null as ((value: { version: string }) => void) | null,
}));
vi.mock("@/commands/updater", () => ({
  checkForUpdate: transport.check,
  downloadUpdate: transport.download,
  installUpdate: transport.install,
  takeVersionChange: transport.change,
  onUpdateDownloadProgress: () => () => undefined,
  onUpdateDownloaded: (handler: (value: { version: string }) => void) => {
    transport.downloaded = handler;
    return () => {
      transport.downloaded = null;
    };
  },
  onUpdateError: () => () => undefined,
}));
vi.mock("@/features/notifications/notify", () => ({ appNotify: transport.notify }));
const initial = useUpdateStore.getState();
let host: HTMLDivElement, root: Root;
function Probe() {
  useAutoUpdateCheck();
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useUpdateStore.setState(initial, true);
  transport.check.mockResolvedValue({
    available: false,
    currentVersion: "9.0.0",
    version: "9.0.0",
    fallbackUrl: null,
    releaseNotes: [],
  });
  transport.change.mockResolvedValue({ previousVersion: null, currentVersion: "9.0.0" });
  transport.install.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useUpdateStore.setState(initial, true);
  vi.useRealTimers();
});
it("切换语言不重启启动检查的计时，也不额外检查或下载", async () => {
  const originalLocale = desktopLocaleSource.getSnapshot(),
    setting = useSettingStore.getState().setting;
  useSettingStore.setState({
    setting: {
      ...setting,
      misc: { ...setting.misc, update: { ...setting.misc.update, autoCheck: true } },
    },
  });
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => desktopLocaleSource.setLocale("zh-TW"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(transport.check).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(transport.check).toHaveBeenCalledTimes(1);
    await act(async () => desktopLocaleSource.setLocale("en-US"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(transport.check).toHaveBeenCalledTimes(1);
    expect(transport.download).not.toHaveBeenCalled();
    expect(transport.install).not.toHaveBeenCalled();
  } finally {
    await act(async () => desktopLocaleSource.setLocale(originalLocale));
    useSettingStore.setState({ setting });
  }
});
it("已就绪事件只通知一次并保留创建时语言载荷，换语不重放或执行安装", async () => {
  const original = desktopLocaleSource.getSnapshot();
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    useUpdateStore.setState({
      status: "downloading",
      newVersion: "9.0.0",
      autoChecked: true,
      releaseNotes: [{ version: "9.0.0", note: "原始公告" }],
    });
    await act(async () => root.render(<Probe />));
    const delivered = transport.downloaded;
    if (!delivered) throw new Error("下载完成监听未注册");
    await act(async () => delivered({ version: "9.0.0" }));
    expect(transport.notify).toHaveBeenCalledTimes(1);
    const payload = transport.notify.mock.calls[0][0];
    const snapshot = {
      id: payload.id,
      title: payload.title,
      body: payload.body,
      source: payload.source,
      labels: payload.actions.map((action: { label: string }) => action.label),
    };
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(transport.notify).toHaveBeenCalledTimes(1);
      expect({
        id: payload.id,
        title: payload.title,
        body: payload.body,
        source: payload.source,
        labels: payload.actions.map((action: { label: string }) => action.label),
      }).toEqual(snapshot);
      expect(transport.check).not.toHaveBeenCalled();
      expect(transport.download).not.toHaveBeenCalled();
      expect(transport.install).not.toHaveBeenCalled();
    }
    const install = payload.actions.find((action: { primary?: boolean }) => action.primary);
    if (!install) throw new Error("安装动作未注册");
    await act(async () => install.onClick());
    expect(transport.install).toHaveBeenCalledExactlyOnceWith();
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
