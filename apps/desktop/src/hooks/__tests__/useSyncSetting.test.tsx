import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useSyncSetting from "../useSyncSetting";
import useSettingStore from "@/stores/useSettingStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";

class Channel {
  static latest: Channel;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor() {
    Channel.latest = this;
  }
}
const initial = structuredClone(useSettingStore.getState().setting);
const client = {
  sendRequest: vi.fn(),
  registerNotificationHandler: vi.fn(),
  unregisterNotificationHandler: vi.fn(),
};
let root: Root;
let container: HTMLDivElement;
function Harness() {
  useSyncSetting();
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("BroadcastChannel", Channel);
  vi.stubGlobal("electron", { windowRole: "main" });
  useSettingStore.setState({ setting: structuredClone(initial), inited: false });
  client.sendRequest.mockResolvedValue(structuredClone(initial));
  useBackendWebsocketStore.setState({
    client: client as unknown as NonNullable<
      ReturnType<typeof useBackendWebsocketStore.getState>["client"]
    >,
    isServerReady: true,
  });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  useBackendWebsocketStore.setState({ client: null, isServerReady: false });
  useSettingStore.setState({ setting: structuredClone(initial), inited: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("设置启动职责", () => {
  it("主窗口从后端初始化并向辅助窗口提供快照", async () => {
    await act(async () => root.render(<Harness />));
    expect(client.sendRequest).toHaveBeenCalledTimes(1);
    expect(client.sendRequest).toHaveBeenCalledWith("get-user-setting", null);
    expect(useSettingStore.getState().inited).toBe(true);
    expect(Channel.latest.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "snapshot" })
    );
  });
  it("辅助窗口接收快照后不请求初始化、不回灌，自己的修改仍保存", async () => {
    vi.stubGlobal("electron", { windowRole: "utility" });
    await act(async () => root.render(<Harness />));
    await act(async () => {
      Channel.latest.onmessage?.({ data: { kind: "snapshot", setting: structuredClone(initial) } });
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.sendRequest).not.toHaveBeenCalled();
    expect(client.registerNotificationHandler).toHaveBeenCalledTimes(1);
    await act(async () => {
      useSettingStore.getState().onFontSettingChange({ ...initial.fontSetting, fontSize: 18 });
    });
    expect(client.sendRequest).toHaveBeenCalledTimes(1);
    expect(client.sendRequest.mock.calls[0][0]).toBe("set-user-setting");
  });
});
